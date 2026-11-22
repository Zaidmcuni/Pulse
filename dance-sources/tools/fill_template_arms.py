"""
Owner: Toufic
Purpose: #79. Restore arm directions missing from a dance template (public/dances/<id>.json) using two
         offline pose models, Heavy and Full, from extract_body.py. A missing arm segment is filled only
         where both models agree, as the Tip Toe leg repair did. Existing directions, timestamps, beats and
         audio are untouched.
FRs: FR-13, FR-15

    python fill_template_arms.py <dance.json> <heavy.npz> <full.npz> [max_disagreement_deg]

Directions follow extractSegments(mirror: false): pixel space (x * width, y * height), y down, unit length,
unmirrored, "l"/"r" = the dancer's own side (MediaPipe labels). Frame i of the video is at i * 1001 / 24 ms.
"""
import json
import math
import re
import sys

import numpy as np

from process_body import fix_swaps

ARM_SEGMENTS = {  # SEGMENT_ENDPOINTS for the arms, in MediaPipe indices
    "l_upper_arm": (11, 13), "l_forearm": (13, 15),
    "r_upper_arm": (12, 14), "r_forearm": (14, 16),
}
FRAME_MS = 1001 / 24


def load(path):
    raw = np.load(path)
    img, world, ok = raw["img"].copy(), raw["world"].copy(), raw["ok"].copy()
    fix_swaps(img, world, ok)
    w, h = [int(v) for v in raw["size"]]
    return img, ok, w, h


def direction(img, i, a, b, w, h):
    dx = float(img[i, b, 0] - img[i, a, 0]) * w
    dy = float(img[i, b, 1] - img[i, a, 1]) * h
    n = math.hypot(dx, dy)
    return None if n < 1e-6 else (dx / n, dy / n)


def angle_deg(u, v):
    return math.degrees(math.acos(max(-1.0, min(1.0, u[0] * v[0] + u[1] * v[1]))))


def js_number(m):
    """Python float repr -> JavaScript's JSON.stringify form (only exponents differ)."""
    s = m.group(0)
    mant, exp = s.split("e")
    e = int(exp)
    if -7 < e < 21:
        neg = mant.startswith("-")
        digits = mant.lstrip("-").replace(".", "")
        point = len(mant.lstrip("-").split(".")[0]) + e
        if point <= 0:
            out = "0." + "0" * (-point) + digits
        else:
            out = digits[:point] + "." + digits[point:] if point < len(digits) else digits + "0" * (point - len(digits))
        return ("-" if neg else "") + out.rstrip(".")
    return f"{mant}e{'+' if e > 0 else '-'}{abs(e)}"


def main(dance_path, heavy_path, full_path, max_deg=15.0):
    raw_text = open(dance_path).read()
    dance = json.loads(raw_text)
    hv, hok, w, h = load(heavy_path)
    fu, fok, _, _ = load(full_path)

    # Sanity: how well does Heavy agree with the template where the template has an arm?
    errs = []
    filled = {k: 0 for k in ARM_SEGMENTS}
    rejected = {k: 0 for k in ARM_SEGMENTS}
    for f in dance["frames"]:
        i = int(round(f["tMs"] / FRAME_MS))
        if i >= len(hok):
            continue
        segs = f["segments"]
        for name, (a, b) in ARM_SEGMENTS.items():
            if name in segs:
                d = direction(hv, i, a, b, w, h) if hok[i] else None
                if d:
                    errs.append(angle_deg(d, segs[name]))
                continue
            if not (hok[i] and fok[i]):
                rejected[name] += 1
                continue
            dh = direction(hv, i, a, b, w, h)
            df = direction(fu, i, a, b, w, h)
            if dh is None or df is None or angle_deg(dh, df) > max_deg:
                rejected[name] += 1
                continue
            mx, my = dh[0] + df[0], dh[1] + df[1]
            n = math.hypot(mx, my)
            segs[name] = [mx / n, my / n]
            filled[name] += 1

    # Remaining gaps: runs of frames still missing an arm segment, 0.3 s or longer.
    gaps = []
    for name in ARM_SEGMENTS:
        start = None
        for f in dance["frames"] + [{"tMs": float("inf"), "segments": {name: 0}}]:
            if name not in f["segments"]:
                start = f["tMs"] if start is None else start
                end = f["tMs"]
            elif start is not None:
                if end - start >= 300:
                    gaps.append(f"{name} {start / 1000:.1f}-{end / 1000:.1f}s")
                start = None

    out = json.dumps(dance, separators=(",", ":"), ensure_ascii=False)
    out = re.sub(r"-?\d+(?:\.\d+)?e[-+]\d+", js_number, out)
    with open(dance_path, "w") as fh:
        fh.write(out + ("\n" if raw_text.endswith("\n") else ""))
    print(json.dumps({
        "dance": dance["id"], "heavyVsTemplateMedianDeg": round(float(np.median(errs)), 2),
        "heavyVsTemplateP90Deg": round(float(np.percentile(errs, 90)), 2),
        "filled": filled, "rejected": rejected, "gapsOver300ms": gaps,
    }))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 15.0)
