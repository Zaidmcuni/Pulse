/**
 * Owner: Mohamed
 * Purpose: SSR tests for the dance screen's initial markup (effects don't run in SSR; the live pipeline is checked by hand)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { store } from "../../data/store";
import { FAKE_DANCE } from "../../mocks/fakeDance";
import DancePlay, {
  SEEK_STEP_MS,
  resolveTransportShortcut,
  shouldPreventShortcutDefault,
  type ShortcutKeyEvent,
} from "./DancePlay";

function renderPlay(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dance/:id/play" element={<DancePlay />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeKeyEvent(overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    code: "",
    key: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    target: null,
    ...overrides,
  };
}

describe("DancePlay (SSR)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has no stand-still overlay: the starting heart rate is measured on get-ready (FR-29)", () => {
    expect(renderPlay(`/dance/${FAKE_DANCE.id}/play`)).not.toContain("Stand still");
  });

  it("shows 'Dance not found' with a way back for an unknown id", () => {
    const html = renderPlay("/dance/nope/play");
    expect(html).toContain("Dance not found");
    expect(html).toContain("Back to dances");
  });

  it("renders the HUD labels, song title, artist, and transport controls for a known dance", () => {
    const html = renderPlay(`/dance/${FAKE_DANCE.id}/play`);
    expect(html).toContain("Points");
    expect(html).toContain("Accuracy");
    expect(html).toContain("Heart rate");
    expect(html).toContain("No watch"); // FR-29: no watch -> "No watch" badge, BPM "--"
    expect(html).toContain("--");
    expect(html).not.toContain("Rest ");
    expect(html).not.toContain("imulated");
    expect(html).toContain(FAKE_DANCE.title);
    expect(html).toContain(FAKE_DANCE.artist!);
    expect(html).toContain('aria-label="Rewind 10 seconds"');
    expect(html).toContain(">-10s</button>");
    expect(html).toContain(">Pause</button>");
    expect(html).toContain('aria-label="Forward 10 seconds"');
    expect(html).toContain(">+10s</button>");
    expect(html).toContain('aria-label="Restart dance"');
    expect(html).toContain(">Restart</button>");
    expect(html).toContain(">Quit</button>");
  });

  it("renders song title cleanly without dangling separators when artist/coverUrl is omitted, and renders cover <img> when provided", () => {
    const { artist: _removed, ...noArtistDance } = FAKE_DANCE;
    vi.spyOn(store, "getDance").mockReturnValue(noArtistDance);
    const html = renderPlay(`/dance/${FAKE_DANCE.id}/play`);
    expect(html).toContain(`<span>${FAKE_DANCE.title}</span>`);
    expect(html).not.toContain("dance-play-song-artist");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("undefined");

    vi.mocked(store.getDance).mockReturnValue({ ...FAKE_DANCE, coverUrl: "/dances/dance4.jpg" });
    const withCoverHtml = renderPlay(`/dance/${FAKE_DANCE.id}/play`);
    expect(withCoverHtml).toContain('src="/dances/dance4.jpg"');
  });

  it("has no hands-up pause: the gesture now starts the dance on Get Ready (task 24)", () => {
    expect(renderPlay(`/dance/${FAKE_DANCE.id}/play`)).not.toContain("Keep your hands up to pause");
  });

  it("never shows 'Miss' (NFR-10)", () => {
    for (const path of [`/dance/${FAKE_DANCE.id}/play`, "/dance/nope/play"]) {
      expect(renderPlay(path).toLowerCase()).not.toMatch(/\bmiss\b/);
    }
  });
});

describe("resolveTransportShortcut", () => {
  it("maps Space, K, ArrowLeft, J, ArrowRight, L, and R to transport actions", () => {
    expect(resolveTransportShortcut(makeKeyEvent({ code: "Space", key: " " }))).toEqual({
      type: "togglePause",
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyK", key: "k" }))).toEqual({
      type: "togglePause",
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "ArrowLeft", key: "ArrowLeft" }))).toEqual({
      type: "seek",
      deltaMs: -SEEK_STEP_MS,
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyJ", key: "j" }))).toEqual({
      type: "seek",
      deltaMs: -SEEK_STEP_MS,
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "ArrowRight", key: "ArrowRight" }))).toEqual({
      type: "seek",
      deltaMs: SEEK_STEP_MS,
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyL", key: "l" }))).toEqual({
      type: "seek",
      deltaMs: SEEK_STEP_MS,
    });
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyR", key: "R" }))).toEqual({
      type: "restart",
    });
  });

  it("ignores repeated togglePause/restart keys while allowing held seek keys", () => {
    expect(
      resolveTransportShortcut(makeKeyEvent({ code: "Space", key: " ", repeat: true })),
    ).toBeNull();
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyK", key: "k", repeat: true }))).toBeNull();
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyR", key: "r", repeat: true }))).toBeNull();
    expect(
      resolveTransportShortcut(makeKeyEvent({ code: "ArrowRight", key: "ArrowRight", repeat: true })),
    ).toEqual({ type: "seek", deltaMs: SEEK_STEP_MS });
  });

  it("ignores shortcuts with Ctrl/Meta/Alt modifiers or when typing in editable elements", () => {
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyR", key: "r", ctrlKey: true }))).toBeNull();
    expect(resolveTransportShortcut(makeKeyEvent({ code: "KeyR", key: "r", metaKey: true }))).toBeNull();
    expect(
      resolveTransportShortcut(makeKeyEvent({ code: "ArrowLeft", key: "ArrowLeft", altKey: true })),
    ).toBeNull();

    for (const target of [
      { tagName: "INPUT" },
      { tagName: "textarea" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(
        resolveTransportShortcut(
          makeKeyEvent({ code: "Space", key: " ", target: target as unknown as EventTarget }),
        ),
      ).toBeNull();
      expect(
        shouldPreventShortcutDefault(
          makeKeyEvent({ code: "ArrowLeft", key: "ArrowLeft", target: target as unknown as EventTarget }),
        ),
      ).toBe(false);
    }

    expect(shouldPreventShortcutDefault(makeKeyEvent({ code: "Space", key: " " }))).toBe(true);
    expect(shouldPreventShortcutDefault(makeKeyEvent({ code: "ArrowRight", key: "ArrowRight" }))).toBe(true);
    expect(shouldPreventShortcutDefault(makeKeyEvent({ code: "KeyR", key: "r" }))).toBe(false);
  });
});
