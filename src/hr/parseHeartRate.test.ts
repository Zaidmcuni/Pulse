/**
 * Owner: Mohamed
 * Purpose: unit tests for parseHeartRate.ts. Contract goldens live in src/contracts/contracts.test.ts; add your own cases here.
 */
import { describe, expect, it } from "vitest";
import { parseHeartRate } from "./parseHeartRate";

const packet = (bytes: number[]): DataView => new DataView(new Uint8Array(bytes).buffer);

describe("parseHeartRate (FR-05)", () => {
  it("reads an 8-bit value", () => {
    expect(parseHeartRate(packet([0x00, 72]))).toBe(72);
    expect(parseHeartRate(packet([0x00, 255]))).toBe(255);
    expect(parseHeartRate(packet([0x00, 0]))).toBe(0);
  });

  it("reads a 16-bit little-endian value", () => {
    expect(parseHeartRate(packet([0x01, 0x48, 0x00]))).toBe(72);
    expect(parseHeartRate(packet([0x01, 0x00, 0x01]))).toBe(256);
  });

  it("ignores the other flag bits", () => {
    expect(parseHeartRate(packet([0x16, 80]))).toBe(80);
    expect(parseHeartRate(packet([0x17, 0x50, 0x00]))).toBe(80);
  });

  it("ignores trailing RR-interval bytes", () => {
    expect(parseHeartRate(packet([0x10, 90, 0x00, 0x04, 0x10, 0x04]))).toBe(90);
  });

  it("reads through a DataView offset into a larger buffer", () => {
    const buf = new Uint8Array([0xff, 0xff, 0x00, 64]).buffer;
    expect(parseHeartRate(new DataView(buf, 2))).toBe(64);
  });

  it("throws on packets that are too short", () => {
    for (const bytes of [[], [0x00], [0x01, 0x48]]) {
      expect(() => parseHeartRate(packet(bytes))).toThrow("Heart rate packet too short");
    }
  });
});
