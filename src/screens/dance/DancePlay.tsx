/**
 * Owner: Mohamed
 * Purpose: Dance screen (/dance/:id/play): wires the pipeline below, HUD, pause, quit, saves SessionResult -> /results/:resultId
 * FRs: FR-06, FR-21, FR-27, FR-29, FR-30, FR-31, FR-33, FR-34, FR-35, FR-37, NFR-06, NFR-07
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
import { ZONE_LABELS, zoneFor } from "../../health/intensity";
import { getActiveMonitor } from "../../hr/activeMonitor";
import type { Baseline } from "../../hr/baseline";
import { accuracyLevel, bestMatchOffsetMs, scoreFrame } from "../../scoring/accuracy";
import { maxHeartRate } from "../../scoring/effort";
import { scoringTimeMs } from "../../scoring/scoringClock";
import { createDanceSession, type HudState } from "../../scoring/session";
import {
  perfMs, songMs, type HeartRateStatus, type MoveRating, type PoseFrame, type SongPlayer,
} from "../../types/pulse";
import { SkeletonOverlay } from "../../vision/SkeletonOverlay";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { createPoseRecorder } from "../../vision/poseRecorder";
import { computePoseFrame } from "../../vision/segments";
import { classifyCameraError, danceArtist, formatDanceLabel } from "./GetReady";
import {
  LEVEL_TEXT, createTrackingFeedback, debugLines, formatClock, hrBadgeText, nextStreak, progressFraction, ratingText,
  remainingText, showReconnectBanner, trackingHintText, type TrackingFeedback,
} from "./danceHud";
import "./dance.css";

// UI timings (display only, not scoring thresholds).
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1000;
const AUDIO_CHECK_MS = 1000;   // "Tap to start the music" if the song clock hasn't moved by then
const HUD_UPDATE_MS = 100;     // ~10 React updates per second
const POPUP_MS = 600;
const CANT_SEE_MS = 2000;
const GO_MS = 700;             // "Dance!" flash when the song starts
const CONTROLS_HIDE_MS = 3000; // transport row hides after this long without mouse or key input
const KEY_HINT_MS = 3000;      // "Space to pause" shows for the start of the song
const STREAK_MIN = 3;          // FR-31: show "xN streak" from this many Perfect/Good beats in a row
const LEVEL_ORDER = ["bronze", "silver", "gold", "superstar"] as const;
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

function waitForVideoMetadata(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
  setAbort: (fn: (() => void) | null) => void,
): Promise<void> {
  if (isCancelled() || (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const off = (): void => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
      setAbort(null);
    };
    const onReady = (): void => { off(); resolve(); };
    const onError = (): void => { off(); reject(new Error("Camera video stream failed to load metadata")); };
    setAbort(() => { off(); resolve(); });
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
  // Display only: streak, last rating (camera glow), "+N" on points, transport visibility.
  const [streak, setStreak] = useState(0);
  const [lastRating, setLastRating] = useState<MoveRating | null>(null);
  const [gain, setGain] = useState<{ n: number; key: number } | null>(null);
  const [recentInput, setRecentInput] = useState(true);
  const [go, setGo] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [hrStatus, setHrStatus] = useState<HeartRateStatus | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [tracking, setTracking] = useState<TrackingFeedback>("waiting");
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
  const practiceCompleteRef = useRef(false);
  const showDebugRef = useRef(showDebug);
  const offsetMsRef = useRef<number | null>(null);
  const prevPointsRef = useRef(0);

  // "+N" floats up from the points whenever they increase (difference between HUD updates).
  useEffect(() => {
    const diff = hud.points - prevPointsRef.current;
    prevPointsRef.current = hud.points;
    if (diff > 0) setGain((g) => ({ n: diff, key: (g?.key ?? 0) + 1 }));
  }, [hud.points]);

  // Transport row shows on mouse or key input, then hides after CONTROLS_HIDE_MS.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poke = (): void => {
      setRecentInput(true);
      clearTimeout(timer);
      timer = setTimeout(() => setRecentInput(false), CONTROLS_HIDE_MS);
    };
    const events = ["mousemove", "pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, poke));
    poke();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, poke));
    };
  }, []);

  useEffect(() => {
    if (!dance || !profile) return undefined;

    let cancelled = false;
    let cleaned = false;
    let finished = false;
    let started = false;
    let soughtBeforeStart = false;
    let stream: MediaStream | null = null;
    let stopPose: (() => void) | null = null;
    let abortMetadataWait: (() => void) | null = null;
    let videoRecorder: HighlightVideoRecorder | null = null;
    let unsubscribe: (() => void) | null = null;
    let rafId: number | null = null;
    let popupTimer: ReturnType<typeof setTimeout> | null = null;
    let popupKey = 0;
    let streakCount = 0;
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
      abortMetadataWait?.();
      abortMetadataWait = null;
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
      await waitForVideoMetadata(video, () => cancelled, (fn) => {
        abortMetadataWait = fn;
      });
      if (cancelled) return;
      await video.play();
      if (cancelled) return;
      setVideoSize({ width: video.videoWidth || 1280, height: video.videoHeight || 720 });

      // 6. The only pose pipeline.
      const trackingFeedback = createTrackingFeedback(CANT_SEE_MS, performance.now());
      let shownTracking: TrackingFeedback = "waiting";
      setTracking(shownTracking);
      const publishTracking = (feedback: TrackingFeedback): void => {
        if (feedback === shownTracking) return;
        shownTracking = feedback;
        setTracking(feedback);
      };
      const resetTracking = (nowMs: number): void => {
        trackingFeedback.reset(nowMs);
        publishTracking("waiting");
      };
      stopPose = startPose(video, (raw) => {
        if (cancelled || finished) return;
        try {
          const frame = computePoseFrame(raw, profile.mode);
          latestFrameRef.current = frame;
          const nowMs = performance.now();
          trackingFeedback.observe(raw, frame.tracking, nowMs);
          if (!pausedRef.current && playingRef.current) {
            publishTracking(trackingFeedback.read(nowMs));
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

      const resetFeedback = (): void => {
        clearPopup();
        streakCount = 0;
        setStreak(0);
        setLastRating(null);
      };

      const showPopup = (rating: MoveRating): void => {
        clearPopup();
        streakCount = nextStreak(streakCount, rating);
        setStreak(streakCount);
        setLastRating(rating);
        setPopup({ text: ratingText(rating), key: ++popupKey, rating });
        popupTimer = setTimeout(() => { popupTimer = null; setPopup(null); }, POPUP_MS);
      };

      let lastUiMs = -Infinity;
      const loop = (): void => {
        if (cancelled || finished) return;
        rafId = requestAnimationFrame(loop);
        const nowMs = performance.now();
        if (playingRef.current && !pausedRef.current) {
          const { beats } = session.advance(scoringTimeMs(player, perfMs(nowMs)), perfMs(nowMs));
          const last = beats[beats.length - 1];
          if (last) showPopup(last.rating);
        }
        if (nowMs - lastUiMs < HUD_UPDATE_MS) return;
        lastUiMs = nowMs;
        setHud(session.hud(perfMs(nowMs)));
        if (showDebugRef.current) {
          setDebugInfo({ usableRatio: latestFrameRef.current?.usableRatio ?? null, offsetMs: offsetMsRef.current });
        }
        setClockMs(player.songTimeMs());
        setHrStatus(monitor ? monitor.status() : null);
        if (playingRef.current && !pausedRef.current) publishTracking(trackingFeedback.read(nowMs));
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
        publishTracking("waiting");
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

        try {
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
          navigate("/results/" + result.id, { replace: true, state: { justFinished: true } }); // Results shows the badge pop-up only then
        } catch {
          if (!cancelled) {
            fail({
              title: "Could not save your dance result",
              guidance: "Browser storage may be full. Clear space or return to the dance catalogue.",
            });
          }
        }
      };

      const pausePlayback = (): void => {
        player.pause();
        videoRecorder?.pause();
        session.setPaused(true, perfMs(performance.now()));
        setPausedBoth(true);
        publishTracking("waiting");
      };

      const resumePlayback = (): void => {
        const nowMs = performance.now();
        resetTracking(nowMs);
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
        publishTracking(trackingFeedback.read(performance.now()));
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
          resetFeedback();
          const nowMs = performance.now();
          resetTracking(nowMs);
          player.seek(targetMs);
          setClockMs(player.songTimeMs());
          setHud(session.hud(perfMs(nowMs)));
        },
        restart: () => {
          if (finished || cancelled || !playingRef.current) return;
          const nowMs = performance.now();
          resetFeedback();
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
          resetTracking(nowMs);
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
              const wasAtStart = player.songTimeMs() <= 0;
              player.start();
              if (!videoRecorder || wasAtStart) {
                if (wasAtStart) {
                  poseRecorder.clear();
                  overlayRecorder.clear();
                }
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
          monitor
            .connect()
            .catch(() => undefined)
            .finally(() => {
              if (!cancelled) setReconnecting(false);
            });
        },
      };

      player.onEnd(() => {
        if (cancelled || finished) return;
        if (session.isPracticeMode()) {
          session.setPaused(true, perfMs(performance.now()));
          setPausedBoth(true);
          publishTracking("waiting");
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
          {error.guidance && (
            <p>{error.guidance.replace("click Retry Camera", "return to the dance catalogue and try again")}</p>
          )}
          <button type="button" className="btn btn-primary" onClick={() => navigate("/dances")}>
            Back to dances
          </button>
        </div>
      </section>
    );
  }

  const controls = (): Controls | null => controlsRef.current;
  const artist = danceArtist(dance);
  const showReconnect = showReconnectBanner(hrStatus);
  const live = phase === "playing" && !paused && !practiceComplete;
  const hint = live ? trackingHintText(tracking, hud.status, profile.mode) : null;
  const cantSee = live && (tracking === "uncertain" || tracking === "absent");
  const glow = cantSee ? "is-lost" : lastRating ? `is-${lastRating}` : null;
  const showControls = phase !== "playing" || paused || recentInput;

  // Moves meter: the level the recent accuracy maps to; greyed out unless the dancer is dancing.
  const metering = live && hud.status === "dancing";
  const level = accuracyLevel(hud.accuracyPct);
  const levelDots = metering ? LEVEL_ORDER.indexOf(level) + 1 : 0;

  // Heart: pulses at the current BPM, zone word in its colour; "No watch" / "Simulated" by source (NFR-09).
  const hasWatch = hud.hrSource !== "none";
  const zone = hasWatch && hud.bpm !== null ? zoneFor(hud.bpm, maxHeartRate(profile)) : null;
  const zoneText = hud.hrSource === "simulated" ? hrBadgeText(hud.hrSource, hud.hrState) : zone && ZONE_LABELS[zone];

  return (
    <section className="dance-play-page" aria-label={`Dancing ${formatDanceLabel(dance)}`}>
      {/* Top bar: progress, song, time left. */}
      <header className="dance-play-top">
        <div className="dance-play-progress">
          <div
            className="dance-play-progress-fill"
            style={{ width: `${progressFraction(clockMs, dance.lengthSec) * 100}%` }}
          />
        </div>
        <div className="dance-play-top-row">
          <div className="dance-play-song-row">
            <DanceCover title={dance.title} artist={artist} coverUrl={dance.coverUrl} size="sm" />
            <span className="dance-play-song">
              <span>{dance.title}</span>
              {artist && <span className="dance-play-song-artist"> · {artist}</span>}
            </span>
          </div>
          <span className="dance-play-clock">{remainingText(clockMs, dance.lengthSec)}</span>
        </div>
      </header>

      {showDebug && (
        <pre className="dance-play-debug" aria-label="Scoring debug">
          {debugLines(hud, debugInfo.usableRatio, debugInfo.offsetMs).join("\n")}
        </pre>
      )}

      {/* Stage: the coach and you, side by side, same size. */}
      <div className="dance-play-stage">
        <div className="dance-play-tile dance-play-coach">
          <CoachCanvas
            dance={dance}
            getSongTimeMs={() => playerRef.current?.songTimeMs() ?? songMs(0)}
            mode={profile?.mode}
          />
          {profile?.mode === "seated" && (
            <div className="dance-play-mode" aria-label="Seated mode: upper body only">Seated · upper body</div>
          )}
        </div>

        {/* Video mirrored for a natural self-view; PoseFrame.points are already mirrored, so the overlay is not. */}
        <div className={`dance-play-tile dance-play-camera${glow ? ` ${glow}` : ""}`}>
          <video ref={videoRef} autoPlay playsInline muted className="dance-play-video" />
          <div className="dance-play-overlay">
            <LiveSkeleton frameRef={latestFrameRef} width={videoSize.width} height={videoSize.height} />
          </div>
          <div className="dance-play-feedback">
            {popup && (
              <div key={popup.key} className={`dance-play-popup is-${popup.rating}`}>
                <span>{popup.text}</span>
              </div>
            )}
            {streak >= STREAK_MIN && <div className="dance-play-streak">×{streak} streak</div>}
          </div>
          <p className="dance-play-hint" role="status" aria-atomic="true">{hint}</p>
        </div>

        {phase === "loading" && (
          <div className="dance-play-loading" role="status">Starting camera and music…</div>
        )}
        {phase === "countdown" && <div key={countdown} className="dance-play-countdown">{countdown}</div>}
        {go && <div className="dance-play-go" aria-hidden="true">Dance!</div>}
        {phase === "playing" && !paused && clockMs < KEY_HINT_MS && (
          <div className="dance-play-keyhint" aria-hidden="true">Space to pause</div>
        )}
      </div>

      {/* Score strip: points, moves meter, heart (laptops: a column of cards left of the coach, plus time left). */}
      <footer className="dance-play-strip" aria-label="Your score">
        <div className="dance-play-score">
          <span className="dance-play-points">{hud.points.toLocaleString("en-US")}</span>
          <span className="dance-play-unit">pts</span>
          {gain && <span key={gain.key} className="dance-play-gain" aria-hidden="true">+{gain.n}</span>}
        </div>

        <div className={`dance-play-meter ${metering ? `is-${level}` : "is-off"}`}>
          <span className="dance-play-dots" aria-hidden="true">
            {LEVEL_ORDER.map((l, i) => <span key={l} className={i < levelDots ? "is-on" : ""} />)}
          </span>
          <span className="dance-play-level">{metering ? LEVEL_TEXT[level] : "Moves"}</span>
        </div>

        <div className={`dance-play-heart ${zone ? `is-${zone}` : "is-off"}`}>
          <svg
            className="dance-play-heart-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={hasWatch && hud.bpm ? { animationDuration: `${60 / hud.bpm}s` } : { animation: "none" }}
          >
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 2.9 4.5 6.6 4.5c2.2 0 3.9 1.2 5.4 3.1 1.5-1.9 3.2-3.1 5.4-3.1 3.7 0 5.7 4 4.2 7.3C19.5 16.4 12 21 12 21z" />
          </svg>
          {hasWatch ? (
            <>
              <span className="dance-play-bpm">{hud.bpm ?? "--"}</span>
              {zoneText && <span className="dance-play-zone">{zoneText}</span>}
            </>
          ) : (
            <span className="dance-play-zone">{hrBadgeText(hud.hrSource, hud.hrState)}</span>
          )}
        </div>

        <div className="dance-play-time" aria-label={remainingText(clockMs, dance.lengthSec)}>
          {formatClock(dance.lengthSec * 1000 - clockMs)}
        </div>
      </footer>

      {/* Transport row (Zaid, FR-34): hides while dancing, shows on mouse or key input. */}
      {!practiceComplete && (
        <div
          className={`dance-play-controls${showControls ? "" : " is-hidden"}`}
          style={confirmQuit ? undefined : { zIndex: 7 }}
        >
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

      {(showReconnect || practiceMode) && (
        <div className="dance-play-notices">
          {showReconnect && (
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
          {practiceMode && (
            <div className="dance-play-practice-banner" role="status">
              Practice Mode — Restart to record an official score
            </div>
          )}
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
            <p>Take your time. The song waits for you.</p>
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
                : noWatch
                  ? "You’ll keep your dance time. Points are awarded for completed dances."
                  : "You’ll keep your dance time and any estimated calories. Points are awarded for completed dances."}
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
