/**
 * Owner: Toufic
 * Purpose: Dev page (/dev/extract): load a dance video, run initPoseLandmarker + startPose on it, extractSegments(mirror: false), build Dance JSON with tMs = mediaTimeSec * 1000, validate with parseDance, download
 * FRs: FR-13, FR-14, FR-15
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 * Inputs on the page: video file, BPM, first-beat offset (ms), title, genre, difficulty, popularity.
 * Audio: extract once with `ffmpeg -i video.mp4 -vn -c:a copy public/dances/<id>.m4a` (same timeline as the video).
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  MOCK_POSE_SOURCE,
  REAL_POSE_SOURCE,
  parseExtractForm,
  startExtractionRun,
  type ExtractForm,
  type ExtractMeta,
} from "./extract";

type Phase = "idle" | "running" | "error" | "done";

interface Output {
  json: string;
  fileName: string;
  mock: boolean;
  frameCount: number;
  beatCount: number;
}

const EMPTY_FORM: ExtractForm = {
  id: "", title: "", artist: "", genre: "", difficulty: "easy", bpm: "", firstBeatOffsetMs: "", popularity: "",
};

const FIELDS: ReadonlyArray<{ key: Exclude<keyof ExtractForm, "difficulty">; label: string; numeric?: boolean }> = [
  { key: "id", label: "Dance ID (file name)" },
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist (optional)" },
  { key: "genre", label: "Genre" },
  { key: "bpm", label: "BPM", numeric: true },
  { key: "firstBeatOffsetMs", label: "First-beat offset (ms)", numeric: true },
  { key: "popularity", label: "Popularity", numeric: true },
];

export default function ExtractTool(): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runRef = useRef<{ cancel?: () => void } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<ExtractForm>(EMPTY_FORM);
  const [useMock, setUseMock] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Pick a video and fill in the details.");
  const [output, setOutput] = useState<Output | null>(null);

  const cancelRun = (): void => {
    const run = runRef.current;
    runRef.current = null;
    run?.cancel?.();
  };

  useEffect(() => cancelRun, []);

  const inputsChanged = (): void => {
    cancelRun();
    setOutput(null);
    setPhase("idle");
    setMessage("Ready to extract.");
  };

  const startRun = (): void => {
    cancelRun();
    setOutput(null);
    const video = videoRef.current;
    if (!video) return;
    if (!file) {
      setPhase("error");
      setMessage("Choose a video file first.");
      return;
    }
    let meta: ExtractMeta;
    try {
      meta = parseExtractForm(form);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
      return;
    }
    const source = useMock ? MOCK_POSE_SOURCE : REAL_POSE_SOURCE;
    const run: { cancel?: () => void } = {};
    runRef.current = run;

    const onError = (message: string): void => {
      if (runRef.current !== run) return;
      runRef.current = null;
      setPhase("error");
      setMessage(message);
    };

    setPhase("running");
    setMessage("Loading video…");
    try {
      const cancel = startExtractionRun(video, file, meta, source, {
        onStatus: (message) => {
          if (runRef.current === run) setMessage(message);
        },
        onProgress: (count, tMs, durationMs) => {
          if (runRef.current !== run) return;
          setMessage(`${source.mock ? "Mock: " : ""}${count} frames, ${(tMs / 1000).toFixed(1)} / ${(durationMs / 1000).toFixed(1)} s`);
        },
        onError,
        onDone: ({ dance, json }) => {
          if (runRef.current !== run) return;
          runRef.current = null;
          setOutput({
            json,
            fileName: source.mock ? `${dance.id}.mock.json` : `${dance.id}.json`,
            mock: source.mock,
            frameCount: dance.frames.length,
            beatCount: dance.beatsMs.length,
          });
          setPhase("done");
          setMessage(source.mock ? "Mock output ready (fixture poses, not this video)." : "Dance template ready.");
        },
      });
      if (runRef.current === run) run.cancel = cancel;
      else cancel();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const download = (result: Output): void => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
    link.href = url;
    link.download = result.fileName;
    try {
      link.click();
    } finally {
      // Give the browser a task to start the download before releasing the URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  };

  const onCancel = (): void => {
    cancelRun();
    setPhase("idle");
    setMessage("Cancelled. Ready to extract.");
  };

  const running = phase === "running";

  return (
    <section className="card" style={{ maxWidth: 640, margin: "1rem auto" }}>
      <h1 style={{ marginTop: 0 }}>Dance extract tool (dev)</h1>

      <form onSubmit={(e) => { e.preventDefault(); startRun(); }} style={{ display: "grid", gap: "0.6rem" }}>
        <label>
          Dance video (front-facing, solo){" "}
          <input
            type="file"
            accept="video/*"
            disabled={running}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); inputsChanged(); }}
          />
        </label>

        {FIELDS.map(({ key, label, numeric }) => (
          <label key={key}>
            {label}{" "}
            <input
              type="text"
              inputMode={numeric ? "decimal" : undefined}
              value={form[key] ?? ""}
              disabled={running}
              onChange={(e) => { setForm({ ...form, [key]: e.target.value }); inputsChanged(); }}
            />
          </label>
        ))}

        <label>
          Difficulty{" "}
          <select
            value={form.difficulty}
            disabled={running}
            onChange={(e) => { setForm({ ...form, difficulty: e.target.value }); inputsChanged(); }}
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            checked={useMock}
            disabled={running}
            onChange={(e) => { setUseMock(e.target.checked); inputsChanged(); }}
          />{" "}
          Use fixture poses (mock, development only: ignores the video&apos;s choreography)
        </label>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" disabled={running}>Extract</button>
          <button type="button" className="btn btn-secondary" disabled={!running} onClick={onCancel}>Cancel</button>
        </div>
      </form>

      <p role={phase === "error" ? "alert" : "status"} style={{ color: phase === "error" ? "var(--pulse-danger)" : undefined }}>
        {useMock && <span className="badge">MOCK</span>} {message}
      </p>

      <video ref={videoRef} muted playsInline style={{ width: "100%", maxHeight: 240, background: "#000" }} />

      {output && (
        <p>
          {output.mock && <span className="badge">MOCK OUTPUT: not a real template</span>}{" "}
          {output.frameCount} frames, {output.beatCount} beats.{" "}
          <button type="button" className="btn btn-primary" onClick={() => download(output)}>Download {output.fileName}</button>
        </p>
      )}

      <details>
        <summary>After downloading</summary>
        <ol>
          <li>For a real extraction, save the JSON as <code>public/dances/&lt;id&gt;.json</code>.</li>
          <li>
            Extract the audio from the exact same video, with no trims or tempo changes:{" "}
            <code>ffmpeg -i video.mp4 -vn -c:a copy public/dances/&lt;id&gt;.m4a</code>. If the stream can&apos;t be
            copied into M4A, re-encode to AAC and check the timing.
          </li>
          <li>Check the audio starts and lasts as long as the video, and listen through the whole song for sync.</li>
          <li>Add the ID to <code>public/dances/index.json</code> (format per the store owner).</li>
        </ol>
      </details>
    </section>
  );
}
