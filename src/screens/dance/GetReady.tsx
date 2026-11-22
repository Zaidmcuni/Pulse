/**
 * Owner: Zaid
 * Purpose: Get-ready screen (/dance/:id/ready): camera preview + SkeletonOverlay + Start -> /dance/:id/play
 * FRs: FR-23
 * Edited: Mohamed (council redesign: dark stage, status chips, "I'm ready" + auto-start after 3 s in frame)
 * Edited: Mohamed (task 19b, starting heart rate gate)
 * Edited: Mohamed (task 24, hands-up start, 1 s auto-start)
 * Edited: Mohamed (task 25, dancer chip + quick switch; a switch remounts the screen for the new dancer)
 * Edited: Mohamed (D8 redesign: one big instruction on the camera, one-line header, no repeated status)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { store } from "../../data/store";
import { getActiveMonitor } from "../../hr/activeMonitor";
import { StartingHeartRatePanel } from "../../hr/StartingHeartRatePanel";
import { canStartDance, useStartingHeartRate } from "../../hr/useStartingHeartRate";
import type { Dance, PoseFrame, PosturalMode } from "../../types/pulse";
import { SkeletonOverlay } from "../../vision/SkeletonOverlay";
import { computePoseFrame } from "../../vision/segments";
import { QuickSwitchDialog } from "../setup/QuickSwitchDialog";
import { initialOf } from "../setup/switcherHelpers";
import { startGetReadyCamera } from "./getReadyCamera";
import { HANDS_UP_START_MS, handsOverhead, holdFraction, holdSince } from "./handsUpGesture";
import "./dance.css";

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
const AUTO_START_HOLD_MS = 1000;
const AUTO_START_TICK_MS = 100;
const DEFAULT_ASPECT_RATIO = 16 / 9;
const RING_RADIUS = 45; // hands-up ring, in a 100 x 100 viewBox
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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

function FramingGuideSvg({ mode, inFrame }: { mode: PosturalMode; inFrame: boolean }): ReactElement {
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
        fill={inFrame ? "rgba(74, 222, 128, 0.06)" : "rgba(56, 189, 248, 0.05)"}
        stroke={inFrame ? "rgba(74, 222, 128, 0.9)" : "rgba(56, 189, 248, 0.72)"}
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

/** The single instruction shown on the camera for the current state (one at a time, readable from 3 m). */
export function instructionFor(mode: PosturalMode, inFrame: boolean, readyToRaise: boolean): string {
  if (!inFrame) return mode === "seated" ? "Sit back so we can see your arms and shoulders" : "Step back so we can see all of you";
  return readyToRaise ? "Raise both hands to start" : "Perfect, stay there";
}

function WatchIcon({ live }: { live: boolean }): ReactElement {
  return (
    <span
      className={`get-ready-watch${live ? " is-live" : ""}`}
      role="img"
      aria-label={live ? "Watch connected" : "No watch connected"}
      title={live ? "Watch connected" : "No watch connected"}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6.5" y="6" width="11" height="12" rx="3" />
        <path d="M9 6l.6-3h4.8L15 6M9 18l.6 3h4.8l.6-3M12 9.5V12l1.8 1.2" />
      </svg>
      <span className="get-ready-watch-dot" aria-hidden="true" />
    </span>
  );
}

/** Keyed by the active profile: a quick switch remounts the screen, so mode, framing, the resting
 *  heart rate and "I'm ready" all start fresh for the new dancer (no reload: keeps audio permission). */
export default function GetReady(): ReactElement {
  const [profileId, setProfileId] = useState<string>(() => store.getActiveProfile()?.id ?? "");
  return <GetReadyScreen key={profileId} onSwitched={setProfileId} />;
}

