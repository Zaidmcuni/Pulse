/**
 * Owner: Toufic
 * Purpose: #97 phase 0, dev-only panel on /dev/extract: the proposed 2.5D coach and stage for five MOCK
 *          poses, with turn and stage-position sliders. For team sign-off only.
 * FRs: FR-26
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { MOCK_POSES } from "../../coach/coach3dFixtures";
import { NO_OFFSET, drawPreview, previewPose, type PreviewOptions } from "./coach3dDraw";

const W = 360;
const H = 480;

const SLIDERS: ReadonlyArray<{ key: keyof PreviewOptions; label: string; min: number; max: number; step: number }> = [
  { key: "turnDeg", label: "Turn (°)", min: -180, max: 180, step: 5 },
  { key: "dx", label: "Left / right (m)", min: -1, max: 1, step: 0.05 },
  { key: "dz", label: "Toward / away (m)", min: -1.2, max: 2, step: 0.05 },
  { key: "lift", label: "Jump (m)", min: 0, max: 0.5, step: 0.02 },
];

export default function Coach3dPreview(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseIdx, setPoseIdx] = useState(0);
  const [opts, setOpts] = useState<PreviewOptions>(NO_OFFSET);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawPreview(ctx, W, H, previewPose(MOCK_POSES[poseIdx], opts));
  }, [poseIdx, opts]);

  return (
    <details>
      <summary>Coach 3D prototype (#97 phase 0)</summary>
      <p>
        <span className="badge">MOCK 3D POSES</span> Hand-built fixtures, not real landmarks: the pose engine
        doesn&apos;t output depth yet.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {MOCK_POSES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={i === poseIdx ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setPoseIdx(i)}
          >
            {p.id}
          </button>
        ))}
      </div>
      <p>{MOCK_POSES[poseIdx].label}</p>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: 360, maxWidth: "100%", height: "auto" }} aria-label="Proposed coach" />
      {SLIDERS.map((s) => (
        <label key={s.key} style={{ display: "block" }}>
          {s.label}: {opts[s.key]}
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={opts[s.key]}
            onChange={(e) => setOpts({ ...opts, [s.key]: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => setOpts(NO_OFFSET)}>Reset</button>
    </details>
  );
}
