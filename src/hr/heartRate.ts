/**
 * Owner: Mohamed
 * Purpose: Web Bluetooth heart-rate monitor (0x180D / 0x2A37) and simulated monitor
 * FRs: FR-04, FR-06, FR-08
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { perfMs, type HeartRateMonitor, type HeartRateStatus, type HrReading } from "../types/pulse";
import { parseHeartRate } from "./parseHeartRate";

// Simulated curve: demo-only shape values (warm-up from ~90 toward ~145 BPM with a small wobble),
// not tuning numbers, so they stay here rather than in CONFIG.
const SIM_START_BPM = 90;
const SIM_RISE_BPM = 55;
const SIM_RISE_TAU_SEC = 40;
const SIM_WOBBLE_BPM = 3;
const SIM_WOBBLE_PERIOD_SEC = 7;
const SIM_TICK_MS = 1000;

type Subscriber = (r: HrReading) => void;

// A subscriber that throws must not stop the others.
function emit(subs: Set<Subscriber>, reading: HrReading): void {
  for (const cb of subs) {
    try {
      cb(reading);
    } catch {
      // ignore: one bad subscriber can't break the stream
    }
  }
}

function subscribeTo(subs: Set<Subscriber>, cb: Subscriber): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

/** FR-04 / FR-06: standard Heart Rate service; remembers the device so connect() reconnects without the picker. */
export function createBleMonitor(): HeartRateMonitor {
  const subs = new Set<Subscriber>();
  let device: BluetoothDevice | null = null;
  let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  let status: HeartRateStatus = "disconnected";

  function onPacket(e: Event): void {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    let bpm: number;
    try {
      bpm = parseHeartRate(value);
    } catch {
      return; // skip bad packets silently
    }
    emit(subs, { bpm, source: "ble", atMs: perfMs(performance.now()) });
  }

  // FR-06: keep device and subscribers so connect() can reconnect; no auto-reconnect.
  function onDisconnected(): void {
    status = "disconnected";
  }

  return {
    async connect() {
      if (typeof navigator === "undefined" || !navigator.bluetooth) {
        const err = new Error("Web Bluetooth is not available in this browser");
        err.name = "NotSupportedError";
        throw err;
      }
      if (status === "live") return;
      if (!device) {
        // Picker errors (e.g. NotFoundError on cancel) propagate unchanged.
        device = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
        device.addEventListener("gattserverdisconnected", onDisconnected);
      }
      try {
        if (!device.gatt) throw new Error("Device has no GATT server");
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService("heart_rate");
        const ch = await service.getCharacteristic("heart_rate_measurement");
        if (ch !== characteristic) {
          characteristic?.removeEventListener("characteristicvaluechanged", onPacket);
          ch.addEventListener("characteristicvaluechanged", onPacket);
          characteristic = ch;
        }
        await ch.startNotifications();
        status = "live";
      } catch (err) {
        status = "disconnected";
        throw err;
      }
    },
    disconnect() {
      try {
        if (device?.gatt?.connected) {
          characteristic?.stopNotifications().catch(() => {});
          device.gatt.disconnect();
        }
      } catch {
        // never throws
      }
      status = "disconnected";
    },
    subscribe(cb) {
      return subscribeTo(subs, cb);
    },
    status() {
      return status;
    },
  };
}

/** Readings carry source "simulated"; status() returns "simulated". */
export function createSimulatedMonitor(): HeartRateMonitor {
  const subs = new Set<Subscriber>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let tSec = 0;

  return {
    async connect() {
      if (timer) return;
      tSec = 0;
      timer = setInterval(() => {
        tSec += 1;
        const bpm = Math.round(
          SIM_START_BPM +
            SIM_RISE_BPM * (1 - Math.exp(-tSec / SIM_RISE_TAU_SEC)) +
            SIM_WOBBLE_BPM * Math.sin(tSec / SIM_WOBBLE_PERIOD_SEC),
        );
        emit(subs, { bpm, source: "simulated", atMs: perfMs(performance.now()) });
      }, SIM_TICK_MS);
    },
    disconnect() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    subscribe(cb) {
      return subscribeTo(subs, cb);
    },
    status() {
      return "simulated";
    },
  };
}
