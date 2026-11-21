/**
 * Owner: Shared (Step 0)
 * Purpose: simulated HeartRateMonitor (rises from 80 toward 150 BPM while connected). Same interface as hr/heartRate.ts.
 */
import { perfMs, type HeartRateMonitor, type HrReading } from "../types/pulse";

export function createFakeHeartRateMonitor(): HeartRateMonitor {
  const subs = new Set<(r: HrReading) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let bpm = 80;
  return {
    async connect() {
      if (timer) return;
      timer = setInterval(() => {
        bpm = Math.min(150, bpm + 1);
        const r: HrReading = { bpm: Math.round(bpm), source: "simulated", atMs: perfMs(performance.now()) };
        subs.forEach((cb) => cb(r));
      }, 1000);
    },
    disconnect() { if (timer) clearInterval(timer); timer = null; },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    status() { return "simulated"; },
  };
}
