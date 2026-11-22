/**
 * Owner: Mohamed
 * Purpose: Dance screen (/dance/:id/play): wires the pipeline below, HUD, pause, quit, saves SessionResult -> /results/:resultId
 * FRs: FR-06, FR-27, FR-29, FR-30, FR-33, FR-34, FR-35, FR-37
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Pipeline (the ONLY way modules connect):
 *   startPose(video, raw => {
 *     const frame = computePoseFrame(raw, profile.mode);              // Toufic
 *     const tSong = player.heardSongTimeMs(raw.tFrameMs);             // Zaid
 *     const score = scoreFrame(frame, tSong, dance, profile.mode);    // Mohamed
 *   });                                                               // Zaid
 *   heart rate: monitor.subscribe(r => ...) every second -> effortPerSecond + pointsDelta
 */

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactElement } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { CoachCanvas } from "../../coach/CoachCanvas";
import { DanceCover } from "../../components/DanceCover";
import { createSongPlayer } from "../../audio/songPlayer";
import { saveHighlightClip } from "../../clip/highlightStore";
import {
  createHighlightVideoRecorder,
  createOverlayLandmarkRecorder,
  type HighlightVideoRecorder,
} from "../../clip/videoRecorder";
import { CONFIG } from "../../config";
import { saveResultHighlight, store } from "../../data/store";
import { getActiveMonitor } from "../../hr/activeMonitor";
import type { Baseline } from "../../hr/baseline";
import { bestMatchOffsetMs, scoreFrame } from "../../scoring/accuracy";
import { createDanceSession, type HudState } from "../../scoring/session";
import {
  perfMs, songMs, type HeartRateStatus, type MoveRating, type PoseFrame, type SongPlayer,
} from "../../types/pulse";
import { SkeletonOverlay } from "../../vision/SkeletonOverlay";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { createPoseRecorder } from "../../vision/poseRecorder";
import { computePoseFrame } from "../../vision/segments";
import { classifyCameraError, danceArtist, formatDanceLabel } from "./GetReady";
import { debugLines, formatClock, hrBadgeText, playHintText, progressFraction, ratingText, showReconnectBanner } from "./danceHud";
import { handsOverhead, holdFraction, holdSince } from "./pauseGesture";
import "./dance.css";

// UI timings (display only, not scoring thresholds).
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;
const AUDIO_CHECK_MS = 1000;   // "Tap to start the music" if the song clock hasn't moved by then
const HUD_UPDATE_MS = 100;     // ~10 React updates per second
const POPUP_MS = 600;
const CANT_SEE_MS = 2000;
const GO_MS = 700;             // "Dance!" flash when the song starts
const RING_RADIUS = 45;        // pause ring, in a 100 x 100 viewBox
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
export const SEEK_STEP_MS = 10_000;

const SONG_ERROR = "We couldn't load the music for this dance.";

const EMPTY_HUD: HudState = {
  points: 0, accuracyPct: 0, bpm: null, hrSource: "none", hrState: "none", caloriesKcal: 0, status: "dancing",
  debug: { dancerMotion: null, coachMotion: 0, lastBeatScore: null, lastBeatRating: null },
};

type Phase = "loading" | "countdown" | "playing" | "error";
interface ErrorInfo { title: string; guidance: string }

/** Handlers the effect hands to the buttons. */
interface Controls {
  pause(): void;
  resume(): void;
  seekBy(deltaMs: number): void;
  restart(): void;
  exitPractice(): void;
  askQuit(): void;
  keepDancing(): void;
  quit(): void;
  tapToStart(): void;
  reconnect(): void;
}

export type TransportShortcut =
  | { type: "togglePause" }
  | { type: "seek"; deltaMs: number }
  | { type: "restart" };

