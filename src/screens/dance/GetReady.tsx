/**
 * Owner: Zaid
 * Purpose: Get-ready screen (/dance/:id/ready): camera preview + SkeletonOverlay + Start -> /dance/:id/play
 * FRs: FR-23
 * Edited: Mohamed (council redesign: dark stage, status chips, "I'm ready" + auto-start after 3 s in frame)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { store } from "../../data/store";
import { getActiveMonitor } from "../../hr/activeMonitor";
import type { Dance, PoseFrame, PosturalMode } from "../../types/pulse";
import { SkeletonOverlay } from "../../vision/SkeletonOverlay";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { computePoseFrame } from "../../vision/segments";

export type GetReadyStatus = "initializing" | "ready" | "error";

export interface CameraErrorInfo {
  title: string;
  guidance: string;
}

export interface FramingGuidance {
  guideLabel: string;
  statusText: string;
  inFrame: boolean;
}

const FRAMING_STATUS_THROTTLE_MS = 200;
// UI timing, not a scoring threshold: how long the dancer stays in frame before the countdown starts.
const AUTO_START_HOLD_MS = 3000;
const AUTO_START_TICK_MS = 100;
const DEFAULT_ASPECT_RATIO = 16 / 9;

const ERROR_BY_NAME: Record<string, CameraErrorInfo> = {
  NotAllowedError: {
    title: "Camera permission denied",
    guidance:
      "Click the camera or lock icon in Chrome or Edge's address bar, set Camera to Allow, and then click Retry Camera.",
  },
  PermissionDeniedError: {
    title: "Camera permission denied",
    guidance:
      "Click the camera or lock icon in Chrome or Edge's address bar, set Camera to Allow, and then click Retry Camera.",
  },
  NotFoundError: {
    title: "No camera found",
    guidance:
      "Connect or enable a webcam on this device, verify it is available in system settings, and then click Retry Camera.",
  },
  DevicesNotFoundError: {
    title: "No camera found",
    guidance:
      "Connect or enable a webcam on this device, verify it is available in system settings, and then click Retry Camera.",
  },
  NotReadableError: {
    title: "Camera is in use or unavailable",
    guidance:
      "Close any other apps or browser tabs using your webcam (like Zoom, Teams, or Meet), and then click Retry Camera.",
  },
  TrackStartError: {
    title: "Camera is in use or unavailable",
    guidance:
      "Close any other apps or browser tabs using your webcam (like Zoom, Teams, or Meet), and then click Retry Camera.",
  },
  OverconstrainedError: {
    title: "Camera resolution unsupported",
    guidance:
      "Your webcam could not match the requested video constraints. Try reconnecting it or selecting another camera, then click Retry Camera.",
  },
  ConstraintNotSatisfiedError: {
    title: "Camera resolution unsupported",
    guidance:
      "Your webcam could not match the requested video constraints. Try reconnecting it or selecting another camera, then click Retry Camera.",
  },
  CameraDisconnectedError: {
    title: "Camera disconnected",
    guidance:
      "Your webcam stopped sending video during preview. Reconnect your camera and click Retry Camera.",
  },
  NotImplementedError: {
    title: "Pose tracking unavailable yet",
    guidance:
      "The local pose engine or segment module is not ready yet. Please ensure MediaPipe assets are loaded and click Retry Camera.",
  },
};

function makeNamedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function readErrorLike(err: unknown): { name: string; message: string } {
  if (typeof err === "string") return { name: "", message: err };
  if (err && typeof err === "object") {
    const rec = err as { name?: unknown; message?: unknown };
    return {
      name: typeof rec.name === "string" ? rec.name : "",
      message: typeof rec.message === "string" ? rec.message : "",
    };
  }
  return { name: "", message: "" };
}

/** Classifies camera, permission, context, and pose runtime errors into actionable guidance. */
export function classifyCameraError(err: unknown): { title: string; guidance: string } {
  const { name, message } = readErrorLike(err);
  const lower = message.toLowerCase();

  if (
    name === "InsecureContextError" ||
    name === "CameraUnsupportedError" ||
    name === "SecurityError" ||
    lower.includes("getusermedia") ||
    lower.includes("secure context") ||
    lower.includes("https")
  ) {
    return {
      title: "Camera requires HTTPS or localhost",
      guidance:
        "Open PULSE in desktop Chrome or Edge 120+ over https:// or http://localhost so browser camera access is enabled.",
    };
  }

  if (lower.includes("requestvideoframecallback")) {
    return {
      title: "Browser lacks video frame callback support",
      guidance:
        "Use desktop Chrome or Edge 120+ (or Android Chrome) so real-time camera frame timing is supported, then click Retry Camera.",
    };
  }

  if (name && ERROR_BY_NAME[name]) {
    return ERROR_BY_NAME[name];
  }

  return {
    title: "Unable to start camera",
    guidance:
      "Check that your webcam is connected and allowed in Chrome or Edge's address bar, then click Retry Camera.",
  };
}

