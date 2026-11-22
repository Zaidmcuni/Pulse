/**
 * Owner: Zaid
 * Purpose: Unit tests for GetReady pure helpers and SSR rendering states (Vitest node environment)
 * Edited: Mohamed (council redesign: Start Dance became "I'm ready")
 * Edited: Mohamed (task 19b, starting heart rate gate)
 * Edited: Mohamed (task 25, dancer chip)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotImplementedError } from "../../contracts/notImplemented";
import { store } from "../../data/store";
import { setActiveMonitor } from "../../hr/activeMonitor";
import { canStartDance } from "../../hr/useStartingHeartRate";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import { GOLDEN_RAW } from "../../mocks/fixtures";
import { perfMs, type HeartRateMonitor, type HeartRateStatus, type PoseFrame } from "../../types/pulse";
import GetReady, {
  classifyCameraError,
  danceArtist,
  formatDanceLabel,
  formatDanceLength,
  getFramingGuidance,
} from "./GetReady";

function makePoseFrame(tracking: "ok" | "uncertain"): PoseFrame {
  return {
    tFrameMs: perfMs(1000),
    segments: {},
    usableRatio: tracking === "ok" ? 1 : 0,
    tracking,
    points: GOLDEN_RAW.landmarks,
  };
}

function renderGetReady(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dance/:id/ready" element={<GetReady />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("classifyCameraError", () => {
  it("classifies permission denied errors with Chrome/Edge address bar instructions", () => {
    for (const name of ["NotAllowedError", "PermissionDeniedError"]) {
      const result = classifyCameraError({ name, message: "Permission denied" });
      expect(result.title.toLowerCase()).toContain("permission");
      expect(result.guidance).toContain("address bar");
      expect(result.guidance).toContain("Retry Camera");
    }
  });

  it("classifies missing camera errors", () => {
    const result = classifyCameraError({ name: "NotFoundError", message: "No device" });
    expect(result.title.toLowerCase()).toContain("no camera");
    expect(result.guidance).toContain("Retry Camera");
  });

  it("classifies camera-in-use errors", () => {
    const result = classifyCameraError({ name: "NotReadableError", message: "Busy" });
    expect(result.title.toLowerCase()).toContain("in use");
    expect(result.guidance.toLowerCase()).toContain("close");
  });

  it("classifies overconstrained and unsupported browser frame callback errors", () => {
    const overconstrained = classifyCameraError({ name: "OverconstrainedError" });
    expect(overconstrained.title.toLowerCase()).toContain("unsupported");
    expect(overconstrained.guidance).toContain("Retry Camera");

    const rvfc = classifyCameraError(new Error("requestVideoFrameCallback is unavailable"));
    expect(rvfc.guidance).toContain("Chrome");
  });

  it("classifies insecure context and unsupported browser errors", () => {
    const insecure = classifyCameraError({
      name: "InsecureContextError",
      message: "navigator.mediaDevices.getUserMedia is unavailable",
    });
    expect(insecure.title.toLowerCase()).toContain("https");
    expect(insecure.guidance).toContain("localhost");

    const security = classifyCameraError({
      name: "SecurityError",
      message: "Only secure contexts are allowed",
    });
    expect(security.title.toLowerCase()).toContain("https");
  });

  it("classifies mid-preview disconnection and NotImplementedError safely", () => {
    const disconnected = classifyCameraError({ name: "CameraDisconnectedError" });
    expect(disconnected.title.toLowerCase()).toContain("disconnected");

    const stubbed = classifyCameraError(new NotImplementedError("initPoseLandmarker"));
    expect(stubbed.title.toLowerCase()).toContain("pose");
    expect(stubbed.guidance).toContain("Retry Camera");
  });

  it("handles unknown and non-object errors gracefully", () => {
    for (const err of [null, undefined, 42, "weird failure", new Error("boom")]) {
      const result = classifyCameraError(err);
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.guidance).toContain("Retry Camera");
    }
  });
});

describe("getFramingGuidance", () => {
  it("provides standing mode copy and reflects null, uncertain, and ok frames", () => {
    const nullResult = getFramingGuidance("standing", null);
    expect(nullResult.inFrame).toBe(false);
    expect(nullResult.guideLabel).toBe("Step back so your full body fits inside the frame.");
    expect(nullResult.statusText).toBe("Step into the guide so the camera can see you");

    const uncertainResult = getFramingGuidance("standing", makePoseFrame("uncertain"));
    expect(uncertainResult.inFrame).toBe(false);
    expect(uncertainResult.statusText).toBe("Step into the guide so the camera can see you");

    const okResult = getFramingGuidance("standing", makePoseFrame("ok"));
    expect(okResult.inFrame).toBe(true);
    expect(okResult.statusText).toBe("You're in frame — ready to dance!");
  });

  it("provides seated desk-framing copy and reflects null, uncertain, and ok frames", () => {
    const nullResult = getFramingGuidance("seated", null);
    expect(nullResult.inFrame).toBe(false);
    expect(nullResult.guideLabel).toBe(
      "Center your torso, shoulders, and arms in the frame — your legs don't need to be visible.",
    );
    expect(nullResult.statusText).toBe("Step into the guide so the camera can see you");

    const uncertainResult = getFramingGuidance("seated", makePoseFrame("uncertain"));
    expect(uncertainResult.inFrame).toBe(false);

    const okResult = getFramingGuidance("seated", makePoseFrame("ok"));
    expect(okResult.inFrame).toBe(true);
    expect(okResult.statusText).toBe("You're in frame — ready to dance!");
  });
});

describe("formatDanceLength", () => {
  it("formats seconds as M:SS", () => {
    expect(formatDanceLength(20)).toBe("0:20");
    expect(formatDanceLength(125)).toBe("2:05");
    expect(formatDanceLength(0)).toBe("0:00");
  });
});

describe("GetReady SSR render states", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    store.setActiveProfile("p-demo");
  });

  it("renders a clear not-found state when dance id is unknown", () => {
    const html = renderGetReady("/dance/does-not-exist/ready");
    expect(html).toContain("Dance not found");
    expect(html).toContain("Back to Dances");
  });

  it("renders dance metadata, cover art, artist, mode badge, Back control, and disabled I'm ready while initializing", () => {
    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain("Fake Arms (mock)");
    expect(html).toContain("PULSE Studio");
    expect(html).toContain("easy");
    expect(html).toContain("0:20");
    expect(html).toContain("Standing");
    expect(html).toContain("Back");
    expect(html).toContain("Starting camera and pose tracker...");
    expect(html).toContain("Retry Camera");
    expect(html).toContain("I’m ready");
    expect(html).toContain("disabled");
    expect(html).toContain("dance-cover");
    expect(html).not.toContain("<img"); // FAKE_DANCE has no coverUrl -> fallback tile

    vi.spyOn(store, "getDance").mockReturnValue({ ...FAKE_DANCE, coverUrl: "/dances/dance1.jpg" });
    const withCoverHtml = renderGetReady("/dance/fake-arms/ready");
    expect(withCoverHtml).toContain('src="/dances/dance1.jpg"');
    expect(withCoverHtml).toContain('alt="Fake Arms (mock) by PULSE Studio cover art"');
  });

  it("tells the dancer about the hands-up start and no longer mentions a hands-up pause (task 24)", () => {
    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain(
      "Tip: raise both hands to start from where you stand. Press Space or the Pause button to pause.",
    );
    expect(html).not.toContain("To pause while dancing");
    // Not eligible yet (camera still starting): the hands-up line and ring text stay hidden.
    expect(html).not.toContain("Or raise both hands above your head to start.");
    expect(html).not.toContain("Keep your hands up to start");
  });

  it("renders the dancer chip with the active dancer's name, and the switch dialog closed (task 25)", () => {
    const profile = store.getActiveProfile();
    expect(profile).toBeDefined();
    const html = renderGetReady("/dance/fake-arms/ready");
    const name = profile!.displayName.replace("'", "&#x27;");
    expect(html).toContain(`aria-label="Switch dancer, now ${name}"`);
    expect(html).toContain("get-ready-dancer-chip");
    expect(html).toContain("· Switch");
    expect(html).not.toContain("quick-switch");
  });

  it("renders title cleanly without dangling separators when dance.artist is omitted or blank", () => {
    expect(danceArtist({ artist: "  Mabel  " })).toBe("Mabel");
    expect(danceArtist({ artist: "   " })).toBeUndefined();
    expect(formatDanceLabel({ title: "Tip Toe", artist: "Jason Derulo" })).toBe("Tip Toe — Jason Derulo");
    expect(formatDanceLabel({ title: "Solo Routine" })).toBe("Solo Routine");
    expect(formatDanceLabel({ title: "Solo Routine", artist: "   " })).toBe("Solo Routine");

    const html = renderGetReady("/dance/fake-arms/ready");
    expect(FAKE_DANCE.artist).toBeDefined();
    expect(html).toContain(FAKE_DANCE.artist!);
    expect(html).not.toContain("undefined");
  });

  it("defaults to Standing mode and shows a profile setup link when no active profile is set", () => {
    store.setActiveProfile("missing-profile");
    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain("Standing");
    expect(html).toContain("Set up profile");
    expect(html).toContain("/profile/setup");
  });

  it("renders Seated mode badge and desk-framing guidance when active profile is seated", () => {
    const demo = store.listProfiles()[0];
    store.saveProfile({ ...demo, id: "p-seated-test", mode: "seated" });
    store.setActiveProfile("p-seated-test");

    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain("Seated");
    expect(html).toContain("your legs don&#x27;t need to be visible");
  });
});

describe("GetReady starting heart rate gate (FR-29)", () => {
  const monitorWith = (status: HeartRateStatus): HeartRateMonitor => ({
    connect: async () => undefined,
    disconnect: () => undefined,
    subscribe: () => () => undefined,
    status: () => status,
  });

  afterEach(() => setActiveMonitor(null));

  it("live watch with no readings yet: shows the measuring panel and a disabled I'm ready", () => {
    setActiveMonitor(monitorWith("live"));
    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain("Measuring resting heart rate");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>I’m ready<\/button>/);
  });

  it("live watch: green Watch connected pill", () => {
    setActiveMonitor(monitorWith("live"));
    const html = renderGetReady("/dance/fake-arms/ready");
    expect(html).toContain('<span class="get-ready-chip is-ok">Watch connected</span>');
    expect(html).not.toContain("No watch connected");
  });

  it("no watch: grey pill, the no-watch line, and the heart rate never blocks I'm ready", () => {
    for (const m of [null, monitorWith("disconnected")]) {
      setActiveMonitor(m);
      const html = renderGetReady("/dance/fake-arms/ready");
      expect(html).toContain('<span class="get-ready-chip">No watch connected</span>');
      expect(html).toContain("No watch connected · points will come from your moves");
      expect(html).not.toContain("Measuring resting heart rate");
      expect(html).not.toContain("imulated");
    }
    expect(canStartDance({ kind: "no-watch" })).toBe(true);
  });
});
