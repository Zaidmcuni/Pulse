"""
Owner: Toufic
Purpose: #97 offline step 2. Turn extract_body.py's raw landmarks into the coach's body track sidecar,
         public/dances/<id>.body.json, read only by src/coach (see bodyTrack.ts for the format).
FRs: FR-13, FR-26

    python process_body.py <raw.npz> <dance-id> <out.json>

Steps, all offline (the whole clip is known, so filters can be centred):
1. Left/right swaps: MediaPipe often flips the labels when the dancer faces away. A frame whose
   mirrored labelling is much closer to the previous frame is relabelled, and its depth mirrored, so
   the body really faces away.
2. Gaps up to 0.5 s are filled by linear interpolation; longer gaps stay absent (the coach falls back).
3. Light centred smoothing (stronger on depth, which is noisier). Visibility takes its highest value
   over +-0.4 s, so only sustained occlusions fade a limb, not motion-blur dips.
4. Stage placement for the fixed source camera: left/right from the hip centre in the image; height
   from the feet, so a foot on the floor in the video is on the floor on stage, jumps lift the body
   and squats lower it. One pixels-per-meter scale per dance.
"""
import json
import sys

import numpy as np

KEEP = [0, 7, 8] + list(range(11, 33))  # nose, ears, shoulders .. foot tips (25 points)
PAIRS = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10)] + [(i, i + 1) for i in range(11, 33, 2)]  # left/right partners
SWAP = list(range(33))
for a, b in PAIRS:
    SWAP[a], SWAP[b] = b, a
BODY = list(range(11, 33))
FEET = [27, 28, 29, 30, 31, 32]
MAX_GAP = 12  # frames (0.5 s at 23.976 fps)
LATERAL_LIMIT_M = 0.7  # the coach's portrait stage shows about +-0.7 m at the home spot
CONTACT_DEADBAND_M = 0.03
VIS_HOLD = 10  # frames (~0.4 s): brief visibility dips (motion blur) don't fade a limb


def fix_swaps(img, world, ok):
    swaps = 0
    prev = None
    for i in range(len(ok)):
        if not ok[i]:
            continue
        if prev is not None and i - prev <= 6:
            raw_w, raw_i = world[i], img[i, :, :2]
            sw_w, sw_i = world[i][SWAP], img[i][SWAP][:, :2]
            pw, pi = world[prev], img[prev, :, :2]
            cost = lambda w, im: (np.linalg.norm(w[BODY, :2] - pw[BODY, :2], axis=1).sum()
                                  + 2 * np.linalg.norm(im[BODY] - pi[BODY], axis=1).sum())
            if cost(sw_w, sw_i) < 0.6 * cost(raw_w, raw_i):
                world[i] = sw_w * np.array([1, 1, -1], dtype=np.float32)
                img[i] = img[i][SWAP]
                swaps += 1
        prev = i
    return swaps


def fill_gaps(arrs, ok):
    filled = 0
    valid = np.flatnonzero(ok)
    for a, b in zip(valid[:-1], valid[1:]):
        gap = b - a - 1
        if 0 < gap <= MAX_GAP:
            for k in range(1, gap + 1):
                t = k / (gap + 1)
                for arr in arrs:
                    arr[a + k] = arr[a] * (1 - t) + arr[b] * t
                ok[a + k] = True
                filled += 1
    return filled