/** Returns mode-tailored framing copy and encouraging readiness status from the latest PoseFrame. */
export function getFramingGuidance(
  mode: PosturalMode,
  frame: PoseFrame | null,
): { guideLabel: string; statusText: string; inFrame: boolean } {
  const guideLabel =
    mode === "seated"
      ? "Center your torso, shoulders, and arms in the frame — your legs don't need to be visible."
      : "Step back so your full body fits inside the frame.";

  const inFrame = frame !== null && frame.tracking === "ok";
  const statusText = inFrame
    ? "You're in frame — ready to dance!"
    : "Step into the guide so the camera can see you";

  return { guideLabel, statusText, inFrame };
}

/** Formats seconds as M:SS for dance metadata badges. */
export function formatDanceLength(lengthSec: number): string {
  const safeSec = Math.max(0, Math.round(lengthSec));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Returns trimmed artist name when present, or undefined so callers never render dangling separators. */
export function danceArtist(dance: Pick<Dance, "artist">): string | undefined {
  const trimmed = dance.artist?.trim();
  return trimmed ? trimmed : undefined;
}

/** Formats "Title — Artist" when artist is present, or "Title" alone otherwise. */
export function formatDanceLabel(dance: Pick<Dance, "title" | "artist">): string {
  const artist = danceArtist(dance);
  return artist ? `${dance.title} — ${artist}` : dance.title;
}

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

function FramingGuideSvg({ mode }: { mode: PosturalMode }): ReactElement {
  const box = mode === "seated" ? { x: 18, y: 10, w: 64, h: 58, cy: 24, r: 6.5 } : { x: 22, y: 6, w: 56, h: 88, cy: 16, r: 5.5 };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx="4"
        fill="rgba(56, 189, 248, 0.05)"
        stroke="rgba(56, 189, 248, 0.72)"
        strokeWidth="0.7"
        strokeDasharray="2.5 2"
      />
      <circle
        cx="50"
        cy={box.cy}
        r={box.r}
        fill="none"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="0.5"
        strokeDasharray="1.8 1.5"
      />
    </svg>
  );
}

