"""
Owner: Toufic
Purpose: #97 offline step 1. Run MediaPipe Pose Landmarker (Heavy, VIDEO mode) on every frame of a
         dance source video and save the raw 33 image + 33 world landmarks to an .npz for process_body.py.
FRs: FR-13, FR-26

Dev tooling only: never shipped, never run by the app. Raw frames stay in memory and are discarded.

    python extract_body.py <video.mp4> <model.task> <out.npz>

Frame i is timestamped i * 1001 / 24 ms, the same presentation times the bundles use (tMs = mediaTime * 1000).
"""
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision


def main(video_path: str, model_path: str, out_path: str) -> None:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_ms = 1000.0 / fps

    options = vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    times, img, world, ok = [], [], [], []
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        i = 0
        while True:
            got, frame = cap.read()
            if not got:
                break
            t_ms = i * frame_ms
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(round(t_ms)))
            times.append(t_ms)
            if res.pose_landmarks:
                lm = res.pose_landmarks[0]
                wl = res.pose_world_landmarks[0]
                img.append([[p.x, p.y, p.z, p.visibility] for p in lm])
                world.append([[p.x, p.y, p.z] for p in wl])
                ok.append(True)
            else:
                img.append(np.zeros((33, 4)).tolist())
                world.append(np.zeros((33, 3)).tolist())
                ok.append(False)
            i += 1
            if i % 500 == 0:
                print(f"{video_path}: {i} frames", flush=True)
    cap.release()
    np.savez_compressed(
        out_path,
        t=np.array(times), img=np.array(img, dtype=np.float32), world=np.array(world, dtype=np.float32),
        ok=np.array(ok), size=np.array([width, height]), fps=np.array([fps]),
    )
    print(f"{video_path}: done, {len(times)} frames, {int(np.sum(ok))} with a pose", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
