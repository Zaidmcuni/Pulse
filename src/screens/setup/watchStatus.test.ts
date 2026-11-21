/**
 * Owner: Mohamed
 * Purpose: Tests for the watch connect helpers
 * FRs: FR-04, FR-06, FR-08
 */

import { describe, expect, it } from "vitest";
import { classifyConnectError, statusLabel } from "./watchStatus";

function named(name: string): Error {
  const err = new Error("x");
  err.name = name;
  return err;
}

describe("classifyConnectError", () => {
  it("maps NotSupportedError to unsupported", () => {
    expect(classifyConnectError(named("NotSupportedError"))).toBe("unsupported");
  });

  it("maps NotFoundError to not-found", () => {
    expect(classifyConnectError(named("NotFoundError"))).toBe("not-found");
  });

  it("reads the name from a plain object", () => {
    expect(classifyConnectError({ name: "NotFoundError" })).toBe("not-found");
  });

  it("maps anything else to failed", () => {
    expect(classifyConnectError(named("NetworkError"))).toBe("failed");
    expect(classifyConnectError(new Error("boom"))).toBe("failed");
    expect(classifyConnectError("NotFoundError")).toBe("failed");
    expect(classifyConnectError(undefined)).toBe("failed");
    expect(classifyConnectError(null)).toBe("failed");
  });
});

describe("statusLabel", () => {
  it("labels simulated as Simulated", () => {
    expect(statusLabel("simulated", null)).toBe("Simulated");
    expect(statusLabel("simulated", 60)).toBe("Simulated");
  });

  it("labels live as Live with no reading yet or a recent one", () => {
    expect(statusLabel("live", null)).toBe("Live");
    expect(statusLabel("live", 0)).toBe("Live");
    expect(statusLabel("live", 5)).toBe("Live");
  });

  it("labels a stale live watch as waiting", () => {
    expect(statusLabel("live", 5.1)).toBe("Waiting for data…");
  });

  it("labels disconnected as Not connected", () => {
    expect(statusLabel("disconnected", null)).toBe("Not connected");
    expect(statusLabel("disconnected", 1)).toBe("Not connected");
  });
});
