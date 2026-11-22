/**
 * Owner: Zaid
 * Purpose: Manage a single retryable camera preview attempt (FR-23).
 */

import type { RawPoseLandmarks } from "../../types/pulse";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";

function stopStreamTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function waitForVideoDimensions(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
  setAbortListener: (fn: (() => void) | null) => void,
): Promise<void> {
  if (isCancelled() || (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const detach = (): void => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      setAbortListener(null);
    };

    const onReady = (): void => {
      if (isCancelled() || (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0)) {
        detach();
        resolve();
      }
    };

    const onError = (): void => {
      detach();
      reject(new Error("Camera video stream failed to load metadata"));
    };

    setAbortListener(() => {
      detach();
      resolve();
    });

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
  });
}

interface PreviewCallbacks {
  onReady(width: number, height: number): void;
  onFrame(raw: RawPoseLandmarks): void;
  onError(error: unknown): void;
}

/** Start a preview and return the cancellation function for this attempt. */
export function startGetReadyCamera(
  video: HTMLVideoElement,
  media: Pick<MediaDevices, "getUserMedia">,
  callbacks: PreviewCallbacks,
): () => void {
  let cancelled = false;
  let activeStream: MediaStream | null = null;
  let stopPoseLoop: (() => void) | null = null;
  let abortMetadataWait: (() => void) | null = null;
  let removeEndedListener: (() => void) | null = null;

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    abortMetadataWait?.();
    removeEndedListener?.();
    try {
      stopPoseLoop?.();
    } catch {
      // A failed pose loop must not prevent release of the camera.
    }
    if (activeStream && video.srcObject === activeStream) video.srcObject = null;
    stopStreamTracks(activeStream);
    activeStream = null;
  }

  function fail(error: unknown): void {
    if (cancelled) return;
    cancel();
    callbacks.onError(error);
  }

  async function startPreview(): Promise<void> {
    try {
      const streamPromise = media.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      }).then((stream) => {
        // getUserMedia has no abort signal. Release a late result without touching the new preview.
        if (cancelled) {
          stopStreamTracks(stream);
          return null;
        }
        activeStream = stream;
        return stream;
      });

      const [stream] = await Promise.all([streamPromise, Promise.resolve().then(initPoseLandmarker)]);
      if (cancelled || !stream) return;

      const track = stream.getVideoTracks()[0];
      if (track) {
        const disconnected = (): void => fail(new DOMException("Camera track ended", "CameraDisconnectedError"));
        if (track.readyState === "ended") return disconnected();
        track.addEventListener("ended", disconnected);
        removeEndedListener = () => track.removeEventListener("ended", disconnected);
      }

      video.srcObject = stream;
      await waitForVideoDimensions(video, () => cancelled, (fn) => {
        abortMetadataWait = fn;
      });
      if (cancelled) return;

      await video.play();
      if (cancelled) return;

      const stop = startPose(video, (raw) => {
        if (cancelled) return;
        try {
          callbacks.onFrame(raw);
        } catch (error) {
          fail(error);
        }
      });
      if (cancelled) return stop();
      stopPoseLoop = stop;
      callbacks.onReady(video.videoWidth, video.videoHeight);
    } catch (error) {
      fail(error);
    }
  }

  void startPreview();
  return cancel;
}
