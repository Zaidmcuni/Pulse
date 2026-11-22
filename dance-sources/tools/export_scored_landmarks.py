"""
Owner: Toufic
Purpose: #87 offline scoring check. Turn an extract_body.py .npz into the 12 scored landmarks per source frame
         (SCORED_LANDMARK_INDICES order, unmirrored, normalized 0..1, with visibility) as JSON for
         src/screens/dev/scoringCheck.heavy.test.ts.
FRs: FR-27, FR-28

Dev tooling only: never shipped, never run by the app.

    python export_scored_landmarks.py <in.npz> <out.json>

Frame i is timestamped i * 1001 / 24 ms, like the templates. A frame with no detected person is null.
"""
import json
import sys

import numpy as np

SCORED_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]  # config.ts


def main(npz_path: str, out_path: str) -> None:
    d = np.load(npz_path)
    width, height = (int(v) for v in d["size"])
    frames = []
    for ok, img in zip(d["ok"], d["img"]):
        if not ok:
            frames.append(None)
            continue
        frames.append([[round(float(p[0]), 5), round(float(p[1]), 5), round(float(p[3]), 3)]
                       for p in img[SCORED_LANDMARK_INDICES]])
    with open(out_path, "w") as f:
        json.dump({"width": width, "height": height, "frameMs": 1001 / 24, "frames": frames}, f)
    print(f"{out_path}: {len(frames)} frames, {sum(x is None for x in frames)} without a person")


if __name__ == "__main__":
    main(*sys.argv[1:3])