export interface ShortcutKeyEvent {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function shouldPreventShortcutDefault(e: ShortcutKeyEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return false;
  return (
    e.code === "Space" ||
    e.key === " " ||
    e.code === "ArrowLeft" ||
    e.key === "ArrowLeft" ||
    e.code === "ArrowRight" ||
    e.key === "ArrowRight"
  );
}

export function resolveTransportShortcut(e: ShortcutKeyEvent): TransportShortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return null;
  const lower = e.key.toLowerCase();
  if (e.code === "Space" || e.key === " " || e.code === "KeyK" || lower === "k") {
    return e.repeat ? null : { type: "togglePause" };
  }
  if (e.code === "ArrowLeft" || e.key === "ArrowLeft" || e.code === "KeyJ" || lower === "j") {
    return { type: "seek", deltaMs: -SEEK_STEP_MS };
  }
  if (e.code === "ArrowRight" || e.key === "ArrowRight" || e.code === "KeyL" || lower === "l") {
    return { type: "seek", deltaMs: SEEK_STEP_MS };
  }
  if (e.code === "KeyR" || lower === "r") {
    return e.repeat ? null : { type: "restart" };
  }
  return null;
}

/** #112: plain D (no modifiers, not typing, not held) toggles the scoring debug box. */
export function isDebugToggleKey(e: ShortcutKeyEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isEditableTarget(e.target)) return false;
  return e.code === "KeyD" || e.key.toLowerCase() === "d";
}

