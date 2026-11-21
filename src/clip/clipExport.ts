/**
 * Owner: Toufic
 * Purpose: Export the replay canvas + song as WebM/MP4 with MediaRecorder
 * FRs: FR-50 (Could)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

const EXPORT_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

const CAPTURE_FPS = 60;
const AUDIO_END_WATCHDOG_MS = 250;

/** Selects the preferred supported MediaRecorder MIME type (MP4 first, then WebM). */
export function selectExportMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }

  for (const mimeType of EXPORT_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return undefined;
}

function resolveAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window !== "undefined" && typeof window.AudioContext === "function") {
    return window.AudioContext;
  }
  if (typeof globalThis.AudioContext === "function") {
    return globalThis.AudioContext;
  }
  return undefined;
}

function stopStreamTracks(stream: MediaStream | null): void {
  if (stream === null) {
    return;
  }
  const tracks =
    typeof stream.getTracks === "function"
      ? stream.getTracks()
      : [
          ...(typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : []),
          ...(typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : []),
        ];
  for (const track of tracks) {
    track.stop();
  }
}

function extractRecorderErrorMessage(event: Event | undefined): string {
  const errObj: unknown = (event as { error?: unknown } | undefined)?.error;
  if (
    typeof errObj === "object" &&
    errObj !== null &&
    "message" in errObj &&
    typeof (errObj as { message?: unknown }).message === "string"
  ) {
    const message = (errObj as { message: string }).message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  const eventMessage = (event as { message?: unknown } | undefined)?.message;
  if (typeof eventMessage === "string" && eventMessage.trim().length > 0) {
    return eventMessage.trim();
  }

  return "MediaRecorder failed during clip export.";
}

/**
 * Exports a highlight clip by capturing the replay canvas at 60 FPS, decoding and slicing
 * the bundled song audio via Web Audio, and muxing both streams through MediaRecorder.
 */
export async function exportClip(
  canvas: HTMLCanvasElement,
  audioUrl: string,
  startSec: number,
  durationSec: number,
): Promise<Blob> {
  if (!Number.isFinite(startSec) || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new RangeError(
      `Invalid clip export window: startSec (${startSec}) and durationSec (${durationSec}) must be finite with durationSec > 0.`,
    );
  }
  if (audioUrl.trim().length === 0) {
    throw new Error("Clip export requires a non-empty audioUrl.");
  }
  if (!canvas || typeof canvas.captureStream !== "function") {
    throw new Error("HTMLCanvasElement.captureStream() is not supported in this browser.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }
  const AudioContextCtor = resolveAudioContextCtor();
  if (!AudioContextCtor) {
    throw new Error("Web Audio AudioContext is not supported in this browser.");
  }

  // Pre-flight fetch and decode before starting recording so video and audio start in sync.
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to load clip audio from "${audioUrl}" (HTTP ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();

  const audioCtx = new AudioContextCtor();
  let source: AudioBufferSourceNode | null = null;
  let videoStream: MediaStream | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let cleanedUp = false;

  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (source !== null) {
      const activeSource = source;
      source = null;
      activeSource.onended = null;
      try {
        activeSource.stop();
      } catch {
        // Ignore if source has not started or already stopped.
      }
      try {
        activeSource.disconnect();
      } catch {
        // Ignore if source is already disconnected.
      }
    }
    stopStreamTracks(videoStream);
    stopStreamTracks(destination?.stream ?? null);
    void audioCtx.close().catch(() => {});
  };

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    destination = audioCtx.createMediaStreamDestination();
    const safeStartSec = Math.max(0, startSec);
    const availableAudioSec = Math.max(0, audioBuffer.duration - safeStartSec);
    const audioPlayDurationSec = Math.min(durationSec, availableAudioSec);

    if (audioPlayDurationSec > 0) {
      source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      // Route only to the recording destination so export stays silent for the user.
      source.connect(destination);
    }

    videoStream = canvas.captureStream(CAPTURE_FPS);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const selectedMimeType = selectExportMimeType();
    const recorder = selectedMimeType
      ? new MediaRecorder(combinedStream, { mimeType: selectedMimeType })
      : new MediaRecorder(combinedStream);

    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let settled = false;
      let stopRequested = false;

      const finishRecording = (): void => {
        if (stopRequested) {
          return;
        }
        stopRequested = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch (err) {
            cleanup();
            if (!settled) {
              settled = true;
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      };

      recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = (): void => {
        cleanup();
        if (settled) {
          return;
        }
        settled = true;
        if (chunks.length === 0) {
          reject(new Error("No media data was recorded."));
          return;
        }
        const mimeType =
          selectedMimeType || recorder.mimeType || chunks[0]?.type || "video/webm";
        resolve(new Blob(chunks, { type: mimeType }));
      };

      recorder.onerror = (event: Event): void => {
        cleanup();
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(extractRecorderErrorMessage(event)));
      };

      try {
        recorder.start();
        if (source !== null) {
          if (audioPlayDurationSec >= durationSec) {
            source.onended = (): void => {
              finishRecording();
            };
            source.start(audioCtx.currentTime, safeStartSec, audioPlayDurationSec);
            if (!stopRequested && !settled) {
              timeoutId = setTimeout(
                finishRecording,
                Math.ceil(durationSec * 1000) + AUDIO_END_WATCHDOG_MS,
              );
            }
          } else {
            source.start(audioCtx.currentTime, safeStartSec, audioPlayDurationSec);
            if (!stopRequested && !settled) {
              timeoutId = setTimeout(finishRecording, Math.ceil(durationSec * 1000));
            }
          }
        } else {
          timeoutId = setTimeout(finishRecording, Math.ceil(durationSec * 1000));
        }
      } catch (err) {
        cleanup();
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}
