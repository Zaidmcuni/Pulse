/**
 * Owner: Mohamed
 * Purpose: Dance screen (/dance/:id/play): wires the pipeline below, HUD, pause, quit, saves SessionResult -> /results/:resultId
 * FRs: FR-06, FR-08, FR-30, FR-33, FR-34, FR-35, FR-37
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Pipeline (the ONLY way modules connect):
 *   startPose(video, raw => {
 *     const frame = computePoseFrame(raw, profile.mode);              // Toufic
 *     const tSong = player.heardSongTimeMs(raw.tFrameMs);             // Zaid
 *     const score = scoreFrame(frame, tSong, dance, profile.mode);    // Mohamed
 *   });                                                               // Zaid
 *   heart rate: monitor.subscribe(r => ...) every second -> effortPerSecond + pointsDelta
 */

import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CoachCanvas } from "../../coach/CoachCanvas";
import { createSongPlayer } from "../../audio/songPlayer";
import { saveResultHighlight, store } from "../../data/store";
import { getActiveMonitor } from "../../hr/activeMonitor";
import { createSimulatedMonitor } from "../../hr/heartRate";
import { scoreFrame } from "../../scoring/accuracy";
import { createDanceSession, type HudState } from "../../scoring/session";
import {
  perfMs, songMs, type HeartRateMonitor, type HeartRateStatus, type PoseFrame, type SongPlayer,
} from "../../types/pulse";
import { SkeletonOverlay } from "../../vision/SkeletonOverlay";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { createPoseRecorder } from "../../vision/poseRecorder";
import { computePoseFrame } from "../../vision/segments";
import { classifyCameraError } from "./GetReady";
import { formatClock, hrBadgeText, progressFraction, ratingText, showReconnectBanner } from "./danceHud";
import "./dance.css";

// UI timings (display only, not scoring thresholds).
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;
const AUDIO_CHECK_MS = 1000;   // "Tap to start the music" if the song clock hasn't moved by then
const HUD_UPDATE_MS = 100;     // ~10 React updates per second
const POPUP_MS = 600;
const CANT_SEE_MS = 2000;

const SONG_ERROR = "We couldn't load the music for this dance.";

const EMPTY_HUD: HudState = {
  points: 0, accuracyPct: 0, bpm: null, hrSource: "simulated", hrState: "none", caloriesKcal: 0,
};

type Phase = "loading" | "countdown" | "playing" | "error";
interface ErrorInfo { title: string; guidance: string }

/** Handlers the effect hands to the buttons. */
interface Controls {
  pause(): void;
  resume(): void;
  askQuit(): void;
  keepDancing(): void;
  quit(): void;
  tapToStart(): void;
  reconnect(): void;
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const off = (): void => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = (): void => { off(); resolve(); };
    const onError = (): void => { off(); reject(new Error("Camera video stream failed to load metadata")); };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError);
  });
}