function GetReadyScreen({ onSwitched }: { onSwitched(profileId: string): void }): ReactElement {
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
  const startingHr = useStartingHeartRate(profile); // FR-29
  const canStart = status === "ready" && canStartDance(startingHr.state);
  const [armedFraction, setArmedFraction] = useState(0);
  const [handsUpFraction, setHandsUpFraction] = useState(0);
  const [switching, setSwitching] = useState(false); // quick switch dialog open: nothing starts

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastStatusUpdateMsRef = useRef<number>(-Infinity);
  const handsUpSinceRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    setFraming(getFramingGuidance(mode, null));
  }, [mode]);

  useEffect(() => {
    if (!dance || !videoRef.current) return undefined;

    setStatus("initializing");
    setErrorInfo(null);
    setPoseFrame(null);
    setFraming(getFramingGuidance(mode, null));
    lastStatusUpdateMsRef.current = -Infinity;

    const showError = (error: unknown): void => {
      setErrorInfo(classifyCameraError(error));
      setStatus("error");
    };

    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) {
      const isInsecure = typeof window !== "undefined" && window.isSecureContext === false;
      showError(
        makeNamedError(
          isInsecure ? "InsecureContextError" : "CameraUnsupportedError",
          "navigator.mediaDevices.getUserMedia is unavailable",
        ),
      );
      return undefined;
    }

    const teardown = startGetReadyCamera(videoRef.current, media, {
      onReady: (width, height) => {
        setVideoSize({ width: width || 1280, height: height || 720 });
        setAspectRatio(width > 0 && height > 0 ? width / height : DEFAULT_ASPECT_RATIO);
        setStatus("ready");
      },
      onFrame: (raw) => {
        const frame = computePoseFrame(raw, mode);
        setPoseFrame(frame);

        const nowMs = Number.isFinite(raw.tFrameMs) ? raw.tFrameMs : performance.now();
        // Hands-free start (NFR-07): mirroring doesn't matter, the check only uses y and shoulder span.
        handsUpSinceRef.current = holdSince(
          handsUpSinceRef.current,
          handsOverhead(frame.points, raw.width / raw.height),
          nowMs,
        );
        if (nowMs - lastStatusUpdateMsRef.current >= FRAMING_STATUS_THROTTLE_MS) {
          lastStatusUpdateMsRef.current = nowMs;
          setFraming(getFramingGuidance(mode, frame));
        }
      },
      onError: showError,
    });
    cleanupRef.current = teardown;

    return () => {
      teardown();
      if (cleanupRef.current === teardown) cleanupRef.current = null;
    };
  }, [dance?.id, mode, retryCount]);

  // Both start paths (button + hands-up) go through here; startedRef stops a second navigation.
  const startDance = (): void => {
    if (!dance || startedRef.current) return;
    startedRef.current = true;
    cleanupRef.current?.();
    cleanupRef.current = null;
    navigate(`/dance/${dance.id}/play`, { state: { baseline: startingHr.getFinalBaseline() } });
  };

  // "I'm ready" (a click, so the browser lets the music play) arms auto-start; staying in frame for
  // AUTO_START_HOLD_MS continuously starts the dance. Leaving the frame resets the wait.
  const canAutoStart = armed && status === "ready" && framing.inFrame && !switching;
  useEffect(() => {
    setArmedFraction(0);
    if (!canAutoStart || !dance) return undefined;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const fraction = Math.min(1, (performance.now() - startedAt) / AUTO_START_HOLD_MS);
      setArmedFraction(fraction);
      if (fraction >= 1) {
        clearInterval(timer);
        startDance();
      }
    }, AUTO_START_TICK_MS);
    return () => clearInterval(timer);
  }, [canAutoStart, dance?.id]);

  // Hands-up start (FR-23, NFR-07): once eligible, both hands above the head for HANDS_UP_START_MS
  // starts the dance from where the dancer stands. No "I'm ready" click needed.
  const eligible = canStart && framing.inFrame && !switching;
  useEffect(() => {
    handsUpSinceRef.current = null;
    setHandsUpFraction(0);
    if (!eligible || !dance) return undefined;
    const timer = setInterval(() => {
      const fraction = holdFraction(handsUpSinceRef.current, performance.now(), HANDS_UP_START_MS);
      setHandsUpFraction(fraction);
      if (fraction >= 1) {
        clearInterval(timer);
        startDance();
      }
    }, AUTO_START_TICK_MS);
    return () => {
      clearInterval(timer);
      setHandsUpFraction(0);
    };
  }, [eligible, dance?.id]);

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
          <DanceCover title={dance.title} artist={artist} coverUrl={dance.coverUrl} size="sm" />
          <div className="get-ready-title-text">
            <h1 className="get-ready-title">{dance.title}</h1>
            <p className="get-ready-meta-line">
              {[artist, dance.difficulty, formatDanceLength(dance.lengthSec), mode === "seated" ? "Seated" : "Standing"]
                .filter((part): part is string => Boolean(part))
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="get-ready-chips" aria-label="Status">
          {profile && (
            <button
              type="button"
              className="get-ready-dancer-chip"
              aria-label={`Switch dancer, now ${profile.displayName}`}
              aria-haspopup="dialog"
              onClick={() => setSwitching(true)}
            >
              <span className="get-ready-dancer-avatar" aria-hidden="true">{initialOf(profile.displayName)}</span>
              <span>{profile.displayName}</span>
              <span className="get-ready-dancer-hint" aria-hidden="true">· Switch</span>
            </button>
          )}
          <WatchIcon live={getActiveMonitor()?.status() === "live"} />
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
        style={{ position: "relative", width: `min(100%, calc((100dvh - 14.5rem) * ${aspectRatio}))`, aspectRatio: String(aspectRatio) }}
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

        <FramingGuideSvg mode={mode} inFrame={status === "ready" && framing.inFrame} />

        <StartingHeartRatePanel state={startingHr.state} />

        {status === "ready" && handsUpFraction === 0 && (
          <div className="get-ready-instruction-row">
            <p role="status" aria-live="polite" className={`get-ready-instruction${framing.inFrame ? " is-in-frame" : ""}`}>
              {instructionFor(mode, framing.inFrame, eligible && !armed)}
            </p>
          </div>
        )}

        <div className={`hands-up-ring${handsUpFraction > 0 ? " is-on" : ""}`} aria-hidden={handsUpFraction === 0}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="hands-up-ring-track" cx="50" cy="50" r={RING_RADIUS} />
            <circle
              className="hands-up-ring-fill"
              cx="50"
              cy="50"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - handsUpFraction)}
            />
          </svg>
          <p role="status">{handsUpFraction > 0 ? "Keep your hands up to start" : ""}</p>
        </div>

        {status !== "ready" && (
          <div className={`get-ready-cover${status === "error" ? " is-error" : ""}`}>
            {errorInfo ? (
              <div role="alert">
                <h2 style={{ margin: 0, color: "#fca5a5", fontSize: "1.35rem" }}>{errorInfo.title}</h2>
                <p style={{ margin: "0.5rem 0 0", maxWidth: 540, lineHeight: 1.5 }}>{errorInfo.guidance}</p>
              </div>
            ) : (
              <div role="status">
                <strong style={{ display: "block", fontSize: "1.2rem" }}>Starting camera and pose tracker...</strong>
                <span style={{ color: "var(--pulse-muted)" }}>
                  Allow camera access if your browser asks.
                </span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                cleanupRef.current?.();
                cleanupRef.current = null;
                setArmed(false);
                setStatus("initializing");
                setErrorInfo(null);
                setRetryCount((prev) => prev + 1);
              }}
            >
              Retry Camera
            </button>
          </div>
        )}
      </div>

      <QuickSwitchDialog open={switching} onClose={() => setSwitching(false)} onSwitched={onSwitched} />

      <div className="get-ready-actions">
        {armed ? (
          <div className="get-ready-armed" aria-hidden="true">
            <span className="get-ready-hold">
              <span style={{ transform: `scaleX(${armedFraction})` }} />
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary get-ready-start-btn"
            disabled={!canStart}
            onClick={() => {
              if (canStart) setArmed(true);
            }}
          >
            I&rsquo;m ready
          </button>
        )}
        <p className="get-ready-privacy">🔒 Video never leaves this laptop</p>
      </div>
    </section>
  );
}
