/**
 * Owner: Mohamed
 * Purpose: Web Bluetooth heart-rate monitor (0x180D / 0x2A37)
 * FRs: FR-04, FR-06
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { perfMs, type HeartRateMonitor, type HeartRateStatus, type HrReading } from "../types/pulse";
import { parseHeartRate } from "./parseHeartRate";

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
