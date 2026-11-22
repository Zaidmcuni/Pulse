/**
 * Owner: Toufic
 * Purpose: Download a synchronized side-by-side (or silhouette fallback) highlight from Results (FR-50).
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ResultHighlight } from "../data/store";
import { exportClip, exportHighlight } from "./clipExport";

export function HighlightDownload({
  highlight,
  audioUrl,
  getCanvas,
  onRecordingStart,
}: {
  highlight: ResultHighlight;
  audioUrl: string;
  getCanvas?: () => HTMLCanvasElement | null;
  onRecordingStart?: () => void;
}): ReactElement {
  const recording = useRef<AbortController>();
  const downloadUrl = useRef<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    recording.current?.abort();
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
  }, []);

  async function download(): Promise<void> {
    if (recording.current) return;
    const controller = new AbortController();
    recording.current = controller;
    setBusy(true);
    setError("");

    try {
      const { samples, startSec, durationSec } = highlight;
      const canvas = getCanvas?.();
      const blob = canvas
        ? await exportClip(canvas, audioUrl, startSec, durationSec, {
            onRecordingStart,
            signal: controller.signal,
          })
        : await exportHighlight(samples, audioUrl, startSec, durationSec, controller.signal);
      if (controller.signal.aborted) return;

      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(blob);
      downloadUrl.current = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = blob.type.startsWith("video/mp4") ? "pulse-highlight.mp4" : "pulse-highlight.webm";
      document.body.append(link);
      link.click();
      link.remove();
    } catch {
      if (!controller.signal.aborted) setError("Could not export the highlight. Try again.");
    } finally {
      recording.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing download…" : "Download highlight"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