/** Redraws the skeleton on every animation frame without re-rendering the whole screen. */
function LiveSkeleton(props: {
  frameRef: MutableRefObject<PoseFrame | null>; width: number; height: number;
}): ReactElement {
  const { frameRef } = props;
  const [frame, setFrame] = useState<PoseFrame | null>(null);
  useEffect(() => {
    let id = 0;
    const loop = (): void => {
      setFrame(frameRef.current);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [frameRef]);
  return <SkeletonOverlay frame={frame} width={props.width} height={props.height} />;
}

export default function DancePlay(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dance = id ? store.getDance(id) : undefined;
  const profile = store.getActiveProfile();

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [paused, setPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [clockMs, setClockMs] = useState(0);
  const [popup, setPopup] = useState<{ text: string; key: number } | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [hrStatus, setHrStatus] = useState<HeartRateStatus | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [cantSee, setCantSee] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latestFrameRef = useRef<PoseFrame | null>(null);
  const playerRef = useRef<SongPlayer | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const pausedRef = useRef(false);
  const playingRef = useRef(false);
  const confirmQuitRef = useRef(false);

  useEffect(() => {
    if (!dance || !profile) return undefined;

    let cancelled = false;
    let cleaned = false;
    let finished = false;
    let started = false;
    let stream: MediaStream | null = null;
    let stopPose: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let createdMonitor: HeartRateMonitor | null = null;
    let rafId: number | null = null;
    let popupTimer: ReturnType<typeof setTimeout> | null = null;
    let popupKey = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (fn: () => void, ms: number): void => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };

    const setPausedBoth = (p: boolean): void => { pausedRef.current = p; setPaused(p); };
    const setConfirmBoth = (c: boolean): void => { confirmQuitRef.current = c; setConfirmQuit(c); };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!playingRef.current || confirmQuitRef.current) return; // ignored during the countdown
      if (pausedRef.current) controlsRef.current?.resume();
      else controlsRef.current?.pause();
    };
    window.addEventListener("keydown", onKeyDown);

    // Safe to call more than once (finish, error, unmount). Never disconnects the user's watch.
    const cleanup = (): void => {
      cancelled = true;
      if (cleaned) return;
      cleaned = true;
      playingRef.current = false;
      window.removeEventListener("keydown", onKeyDown);
      if (rafId !== null) cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
      timers.clear();
      if (popupTimer) clearTimeout(popupTimer);
      try { stopPose?.(); } catch { /* pose loop may have failed mid-init */ }
      stopTracks(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (started) playerRef.current?.pause();
      unsubscribe?.();
      createdMonitor?.disconnect(); // only the fallback simulator this screen created
      controlsRef.current = null;
    };

    const fail = (info: ErrorInfo): void => {
      cleanup();
      setError(info);
      setPhase("error");
    };

    const run = async (): Promise<void> => {
      // 3. No watch -> simulated, labeled (FR-08).
      let found = getActiveMonitor();
      if (!found) {
        createdMonitor = createSimulatedMonitor();
        found = createdMonitor;
        await createdMonitor.connect();
        if (cancelled) return;
      }
      const monitor = found;

      // 4. Scoring engine (task 7a owns every rule).
      const session = createDanceSession(dance, profile);
      const poseRecorder = createPoseRecorder();
      unsubscribe = monitor.subscribe((r) => session.addHeartRate(r));

      // 5. Camera, pose model and song in parallel.
      const player = createSongPlayer();
      playerRef.current = player;
      const cameraPromise = navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices
            .getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
              audio: false,
            })
            .then((s) => {
              if (cancelled) stopTracks(s);
              else stream = s;
              return s;
            })
        : Promise.reject(new Error("navigator.mediaDevices.getUserMedia is unavailable"));
      const [cam, pose, song] = await Promise.allSettled([
        cameraPromise,
        Promise.resolve().then(() => initPoseLandmarker()),
        player.load(dance),
      ]);
      if (cancelled) return;
      if (cam.status === "rejected") return fail(classifyCameraError(cam.reason));
      if (pose.status === "rejected") return fail(classifyCameraError(pose.reason));
      if (song.status === "rejected") return fail({ title: SONG_ERROR, guidance: "" });

      const video = videoRef.current;
      if (!video) return fail(classifyCameraError(new Error("Camera video element missing")));
      video.srcObject = cam.value;
      await waitForVideoMetadata(video);
      if (cancelled) return;
      await video.play();
      if (cancelled) return;
      setVideoSize({ width: video.videoWidth || 1280, height: video.videoHeight || 720 });

      // 6. The only pose pipeline.
      let lastFrameAtMs = performance.now();
      let uncertainSinceMs: number | null = null;
      stopPose = startPose(video, (raw) => {
        if (cancelled) return;
        try {
          const frame = computePoseFrame(raw, profile.mode);
          latestFrameRef.current = frame;
          lastFrameAtMs = performance.now();
          if (frame.tracking === "uncertain") uncertainSinceMs ??= lastFrameAtMs;
          else uncertainSinceMs = null;
          if (!pausedRef.current && playingRef.current) {
            const tSong = player.heardSongTimeMs(raw.tFrameMs);
            session.addFrameScore(tSong, scoreFrame(frame, tSong, dance, profile.mode));
            if (tSong >= 0 && tSong <= dance.lengthSec * 1000) {
              // Replay draws equal x/y scales. Use image-width units on both axes before normalizing.
              const points = frame.points.map((point) => ({ ...point, y: point.y * raw.height / raw.width }));
              poseRecorder.push({ ...frame, points }, tSong);
            }
          }
        } catch {
          // NFR-11: one bad frame never kills the loop.
        }
      });

      const showPopup = (text: string): void => {
        if (popupTimer) clearTimeout(popupTimer);
        setPopup({ text, key: ++popupKey });
        popupTimer = setTimeout(() => setPopup(null), POPUP_MS);
      };

      let lastUiMs = -Infinity;
      const loop = (): void => {
        if (cancelled) return;
        rafId = requestAnimationFrame(loop);
        const nowMs = performance.now();
        if (playingRef.current && !pausedRef.current) {
          const { beats } = session.advance(player.songTimeMs(), perfMs(nowMs));
          const last = beats[beats.length - 1];
          if (last) showPopup(ratingText(last.rating));
        }
        if (nowMs - lastUiMs < HUD_UPDATE_MS) return;
        lastUiMs = nowMs;
        setHud(session.hud(perfMs(nowMs)));
        setClockMs(player.songTimeMs());
        setHrStatus(monitor.status());
        setCantSee(
          nowMs - lastFrameAtMs >= CANT_SEE_MS ||
            (uncertainSinceMs !== null && nowMs - uncertainSinceMs >= CANT_SEE_MS),
        );
      };

      const finish = (completed: boolean): void => {
        if (finished || cancelled) return;
        finished = true;
        const result = session.finish({
          completed, id: "r-" + crypto.randomUUID(), createdAtIso: new Date().toISOString(),
        });
        store.saveResult(result); // FR-37
        if (completed) saveResultHighlight(result, dance.lengthSec, poseRecorder.getSamples());
        cleanup();
        navigate("/results/" + result.id, { replace: true });
      };

      const startSong = (): void => {
        try {
          player.start();
          started = true;
        } catch {
          // Shown as "Tap to start the music" below.
        }
        playingRef.current = true;
        setPhase("playing");
        later(() => { if (player.songTimeMs() <= 0) setNeedsTap(true); }, AUDIO_CHECK_MS);
      };

      controlsRef.current = {
        pause: () => { player.pause(); setPausedBoth(true); },
        resume: () => { player.resume(); setPausedBoth(false); },
        askQuit: () => { player.pause(); setPausedBoth(true); setConfirmBoth(true); },
        keepDancing: () => { setConfirmBoth(false); player.resume(); setPausedBoth(false); },
        quit: () => finish(false),
        tapToStart: () => {
          // start() (not resume()) also resumes a browser-suspended AudioContext from this click.
          try {
            player.start();
            started = true;
          } catch {
            return;
          }
          setNeedsTap(false);
        },
        reconnect: () => {
          setReconnecting(true);
          monitor.connect().catch(() => undefined).finally(() => setReconnecting(false));
        },
      };

      player.onEnd(() => finish(true));
      rafId = requestAnimationFrame(loop);

      // 7. 3-2-1 countdown, then the song.
      setPhase("countdown");
      const tick = (n: number): void => {
        if (n === 0) return startSong();
        setCountdown(n);
        later(() => tick(n - 1), COUNTDOWN_STEP_MS);
      };
      tick(COUNTDOWN_FROM);
    };

    run().catch((err: unknown) => {
      if (!cancelled) fail(classifyCameraError(err));
    });

    return cleanup;
  }, [dance?.id, profile?.id]);

  if (!dance) {
    return (
      <section className="dance-play-page dance-play-center">
        <div className="card dance-play-card">
          <h1>Dance not found</h1>
          <p>We could not find a dance matching &ldquo;{id ?? "unknown"}&rdquo;.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/dances")}>
            Back to dances
          </button>
        </div>
      </section>
    );
  }
  if (!profile) return <Navigate to="/profile/setup" replace />;

  if (phase === "error" && error) {
    return (
      <section className="dance-play-page dance-play-center">
        <div className="card dance-play-card" role="alert">
          <h1>{error.title}</h1>
          {error.guidance && <p>{error.guidance}</p>}
          <button type="button" className="btn btn-primary" onClick={() => navigate("/dances")}>
            Back to dances
          </button>
        </div>
      </section>
    );
  }

  const controls = (): Controls | null => controlsRef.current;
  const lengthMs = dance.lengthSec * 1000;

  return (
    <section className="dance-play-page" aria-label={`Dancing ${dance.title}`}>
      {showReconnectBanner(hrStatus) && (
        <div className="dance-play-banner" role="alert">
          <span>Reconnect your watch</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={reconnecting}
            onClick={() => controls()?.reconnect()}
          >
            {reconnecting ? "Reconnecting…" : "Reconnect"}
          </button>
        </div>
      )}

      <header className="dance-play-hud">
        <div className="dance-play-stat">
          <span className="dance-play-label">Points</span>
          <span className="dance-play-value">{hud.points}</span>
        </div>
        <div className="dance-play-stat">
          <span className="dance-play-label">Accuracy</span>
          <span className="dance-play-value">{hud.accuracyPct}%</span>
        </div>
        <div className="dance-play-stat">
          <span className="dance-play-label">Heart rate</span>
          <span className="dance-play-value">
            {hud.bpm ?? "--"} <span className="dance-play-unit">bpm</span>
          </span>
          <span className="badge dance-play-hr-badge">{hrBadgeText(hud.hrSource, hud.hrState)}</span>
        </div>
        <div className="dance-play-time">
          <span className="dance-play-clock">
            {formatClock(clockMs)} / {formatClock(lengthMs)}
          </span>
          <div className="dance-play-progress">
            <div
              className="dance-play-progress-fill"
              style={{ width: `${progressFraction(clockMs, dance.lengthSec) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className="dance-play-stage">
        <div className="dance-play-coach">
          <CoachCanvas dance={dance} getSongTimeMs={() => playerRef.current?.songTimeMs() ?? songMs(0)} />
          {phase === "loading" && (
            <div className="dance-play-loading" role="status">Starting camera and music…</div>
          )}
          {phase === "countdown" && <div key={countdown} className="dance-play-countdown">{countdown}</div>}
          {popup && <div key={popup.key} className="dance-play-popup">{popup.text}</div>}
        </div>
        {phase === "playing" && cantSee && <p className="dance-play-hint">Step back so we can see you</p>}
      </div>

      {/* Video mirrored for a natural self-view; PoseFrame.points are already mirrored, so the overlay is not. */}
      <div
        className="dance-play-camera"
        style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}
      >
        <video ref={videoRef} autoPlay playsInline muted className="dance-play-video" />
        <div className="dance-play-overlay">
          <LiveSkeleton frameRef={latestFrameRef} width={videoSize.width} height={videoSize.height} />
        </div>
      </div>

      <div className="dance-play-controls">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={phase !== "playing"}
          onClick={() => (paused ? controls()?.resume() : controls()?.pause())}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={phase !== "playing"}
          onClick={() => controls()?.askQuit()}
        >
          Quit
        </button>
      </div>

      {needsTap && (
        <button type="button" className="btn btn-primary dance-play-tap" onClick={() => controls()?.tapToStart()}>
          Tap to start the music
        </button>
      )}

      {paused && !confirmQuit && (
        <div className="dance-play-modal">
          <div className="card dance-play-card">
            <h2>Paused</h2>
            <div className="dance-play-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => controls()?.resume()}>Resume</button>
              <button type="button" className="btn btn-secondary" onClick={() => controls()?.askQuit()}>Quit</button>
            </div>
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="dance-play-modal">
          <div className="card dance-play-card" role="dialog" aria-label="Quit this dance?">
            <h2>Quit this dance?</h2>
            <p>You&rsquo;ll keep your time and calories, but this dance won&rsquo;t earn points.</p>
            <div className="dance-play-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => controls()?.keepDancing()}>
                Keep dancing
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => controls()?.quit()}>Quit</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
