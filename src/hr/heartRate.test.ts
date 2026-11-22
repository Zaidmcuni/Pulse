/**
 * Owner: Mohamed
 * Purpose: tests for the BLE heart-rate monitor
 * FRs: FR-04, FR-06
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HrReading } from "../types/pulse";
import { createBleMonitor } from "./heartRate";

// --- Fake Web Bluetooth -------------------------------------------------------

class FakeCharacteristic extends EventTarget {
  value: DataView | undefined = undefined;
  startNotifications = vi.fn(async () => this);
  stopNotifications = vi.fn(async () => this);
  packet(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

class FakeDevice extends EventTarget {
  char = new FakeCharacteristic();
  gatt = {
    connected: false,
    connect: vi.fn(async () => {
      this.gatt.connected = true;
      return {
        getPrimaryService: async () => ({ getCharacteristic: async () => this.char }),
      };
    }),
    disconnect: vi.fn(() => {
      this.gatt.connected = false;
    }),
  };
  drop(): void {
    this.gatt.connected = false;
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }
}

function stubBluetooth(device: FakeDevice) {
  const requestDevice = vi.fn(async () => device);
  vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
  return requestDevice;
}

describe("createBleMonitor (FR-04, FR-06)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects with NotSupportedError when Web Bluetooth is missing", async () => {
    vi.stubGlobal("navigator", {});
    const m = createBleMonitor();
    await expect(m.connect()).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(m.status()).toBe("disconnected");
  });

  it("propagates the picker's NotFoundError", async () => {
    const err = new DOMException("User cancelled", "NotFoundError");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(async () => Promise.reject(err)) } });
    const m = createBleMonitor();
    await expect(m.connect()).rejects.toBe(err);
    expect(m.status()).toBe("disconnected");
  });

  it("connects, filters on heart_rate and delivers 8- and 16-bit readings", async () => {
    const dev = new FakeDevice();
    const requestDevice = stubBluetooth(dev);
    const m = createBleMonitor();
    const got: HrReading[] = [];
    m.subscribe((r) => got.push(r));
    await m.connect();
    expect(m.status()).toBe("live");
    expect(requestDevice).toHaveBeenCalledWith({ filters: [{ services: ["heart_rate"] }] });
    expect(dev.char.startNotifications).toHaveBeenCalledTimes(1);
    dev.char.packet([0x00, 72]);
    dev.char.packet([0x01, 0x2c, 0x01]);
    expect(got.map((r) => [r.bpm, r.source])).toEqual([
      [72, "ble"],
      [300, "ble"],
    ]);
  });

  it("skips a bad packet and still delivers the next good one", async () => {
    const dev = new FakeDevice();
    stubBluetooth(dev);
    const m = createBleMonitor();
    const got: HrReading[] = [];
    m.subscribe((r) => got.push(r));
    await m.connect();
    expect(() => dev.char.packet([0x00])).not.toThrow();
    dev.char.packet([0x00, 80]);
    expect(got.map((r) => r.bpm)).toEqual([80]);
  });

  it("gattserverdisconnected sets disconnected and keeps subscribers", async () => {
    const dev = new FakeDevice();
    stubBluetooth(dev);
    const m = createBleMonitor();
    const got: HrReading[] = [];
    m.subscribe((r) => got.push(r));
    await m.connect();
    dev.drop();
    expect(m.status()).toBe("disconnected");
    dev.char.packet([0x00, 70]);
    expect(got).toHaveLength(1);
  });

  it("reconnects after a drop without the picker and without duplicate listeners", async () => {
    const dev = new FakeDevice();
    const requestDevice = stubBluetooth(dev);
    const m = createBleMonitor();
    const got: HrReading[] = [];
    m.subscribe((r) => got.push(r));
    await m.connect();
    dev.drop();
    await m.connect();
    expect(m.status()).toBe("live");
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(dev.gatt.connect).toHaveBeenCalledTimes(2);
    dev.char.packet([0x00, 75]);
    expect(got).toHaveLength(1);
    // a second drop still updates status (disconnect listener still attached, once)
    dev.drop();
    expect(m.status()).toBe("disconnected");
  });

  it("connect() while live does not call gatt.connect() again", async () => {
    const dev = new FakeDevice();
    stubBluetooth(dev);
    const m = createBleMonitor();
    await m.connect();
    await m.connect();
    expect(dev.gatt.connect).toHaveBeenCalledTimes(1);
  });

  it("sets disconnected and rejects when a GATT step fails", async () => {
    const dev = new FakeDevice();
    const err = new Error("GATT failed");
    dev.char.startNotifications = vi.fn(async () => Promise.reject(err));
    stubBluetooth(dev);
    const m = createBleMonitor();
    await expect(m.connect()).rejects.toBe(err);
    expect(m.status()).toBe("disconnected");
  });

  it("disconnect() stops notifications and disconnects, never throws", async () => {
    const dev = new FakeDevice();
    stubBluetooth(dev);
    const m = createBleMonitor();
    await m.connect();
    m.disconnect();
    expect(dev.char.stopNotifications).toHaveBeenCalledTimes(1);
    expect(dev.gatt.disconnect).toHaveBeenCalledTimes(1);
    expect(m.status()).toBe("disconnected");
  });

  it("disconnect() doesn't throw when stopNotifications rejects, or before any connect", async () => {
    const dev = new FakeDevice();
    dev.char.stopNotifications = vi.fn(async () => Promise.reject(new Error("nope")));
    stubBluetooth(dev);
    const m = createBleMonitor();
    expect(() => m.disconnect()).not.toThrow();
    await m.connect();
    expect(() => m.disconnect()).not.toThrow();
    await Promise.resolve(); // let the rejection settle (must be caught, not unhandled)
    expect(dev.gatt.disconnect).toHaveBeenCalledTimes(1);
    expect(m.status()).toBe("disconnected");
  });
});
