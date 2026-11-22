/**
 * Owner: Mohamed
 * Purpose: Starting heart rate on the get-ready screen: pure state logic (rolling 10 s window, fallback,
 *          simulated) and the React hook that feeds it from the active monitor
 * FRs: FR-29, FR-06, FR-08
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeartRateStatus, HrReading, PlayerProfile } from "../types/pulse";
import { getActiveMonitor } from "./activeMonitor";
import {
  BASELINE_MIN_READINGS, BASELINE_TIMEOUT_SEC, BASELINE_WINDOW_SEC, computeBaseline, type Baseline,
} from "./baseline";

const WINDOW_MS = BASELINE_WINDOW_SEC * 1000;
const TIMEOUT_MS = BASELINE_TIMEOUT_SEC * 1000;
const TICK_MS = 250; // UI refresh only

export type StartingHrState =
  | { kind: "simulated" }
  | { kind: "measuring"; secondsLeft: number; latestBpm: number | null }
  | { kind: "ready"; baseline: Baseline }
  | { kind: "fallback"; baseline: Baseline };

const isValid = (r: HrReading): boolean => Number.isFinite(r.bpm) && r.bpm > 0;

/** Pure: decides the state from the readings so far. Tested directly. */
export function startingHrState(input: {
  monitorStatus: HeartRateStatus | null;  // null = no active monitor
  readings: readonly HrReading[]; openedAtMs: number; nowMs: number; profile: PlayerProfile;
}): StartingHrState {
  const { monitorStatus, readings, openedAtMs, nowMs, profile } = input;
  if (monitorStatus === null || monitorStatus === "simulated") return { kind: "simulated" };

  const valid = readings.filter((r) => isValid(r) && r.atMs <= nowMs);
  const recent = valid.filter((r) => r.atMs >= nowMs - WINDOW_MS);
  const fallback: StartingHrState = {
    kind: "fallback",
    baseline: { bpm: profile.restingHr, source: "profile", readings: recent.length },
  };
  if (monitorStatus === "disconnected") return fallback;

  const firstAtMs = valid.reduce((min, r) => Math.min(min, r.atMs), Infinity);
  const sinceFirstMs = nowMs - firstAtMs;
  if (Number.isFinite(firstAtMs) && sinceFirstMs >= WINDOW_MS && recent.length >= BASELINE_MIN_READINGS) {
    return { kind: "ready", baseline: computeBaseline(readings, nowMs - WINDOW_MS, nowMs, profile) };
  }
  // Never block the dance on the watch.
  if (nowMs - openedAtMs >= TIMEOUT_MS && recent.length < BASELINE_MIN_READINGS) return fallback;

  const latest = valid.reduce<HrReading | null>((a, r) => (!a || r.atMs >= a.atMs ? r : a), null);
  const secondsLeft = Number.isFinite(firstAtMs)
    ? Math.max(1, Math.ceil((WINDOW_MS - sinceFirstMs) / 1000)) // waits at "1 s" for a 3rd reading
    : BASELINE_WINDOW_SEC;
  return { kind: "measuring", secondsLeft, latestBpm: latest ? latest.bpm : null };
}

export function canStartDance(s: StartingHrState): boolean {
  return s.kind !== "measuring";
}

/** The value handed to the dance: null for simulated; the profile for fallback; otherwise the last 10 s. */
export function finalBaseline(
  s: StartingHrState, readings: readonly HrReading[], nowMs: number, profile: PlayerProfile,
): Baseline | null {
  if (s.kind === "simulated") return null;
  if (s.kind === "fallback") return s.baseline;
  return computeBaseline(readings, nowMs - WINDOW_MS, nowMs, profile);
}

/** React hook: subscribes to getActiveMonitor(), ticks every 250 ms, cleans up on unmount; never disconnects the monitor. */
export function useStartingHeartRate(profile: PlayerProfile | null): {
  state: StartingHrState; getFinalBaseline: () => Baseline | null;
} {
  const readingsRef = useRef<HrReading[]>([]);
  const openedAtRef = useRef(performance.now());
  const settledRef = useRef<StartingHrState | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const compute = useCallback((): StartingHrState => {
    const p = profileRef.current;
    if (!p) return { kind: "simulated" };
    const next = startingHrState({
      monitorStatus: getActiveMonitor()?.status() ?? null,
      readings: readingsRef.current,
      openedAtMs: openedAtRef.current,
      nowMs: performance.now(),
      profile: p,
    });
    // Once "I'm ready" is enabled it stays enabled, even if a late or returning watch would restart measuring.
    if (next.kind === "measuring" && settledRef.current) return settledRef.current;
    if (next.kind === "ready" || next.kind === "fallback") settledRef.current = next;
    return next;
  }, []);

  const [state, setState] = useState<StartingHrState>(compute);

  useEffect(() => {
    readingsRef.current = [];
    openedAtRef.current = performance.now();
    settledRef.current = null;
    const unsubscribe = getActiveMonitor()?.subscribe((r) => { readingsRef.current.push(r); });
    setState(compute());
    const timer = setInterval(() => setState(compute()), TICK_MS);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [profile?.id, compute]);

  const getFinalBaseline = useCallback((): Baseline | null => {
    const p = profileRef.current;
    if (!p) return null;
    return finalBaseline(compute(), readingsRef.current, performance.now(), p);
  }, [compute]);

  return { state, getFinalBaseline };
}