export default function GetReady(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const dance = id ? store.getDance(id) : undefined;
  const profile = store.getActiveProfile();
  const mode: PosturalMode = profile?.mode ?? "standing";

  const [status, setStatus] = useState<GetReadyStatus>("initializing");
  const [retryCount, setRetryCount] = useState<number>(0);
  const [errorInfo, setErrorInfo] = useState<CameraErrorInfo | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(DEFAULT_ASPECT_RATIO);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null);
  const [framing, setFraming] = useState<FramingGuidance>(() => getFramingGuidance(mode, null));

  const [armed, setArmed] = useState(false);
  const [holdFraction, setHoldFraction] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastStatusUpdateMsRef = useRef<number>(-Infinity);

  useEffect(() => {
    setFraming(getFramingGuidance(mode, null));
  }, [mode]);

  useEffect(() => {
    if (!dance) return undefined;

    let cancelled = false;
    let activeStream: MediaStream | null = null;
    let stopPoseLoop: (() => void) | null = null;
    let abortMetadataWait: (() => void) | null = null;
    let removeEndedListener: (() => void) | null = null;

    const teardown = (): void => {
      cancelled = true;
      abortMetadataWait?.();
      abortMetadataWait = null;
      removeEndedListener?.();
      removeEndedListener = null;
      if (stopPoseLoop) {
        try {
          stopPoseLoop();
        } catch {
          // Defensive: avoid throwing from cleanup if pose loop failed mid-init
        }
        stopPoseLoop = null;
      }
      stopStreamTracks(activeStream);
      activeStream = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    cleanupRef.current = teardown;
    setStatus("initializing");
    setErrorInfo(null);
    setPoseFrame(null);
    setFraming(getFramingGuidance(mode, null));
    lastStatusUpdateMsRef.current = -Infinity;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const isInsecure = typeof window !== "undefined" && window.isSecureContext === false;
      setErrorInfo(
        classifyCameraError(
          makeNamedError(
            isInsecure ? "InsecureContextError" : "CameraUnsupportedError",
            "navigator.mediaDevices.getUserMedia is unavailable",
          ),
        ),
      );
      setStatus("error");
      return () => {
        teardown();
        cleanupRef.current = null;
      };
    }

    const startPreview = async (): Promise<void> => {
      const rawStreamPromise = navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      // Convert synchronous throws (e.g. stubbed NotImplementedError) into rejected promises
      const landmarkerPromise = Promise.resolve().then(() => initPoseLandmarker());

      const safeStreamPromise = rawStreamPromise.then((resolved) => {
        if (cancelled) {
          stopStreamTracks(resolved);
          return null;
        }
        activeStream = resolved;
        return resolved;
      });

      // Suppress secondary unhandled rejections if Promise.all fails on the other promise first
      safeStreamPromise.catch(() => undefined);
      landmarkerPromise.catch(() => undefined);

      try {
        const [stream] = await Promise.all([safeStreamPromise, landmarkerPromise]);
        if (cancelled || !stream) return;

        const video = videoRef.current;
        if (!video) {
          teardown();
          return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const onTrackEnded = (): void => {
            if (cancelled) return;
            teardown();
            setErrorInfo(
              classifyCameraError(makeNamedError("CameraDisconnectedError", "Camera track ended")),
            );
            setStatus("error");
          };
          videoTrack.addEventListener("ended", onTrackEnded);
          removeEndedListener = () => videoTrack.removeEventListener("ended", onTrackEnded);
        }

        video.srcObject = stream;
        await waitForVideoDimensions(video, () => cancelled, (fn) => {
          abortMetadataWait = fn;
        });
        if (cancelled) return;

        await video.play();
        if (cancelled) return;

        const width = video.videoWidth > 0 ? video.videoWidth : 1280;
        const height = video.videoHeight > 0 ? video.videoHeight : 720;
        setVideoSize({ width, height });
        setAspectRatio(
          video.videoWidth > 0 && video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : DEFAULT_ASPECT_RATIO,
        );

        let poseFailed = false;
        stopPoseLoop = startPose(video, (raw) => {
          if (cancelled || poseFailed) return;

          let frame: PoseFrame;
          try {
            frame = computePoseFrame(raw, mode);
          } catch (err) {
            poseFailed = true;
            if (cancelled) return;
            teardown();
            setErrorInfo(classifyCameraError(err));
            setStatus("error");
            return;
          }

          setPoseFrame(frame);

          const nowMs = Number.isFinite(raw.tFrameMs) ? raw.tFrameMs : performance.now();
          if (nowMs - lastStatusUpdateMsRef.current >= FRAMING_STATUS_THROTTLE_MS) {
            lastStatusUpdateMsRef.current = nowMs;
            setFraming(getFramingGuidance(mode, frame));
          }
        });

        if (cancelled) {
          teardown();
          return;
        }
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        teardown();
        setErrorInfo(classifyCameraError(err));
        setStatus("error");
      }
    };

    void startPreview();

    return () => {
      teardown();
      cleanupRef.current = null;
    };
  }, [dance?.id, mode, retryCount]);

  // "I'm ready" (a click, so the browser lets the music play) arms auto-start; staying in frame for
  // AUTO_START_HOLD_MS continuously starts the dance. Leaving the frame resets the wait.
  const canAutoStart = armed && status === "ready" && framing.inFrame;
  useEffect(() => {
    setHoldFraction(0);
    if (!canAutoStart || !dance) return undefined;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const fraction = Math.min(1, (performance.now() - startedAt) / AUTO_START_HOLD_MS);
      setHoldFraction(fraction);
      if (fraction >= 1) {
        clearInterval(timer);
        cleanupRef.current?.();
        cleanupRef.current = null;
        navigate(`/dance/${dance.id}/play`);
      }
    }, AUTO_START_TICK_MS);
    return () => clearInterval(timer);
  }, [canAutoStart, dance?.id]);

  if (!dance) {
    return (
      <section className="card" style={{ maxWidth: 640, margin: "2rem auto", textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Dance not found</h1>
        <p style={{ color: "var(--pulse-muted)" }}>
          We could not find a dance matching &ldquo;{id ?? "unknown"}&rdquo;.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/dances")}>
          Back to Dances
        </button>
      </section>
    );
  }

  const leaveTo = (path: string): void => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    navigate(path);
  };
  const artist = danceArtist(dance);

  return (
    <section aria-label="Get ready camera check" className="get-ready-page">
      <header className="get-ready-header">
        <div className="get-ready-title-group">
          <button type="button" className="btn btn-secondary" onClick={() => leaveTo("/dances")}>
            Back
          </button>
          <DanceCover title={dance.title} artist={artist} coverUrl={dance.coverUrl} size="md" />
          <div>
            <h1 className="get-ready-title">{dance.title}</h1>
            {artist && (
              <p style={{ margin: "0.15rem 0 0", color: "var(--pulse-muted)", fontSize: "1rem", fontWeight: 500 }}>
                {artist}
              </p>
            )}
            <div className="get-ready-meta">
              <span className="badge" style={{ textTransform: "capitalize" }}>
                {dance.difficulty}
              </span>
              <span className="badge">{formatDanceLength(dance.lengthSec)}</span>
              <span className="badge">{mode === "seated" ? "Seated" : "Standing"}</span>
            </div>
          </div>
        </div>

        <div className="get-ready-chips" aria-label="Status">
          <span className={`get-ready-chip${status === "ready" && framing.inFrame ? " is-ok" : ""}`}>
            {status === "ready" && framing.inFrame ? "Tracking OK" : "Finding you…"}
          </span>
          <span className="get-ready-chip">
            {getActiveMonitor()?.status() === "live" ? "Heart rate: watch" : "Heart rate: simulated"}
          </span>
        </div>

        {!profile && (
          <div style={{ fontSize: "0.9rem", color: "var(--pulse-muted)" }}>
            Using default Standing mode ·{" "}
            <Link to="/profile/setup" className="get-ready-link">
              Set up profile
            </Link>
          </div>
        )}
      </header>

      <div
        className="get-ready-stage"
        style={{ position: "relative", width: "100%", aspectRatio: String(aspectRatio) }}
      >
        {/* Video is mirrored with scaleX(-1) for natural self-view; SkeletonOverlay receives already-mirrored PoseFrame.points */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            transform: "scaleX(-1)",
            display: "block",
          }}
        />

        <div
          className="get-ready-overlay-layer"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <SkeletonOverlay frame={poseFrame} width={videoSize.width} height={videoSize.height} />
        </div>

        <FramingGuideSvg mode={mode} />

        {status === "ready" && (
          <div role="status" aria-live="polite" className="get-ready-status-row">
            <span
              className={`get-ready-status-pill ${framing.inFrame ? "is-in-frame" : "is-adjusting"}`}
            >
              <span
                aria-hidden="true"
                className="get-ready-status-dot"
                style={{ background: framing.inFrame ? "var(--pulse-ok)" : "var(--pulse-warn)" }}
              />
              {framing.statusText}
            </span>
          </div>
        )}

        {status !== "error" && (
          <div className="get-ready-hint-row">
            <p className="get-ready-hint-text">{framing.guideLabel}</p>
          </div>
        )}

        {status === "initializing" && (
          <div role="status" className="get-ready-cover">
            <strong style={{ fontSize: "1.2rem" }}>Starting camera and pose tracker...</strong>
            <span style={{ color: "var(--pulse-muted)" }}>
              Allow camera access if your browser asks.
            </span>
          </div>
        )}

        {status === "error" && errorInfo && (
          <div role="alert" className="get-ready-cover is-error">
            <h2 style={{ margin: 0, color: "#fca5a5", fontSize: "1.35rem" }}>{errorInfo.title}</h2>
            <p style={{ margin: 0, maxWidth: 540, lineHeight: 1.5 }}>{errorInfo.guidance}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setErrorInfo(null);
                setStatus("initializing");
                setRetryCount((prev) => prev + 1);
              }}
            >
              Retry Camera
            </button>
          </div>
        )}
      </div>

      <div className="get-ready-actions">
        {armed ? (
          <div className="get-ready-armed" role="status" aria-live="polite">
            <strong>{framing.inFrame ? "Hold still… starting soon" : "Step into the frame to start"}</strong>
            <span className="get-ready-hold" aria-hidden="true">
              <span style={{ transform: `scaleX(${holdFraction})` }} />
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary get-ready-start-btn"
            disabled={status !== "ready"}
            onClick={() => {
              if (status === "ready") setArmed(true);
            }}
          >
            I&rsquo;m ready
          </button>
        )}
        <p className="get-ready-tip">
          To pause while dancing, hold both hands above your head for 2 seconds.
        </p>
        <span style={{ fontSize: "0.9rem", color: "var(--pulse-muted)", textAlign: "center" }}>
          No video is saved or leaves your device — pose tracking stays local in your browser.
        </span>
      </div>
    </section>
  );
}