def runs(ok):
    out, start = [], None
    for i, v in enumerate(list(ok) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def smooth(arr, ok, weights):
    w = np.array(weights, dtype=np.float64)
    half = len(w) // 2
    out = arr.copy()
    for s, e in runs(ok):
        seg = arr[s:e].astype(np.float64)
        for i in range(e - s):
            lo, hi = max(0, i - half), min(e - s, i + half + 1)
            ww = w[half - (i - lo): half + (hi - i)]
            out[s + i] = np.tensordot(ww, seg[lo:hi], axes=(0, 0)) / ww.sum()
    return out


def main(raw_path, dance_id, out_path):
    raw = np.load(raw_path)
    t, img, world, ok = raw["t"], raw["img"].copy(), raw["world"].copy(), raw["ok"].copy()
    width, height = [int(v) for v in raw["size"]]

    swaps = fix_swaps(img, world, ok)
    filled = fill_gaps([img, world], ok)
    world[:, :, :2] = smooth(world[:, :, :2], ok, [1, 2, 1])
    world[:, :, 2] = smooth(world[:, :, 2], ok, [1, 2, 3, 2, 1])
    img[:, :, :2] = smooth(img[:, :, :2], ok, [1, 2, 1])

    px = img[:, :, 0] * width
    py = img[:, :, 1] * height
    vis = img[:, :, 3].copy()
    for s_, e_ in runs(ok):
        for i in range(s_, e_):
            vis[i] = img[max(s_, i - VIS_HOLD):min(e_, i + VIS_HOLD + 1), :, 3].max(0)
    idx = np.flatnonzero(ok)

    # Pixels per meter: image lengths of torso, thighs and shins over their world lengths (x, y only).
    ratios = []
    for a, b in [((11, 12), (23, 24)), ((23,), (25,)), ((24,), (26,)), ((25,), (27,)), ((26,), (28,))]:
        ia = np.stack([px[:, list(a)].mean(1), py[:, list(a)].mean(1)], 1)
        ib = np.stack([px[:, list(b)].mean(1), py[:, list(b)].mean(1)], 1)
        wa = world[:, list(a), :2].mean(1)
        wb = world[:, list(b), :2].mean(1)
        li = np.linalg.norm(ia - ib, axis=1)[idx]
        lw = np.linalg.norm(wa - wb, axis=1)[idx]
        good = lw > 0.15
        ratios.extend((li[good] / lw[good]).tolist())
    k = float(np.median(ratios))

    # Floor line: where the lowest foot point usually is.
    lowest_px = py[:, FEET].max(1)
    floor_px = float(np.percentile(lowest_px[idx], 95))
    foot_up_m = np.clip((floor_px - lowest_px) / k - CONTACT_DEADBAND_M, 0, None)
    hip_x_px = px[:, [23, 24]].mean(1)
    root_x = (hip_x_px - width / 2) / k
    span = float(np.abs(root_x[idx]).max())
    lateral = min(1.0, LATERAL_LIMIT_M / span) if span > 0 else 1.0
    root_x *= lateral
    world_lowest = world[:, :, 1].max(1)  # hips -> lowest point (y down)
    root_y = world_lowest + foot_up_m
    root = np.stack([root_x, root_y], 1)
    root = smooth(root, ok, [1, 2, 3, 2, 1])

    frames_t, frames_root, frames_w, frames_v = [], [], [], []
    for i in idx:
        frames_t.append(round(float(t[i]), 1))
        frames_root.append([round(float(root[i, 0]), 3), round(float(root[i, 1]), 3)])
        frames_w.append([round(float(c), 3) for p in KEEP for c in world[i, p]])
        frames_v.append([round(float(vis[i, p]), 2) for p in KEEP])

    track = {
        "version": 1,
        "danceId": dance_id,
        "indices": KEEP,
        "tMs": frames_t,
        "root": frames_root,
        "world": frames_w,
        "vis": frames_v,
    }
    with open(out_path, "w") as f:
        json.dump(track, f, separators=(",", ":"))
    print(json.dumps({
        "dance": dance_id, "frames": len(t), "withPose": len(idx), "swaps": swaps, "filled": filled,
        "pxPerM": round(k, 1), "floorPx": round(floor_px, 1), "lateralSpanM": round(span, 2),
        "lateralScale": round(lateral, 2), "maxFootUpM": round(float(foot_up_m[idx].max()), 2),
        "hipHeightRangeM": [round(float(root_y[idx].min()), 2), round(float(root_y[idx].max()), 2)],
    }))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