/** FR-29: the starting heart rate GetReady passes in router state; null when missing, no watch or invalid. */
function startBaselineFrom(state: unknown): Baseline | null {
  const b = (state as { baseline?: unknown } | null)?.baseline as Partial<Baseline> | null | undefined;
  if (!b || typeof b.bpm !== "number" || !Number.isFinite(b.bpm) || b.bpm <= 0) return null;
  if (b.source !== "measured" && b.source !== "profile") return null;
  return { bpm: b.bpm, source: b.source, readings: typeof b.readings === "number" ? b.readings : 0 };
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
  const location = useLocation();
  const dance = id ? store.getDance(id) : undefined;
  const profile = store.getActiveProfile();
  const [startBaseline] = useState(() => startBaselineFrom(location.state));
  // FR-29: decided once when the dance opens; a watch connecting later doesn't change this dance's scoring.
  const [noWatch] = useState(() => getActiveMonitor()?.status() !== "live");

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [paused, setPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [hud, setHud] = useState<HudState>(() => ({ ...EMPTY_HUD, hrSource: noWatch ? "none" : "ble" }));
  const [clockMs, setClockMs] = useState(0);
  const [popup, setPopup] = useState<{ text: string; key: number; rating: MoveRating } | null>(null);
  const [pauseHold, setPauseHold] = useState(0);
  const [go, setGo] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [hrStatus, setHrStatus] = useState<HeartRateStatus | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [cantSee, setCantSee] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });
  // #112: scoring debug box, toggled with D; on from the start with ?debug=1.
  const [showDebug, setShowDebug] = useState(() => new URLSearchParams(location.search).get("debug") === "1");
  const [debugInfo, setDebugInfo] = useState<{ usableRatio: number | null; offsetMs: number | null }>({ usableRatio: null, offsetMs: null });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latestFrameRef = useRef<PoseFrame | null>(null);
  const playerRef = useRef<SongPlayer | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const pausedRef = useRef(false);
  const playingRef = useRef(false);
  const confirmQuitRef = useRef(false);
  const overheadSinceRef = useRef<number | null>(null);
  const practiceCompleteRef = useRef(false);
  const showDebugRef = useRef(showDebug);
  const offsetMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dance || !profile) return undefined;

    let cancelled = false;
    let cleaned = false;
    let finished = false;
    let started = false;
    let soughtBeforeStart = false;
    let stream: MediaStream | null = null;
    let stopPose: (() => void) | null = null;
    let videoRecorder: HighlightVideoRecorder | null = null;
    let unsubscribe: (() => void) | null = null;
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
    const setPracticeCompleteBoth = (c: boolean): void => {
      practiceCompleteRef.current = c;
      setPracticeComplete(c);
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isDebugToggleKey(e)) {
        showDebugRef.current = !showDebugRef.current;
        setShowDebug(showDebugRef.current);
        return;
      }
      if (!playingRef.current || confirmQuitRef.current || practiceCompleteRef.current) return;
      if (shouldPreventShortcutDefault(e)) e.preventDefault();
      const action = resolveTransportShortcut(e);
      if (!action) return;
      const c = controlsRef.current;
      if (!c) return;
      if (action.type === "togglePause") {
        if (pausedRef.current) c.resume();
        else c.pause();
      } else if (action.type === "seek") {
        c.seekBy(action.deltaMs);
      } else {
        c.restart();
      }
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
      stopPose = null;
      try { videoRecorder?.discard(); } catch { /* ignore */ }
      videoRecorder = null;
      stopTracks(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (started) playerRef.current?.pause();
      unsubscribe?.();
      controlsRef.current = null;
    };

    const fail = (info: ErrorInfo): void => {
      cleanup();
      setError(info);
      setPhase("error");
    };

    const run = async (): Promise<void> => {
      // 3. FR-29: a live watch, or no watch at all (points from moves only).
      const monitor = noWatch ? null : getActiveMonitor();

      // 4. Scoring engine (task 7a owns every rule).
      const session = createDanceSession(dance, profile);
      // FR-29: measured on GetReady; missing (reload, direct link) -> profile.restingHr; ignored with no watch.
      if (noWatch) session.setNoWatch(true);
      else if (startBaseline) session.setBaselineHr(startBaseline.bpm);
      const poseRecorder = createPoseRecorder();
      const overlayRecorder = createOverlayLandmarkRecorder(CONFIG.clipFps);
      unsubscribe = monitor?.subscribe((r) => session.addHeartRate(r)) ?? null;

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
        if (cancelled || finished) return;
        try {
          const frame = computePoseFrame(raw, profile.mode);
          latestFrameRef.current = frame;
          lastFrameAtMs = performance.now();
          // Hands-free pause: both hands above the head, held (keyboard and mouse are out of reach).
          const canPause = playingRef.current && !pausedRef.current && !confirmQuitRef.current && !practiceCompleteRef.current;
          overheadSinceRef.current = canPause
            ? holdSince(overheadSinceRef.current, handsOverhead(frame.points, raw.width / raw.height), lastFrameAtMs)
            : null;
          if (frame.tracking === "uncertain") uncertainSinceMs ??= lastFrameAtMs;
          else uncertainSinceMs = null;
          if (!pausedRef.current && playingRef.current) {
            const tSong = player.heardSongTimeMs(raw.tFrameMs);
            session.addFrameScore(tSong, scoreFrame(frame, tSong, dance, profile.mode));
            session.addPose(tSong, frame.points, raw.width / raw.height); // #112 still detection
            if (showDebugRef.current) offsetMsRef.current = bestMatchOffsetMs(frame, tSong, dance, profile.mode);
            if (!session.isPracticeMode() && tSong >= 0 && tSong <= dance.lengthSec * 1000) {
              overlayRecorder.push(frame, tSong);
              // Replay draws equal x/y scales. Use image-width units on both axes before normalizing.
              const points = frame.points.map((point) => ({ ...point, y: point.y * raw.height / raw.width }));
              poseRecorder.push({ ...frame, points }, tSong);
            }
          }
        } catch {
          // NFR-11: one bad frame never kills the loop.
        }
      });

      const clearPopup = (): void => {
        if (popupTimer) {
          clearTimeout(popupTimer);
          popupTimer = null;
        }
        setPopup(null);
      };

      const showPopup = (rating: MoveRating): void => {
        clearPopup();
        setPopup({ text: ratingText(rating), key: ++popupKey, rating });
        popupTimer = setTimeout(() => { popupTimer = null; setPopup(null); }, POPUP_MS);
      };

      let lastUiMs = -Infinity;
      const loop = (): void => {
        if (cancelled || finished) return;
        rafId = requestAnimationFrame(loop);
        const nowMs = performance.now();
        if (playingRef.current && !pausedRef.current) {
          const { beats } = session.advance(player.songTimeMs(), perfMs(nowMs));
          const last = beats[beats.length - 1];
          if (last) showPopup(last.rating);
        }
        if (nowMs - lastUiMs < HUD_UPDATE_MS) return;
        lastUiMs = nowMs;
        const hold = holdFraction(overheadSinceRef.current, nowMs);
        setPauseHold(hold);
        if (hold >= 1) {
          overheadSinceRef.current = null;
          controlsRef.current?.pause();
        }
        setHud(session.hud(perfMs(nowMs)));
        if (showDebugRef.current) {
          setDebugInfo({ usableRatio: latestFrameRef.current?.usableRatio ?? null, offsetMs: offsetMsRef.current });
        }
        setClockMs(player.songTimeMs());
        setHrStatus(monitor ? monitor.status() : null);
        setCantSee(
          !pausedRef.current &&
            (nowMs - lastFrameAtMs >= CANT_SEE_MS ||
              (uncertainSinceMs !== null && nowMs - uncertainSinceMs >= CANT_SEE_MS)),
        );
      };

      const startVideoRecording = (): HighlightVideoRecorder | null => {
        videoRecorder?.discard();
        videoRecorder = stream
          ? createHighlightVideoRecorder(stream, () => player.songTimeMs())
          : null;
        videoRecorder?.start();
        return videoRecorder;
      };

      const finish = async (completed: boolean): Promise<void> => {
        if (finished || cancelled) return;
        finished = true;
        if (session.isPracticeMode()) {
          overlayRecorder.clear();
          cleanup();
          navigate("/dances", { replace: true });
          return;
        }

        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        try { stopPose?.(); } catch { /* pose loop may have failed mid-init */ }
        stopPose = null;

        let videoResult: { blob: Blob | null; startSongMs: number } = { blob: null, startSongMs: 0 };
        if (completed && videoRecorder) {
          const activeRecorder = videoRecorder;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          try {
            videoResult = await Promise.race([
              activeRecorder.finish(),
              new Promise<{ blob: Blob | null; startSongMs: number }>((resolve) => {
                timeoutId = setTimeout(() => {
                  activeRecorder.discard();
                  resolve({ blob: null, startSongMs: 0 });
                }, 1500);
              }),
            ]);
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
          }
          if (cancelled) return;
          videoRecorder = null;
        } else {
          videoRecorder?.discard();
          videoRecorder = null;
        }

        const result = session.finish({
          completed, id: "r-" + crypto.randomUUID(), createdAtIso: new Date().toISOString(),
        });
        store.saveResult(result); // FR-37
        const poseSamples = poseRecorder.getSamples();
        if (completed) {
          saveResultHighlight(result, dance.lengthSec, poseSamples);
          saveHighlightClip({
            resultId: result.id,
            danceId: dance.id,
            videoBlob: videoResult.blob,
            videoStartSongMs: videoResult.startSongMs,
            overlaySamples: overlayRecorder.getSamples(),
            poseSamples,
            showLandmarks: false,
          });
        } else {
          overlayRecorder.clear();
        }
        cleanup();
        navigate("/results/" + result.id, { replace: true });
      };

      const pausePlayback = (): void => {
        player.pause();
        videoRecorder?.pause();
        session.setPaused(true, perfMs(performance.now()));
        setPausedBoth(true);
        setCantSee(false);
      };

      const resumePlayback = (): void => {
        const nowMs = performance.now();
        lastFrameAtMs = nowMs;
        uncertainSinceMs = null;
        setCantSee(false);
        session.setPaused(false, perfMs(nowMs));
        setPausedBoth(false);
        player.resume();
        videoRecorder?.resume();
      };

      const scheduleAudioCheck = (): void => {
        later(() => {
          if (!cancelled && !pausedRef.current && playingRef.current && player.songTimeMs() <= 0) {
            setNeedsTap(true);
          }
        }, AUDIO_CHECK_MS);
      };

      const startSong = (): void => {
        try {
          player.start();
          started = true;
          startVideoRecording();
        } catch {
          // Shown as "Tap to start the music" below.
        }
        playingRef.current = true;
        setPhase("playing");
        setGo(true);
        later(() => setGo(false), GO_MS);
        scheduleAudioCheck();
      };

      controlsRef.current = {
        pause: pausePlayback,
        resume: resumePlayback,
        seekBy: (deltaMs: number) => {
          if (finished || cancelled || !playingRef.current || practiceCompleteRef.current) return;
          const targetMs = songMs(Math.max(0, Math.min(dance.lengthSec * 1000, player.songTimeMs() + deltaMs)));
          if (!started) soughtBeforeStart = true;
          session.seek(targetMs);
          poseRecorder.clear();
          overlayRecorder.clear();
          videoRecorder?.discard();
          videoRecorder = null;
          setPracticeMode(true);
          clearPopup();
          const nowMs = performance.now();
          lastFrameAtMs = nowMs;
          uncertainSinceMs = null;
          setCantSee(false);
          player.seek(targetMs);
          setClockMs(player.songTimeMs());
          setHud(session.hud(perfMs(nowMs)));
        },
        restart: () => {
          if (finished || cancelled || !playingRef.current) return;
          const nowMs = performance.now();
          clearPopup();
          session.reset();
          poseRecorder.clear();
          overlayRecorder.clear();
          videoRecorder?.discard();
          videoRecorder = null;
          setPracticeMode(false);
          setPracticeCompleteBoth(false);
          setConfirmBoth(false);
          setPausedBoth(false);
          setNeedsTap(false);
          lastFrameAtMs = nowMs;
          uncertainSinceMs = null;
          setCantSee(false);
          player.seek(songMs(0));
          player.resume();
          started = true;
          soughtBeforeStart = false;
          startVideoRecording();
          setClockMs(player.songTimeMs());
          setHud(session.hud(perfMs(nowMs)));
          scheduleAudioCheck();
        },
        exitPractice: () => {
          if (finished || cancelled) return;
          finished = true;
          overlayRecorder.clear();
          cleanup();
          navigate("/dances", { replace: true });
        },
        askQuit: () => { pausePlayback(); setConfirmBoth(true); },
        keepDancing: () => { setConfirmBoth(false); resumePlayback(); },
        quit: () => { void finish(false); },
        tapToStart: () => {
          // Preserve sought position if the dancer already seeked while the audio context was suspended.
          try {
            if (session.isPracticeMode()) {
              const current = player.songTimeMs();
              player.seek(current);
              if (!pausedRef.current && (!started || soughtBeforeStart)) {
                player.resume();
              }
            } else {
              player.start();
              if (!videoRecorder) {
                const recorder = startVideoRecording();
                if (pausedRef.current) recorder?.pause();
              }
            }
            started = true;
            soughtBeforeStart = false;
          } catch {
            return;
          }
          setNeedsTap(false);
        },
        reconnect: () => {
          if (!monitor) return;
          setReconnecting(true);
          monitor.connect().catch(() => undefined).finally(() => setReconnecting(false));
        },
      };

      player.onEnd(() => {
        if (cancelled || finished) return;
        if (session.isPracticeMode()) {
          session.setPaused(true, perfMs(performance.now()));
          setPausedBoth(true);
          setCantSee(false);
          setPracticeCompleteBoth(true);
          return;
        }
        void finish(true);
      });
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
  const artist = danceArtist(dance);
  const hint = playHintText(cantSee, hud.status, profile.mode);

  return (
    <section className="dance-play-page" aria-label={`Dancing ${formatDanceLabel(dance)}`}>
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

      <div className="dance-play-corner is-tl">
        <span className="dance-play-label">Points</span>
        <span className="dance-play-value dance-play-points">{hud.points}</span>
      </div>
      <div className="dance-play-corner is-tr">
        <span className="dance-play-label">Heart rate</span>
        <span className="dance-play-value">
          {hud.bpm ?? "--"} <span className="dance-play-unit">bpm</span>
        </span>
        <span className="badge dance-play-hr-badge">{hrBadgeText(hud.hrSource, hud.hrState)}</span>
        {startBaseline && !noWatch && (
          <span className="dance-play-start">
            Rest {startBaseline.bpm}{startBaseline.source === "profile" ? " (profile)" : ""}
          </span>
        )}
      </div>
      <div className="dance-play-corner is-bl">
        <span className="dance-play-label">Accuracy</span>
        <span className="dance-play-value">{hud.accuracyPct}%</span>
      </div>
      <div className="dance-play-corner is-br">
        <div className="dance-play-song-row">
          <DanceCover title={dance.title} artist={artist} coverUrl={dance.coverUrl} size="sm" />
          <div className="dance-play-song">
            <span>{dance.title}</span>
            {artist && <span className="dance-play-song-artist"> — {artist}</span>}
          </div>
        </div>
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

      {showDebug && (
        <pre className="dance-play-debug" aria-label="Scoring debug">
          {debugLines(hud, debugInfo.usableRatio, debugInfo.offsetMs).join("\n")}
        </pre>
      )}

      {practiceMode && (
        <div
          className="dance-play-practice-banner"
          role="status"
          style={{
            padding: "8px 14px",
            borderRadius: "10px",
            background: "rgba(245, 158, 11, 0.16)",
            border: "1px solid rgba(245, 158, 11, 0.45)",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          Practice Mode — Restart to record an official score
        </div>
      )}

      <div className="dance-play-stage">
        <div className="dance-play-coach">
          <CoachCanvas
            dance={dance}
            getSongTimeMs={() => playerRef.current?.songTimeMs() ?? songMs(0)}
            mode={profile?.mode}
          />
          {profile?.mode === "seated" && (
            <div className="dance-play-mode" aria-label="Seated mode: upper body only">Seated · upper body</div>
          )}
          {phase === "loading" && (
            <div className="dance-play-loading" role="status">Starting camera and music…</div>
          )}
          {phase === "countdown" && <div key={countdown} className="dance-play-countdown">{countdown}</div>}
          {go && <div className="dance-play-go" aria-hidden="true">Dance!</div>}
          {popup && <div key={popup.key} className={`dance-play-popup is-${popup.rating}`}>{popup.text}</div>}
        </div>
        {phase === "playing" && !paused && !practiceComplete && hint && (
          <p className="dance-play-hint" role="status">{hint}</p>
        )}
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

      {/* Transport row (Zaid, FR-34) at top centre; its Pause button shows the hands-up hold as a ring. */}
      {!practiceComplete && (
        <div className="dance-play-controls" style={confirmQuit ? undefined : { zIndex: 7 }}>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Rewind 10 seconds"
            disabled={phase !== "playing"}
            onClick={() => controls()?.seekBy(-SEEK_STEP_MS)}
          >
            -10s
          </button>
          <button
            type="button"
            className="btn btn-secondary dance-play-pause"
            disabled={phase !== "playing"}
            style={{ "--hold": String(pauseHold) } as CSSProperties}
            onClick={() => (paused ? controls()?.resume() : controls()?.pause())}
          >
            {paused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Forward 10 seconds"
            disabled={phase !== "playing"}
            onClick={() => controls()?.seekBy(SEEK_STEP_MS)}
          >
            +10s
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Restart dance"
            disabled={phase !== "playing"}
            onClick={() => controls()?.restart()}
          >
            Restart
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
      )}

      {/* Big centre ring so the hands-up pause reads from across the room. Always mounted while playing
          so it can fade out when the hands drop. */}
      {phase === "playing" && !paused && (
        <div className={`dance-play-ring${pauseHold > 0 ? " is-on" : ""}`} aria-hidden={pauseHold === 0}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="dance-play-ring-track" cx="50" cy="50" r={RING_RADIUS} />
            <circle
              className="dance-play-ring-fill"
              cx="50" cy="50" r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - pauseHold)}
            />
          </svg>
          <p role="status">{pauseHold > 0 ? "Keep your hands up to pause" : ""}</p>
        </div>
      )}

      {needsTap && (
        <button type="button" className="btn btn-primary dance-play-tap" onClick={() => controls()?.tapToStart()}>
          Tap to start the music
        </button>
      )}

      {paused && !confirmQuit && !practiceComplete && (
        <div className="dance-play-modal">
          <div className="card dance-play-card">
            <h2>Paused</h2>
            <p>Walk over when you&rsquo;re ready. The song waits for you.</p>
            <div className="dance-play-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => controls()?.resume()}>Resume</button>
              <button type="button" className="btn btn-secondary" onClick={() => controls()?.askQuit()}>Quit</button>
            </div>
          </div>
        </div>
      )}

      {practiceComplete && (
        <div className="dance-play-modal">
          <div className="card dance-play-card" role="dialog" aria-label="Practice complete">
            <h2>Practice complete</h2>
            <p>Great practice! Restart to record an official score.</p>
            <div className="dance-play-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => controls()?.restart()}>
                Restart for Score
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => controls()?.exitPractice()}>
                Back to Dances
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="dance-play-modal">
          <div className="card dance-play-card" role="dialog" aria-label="Quit this dance?">
            <h2>Quit this dance?</h2>
            <p>
              {practiceMode
                ? "Practice runs aren\u2019t saved to your history."
                : "You\u2019ll keep your time and calories, but this dance won\u2019t earn points."}
            </p>
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
