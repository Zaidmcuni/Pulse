/**
 * Owner: Shared
 * Purpose: Unit & SSR tests for DanceCover image rendering, error fallback, and prop recovery.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DanceCover, formatDanceCoverAlt } from "./DanceCover";

describe("DanceCover", () => {
  afterEach(() => {
    vi.doUnmock("react");
    vi.resetModules();
  });

  it("renders an <img> with exact local src and accessible alt text when coverUrl is provided", () => {
    const html = renderToStaticMarkup(
      <DanceCover title="Don't Call Me Up" artist="Mabel" coverUrl="/dances/dance2.jpg" size="lg" />,
    );
    expect(html).toContain("<img ");
    expect(html).toContain('src="/dances/dance2.jpg"');
    expect(html).toContain('alt="Don&#x27;t Call Me Up by Mabel cover art"');
    expect(html).toContain('loading="lazy"');
    expect(formatDanceCoverAlt("Solo Track")).toBe("Solo Track cover art");
  });

  it("renders the gradient fallback tile directly without an <img> when coverUrl is omitted or blank", () => {
    for (const badUrl of [undefined, "", "   "]) {
      const html = renderToStaticMarkup(<DanceCover title="Legacy Dance" coverUrl={badUrl} size="sm" />);
      expect(html).not.toContain("<img");
      expect(html).toContain('aria-hidden="true">♪</span>');
    }
  });

  it("switches to fallback on img error and recovers when coverUrl updates", async () => {
    vi.resetModules();
    let failedState = false;
    let lastDeps: unknown[] | undefined;
    let pendingEffect: (() => void) | null = null;
    const flushEffect = (): void => {
      const fn = pendingEffect;
      pendingEffect = null;
      fn?.();
    };

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useState: <T,>(_initial: T): [T, (next: T) => void] => [
          failedState as unknown as T,
          (next: T) => { failedState = Boolean(next); },
        ],
        useEffect: (effect: () => void, deps?: unknown[]) => {
          if (!lastDeps || !deps || deps.some((d, i) => !Object.is(d, lastDeps![i]))) {
            lastDeps = deps ? [...deps] : undefined;
            pendingEffect = effect;
          }
        },
      };
    });

    const { DanceCover: TestCover } = await import("./DanceCover");

    const el1 = TestCover({ title: "On The Floor", artist: "Jennifer Lopez", coverUrl: "/dances/dance1.jpg" });
    flushEffect();
    const child1 = el1.props.children as { type: string; props: { src?: string; onError?: () => void } };
    expect(child1.type).toBe("img");
    expect(child1.props.src).toBe("/dances/dance1.jpg");

    // Simulate broken/missing image load
    child1.props.onError?.();
    const el2 = TestCover({ title: "On The Floor", artist: "Jennifer Lopez", coverUrl: "/dances/dance1.jpg" });
    expect(pendingEffect).toBeNull();
    const child2 = el2.props.children as { type: string; props: { children?: string } };
    expect(child2.type).toBe("span");
    expect(child2.props.children).toBe("♪");

    // Updating coverUrl triggers useEffect to reset failed -> false and renders new <img>
    TestCover({ title: "On The Floor", artist: "Jennifer Lopez", coverUrl: "/dances/dance2.jpg" });
    expect(pendingEffect).not.toBeNull();
    flushEffect();
    const el3 = TestCover({ title: "On The Floor", artist: "Jennifer Lopez", coverUrl: "/dances/dance2.jpg" });
    const child3 = el3.props.children as { type: string; props: { src?: string } };
    expect(child3.type).toBe("img");
    expect(child3.props.src).toBe("/dances/dance2.jpg");
  });
});
