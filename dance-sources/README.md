# Pulse dance source videos

These are the four source videos selected for the private Pulse project. Keep the numbered filenames as stable source references. The original MP4s live outside Vite's `public/` directory. Pulse loads the generated JSON and M4A for each ID through `public/dances/index.json`.

| Source and ID | Song | Duration | BPM | First beat | Poses | Beats |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [dance1.mp4](dance1.mp4) | On The Floor — Jennifer Lopez feat. Pitbull | 4:29 | 130 | 413 ms | 5,623 | 583 |
| [dance2.mp4](dance2.mp4) | Don't Call Me Up — Mabel | 3:00 | 99 | 3,650 ms | 3,494 | 291 |
| [dance3.mp4](dance3.mp4) | Give Me Everything — Pitbull feat. Ne-Yo, Afrojack & Nayer | 4:04 | 129 | 1,355 ms | 5,005 | 522 |
| [dance4.mp4](dance4.mp4) | Tip Toe — Jason Derulo feat. French Montana | 3:06 | 98 | 120 ms | 3,871 | 305 |

The table shows playback duration and pose counts for the bundled files. Source videos are retained for reproducibility.

## How the bundles were prepared

1. Measure tempo and first-beat offset from the audio in the exact source MP4. Check the single BPM grid across the clip. In Tip Toe the dominant accent shifts by about half a beat between sections. The 120 ms starting phase follows the opening accents, and the alternative accents remain subdivisions of the same tempo.
2. Run the real `/dev/extract` in Chrome with fixture poses disabled. For dance1, dance3, and dance4, the first runs dropped some opening frames. A second pass on the exact opening video packets with a warmed pose model recovered those frames. Overlapping poses were checked before joining each opening to its full extraction on the source timeline. The largest gap in each of those three templates was about 83 ms. Dance2 retains a 584 ms gap at the start of its quiet intro.
3. Copy the original AAC stream into an M4A. For example, run `ffmpeg -i dance-sources/dance4.mp4 -map 0:a:0 -c:a copy dance4.m4a` and work with scratch output until it passes. All four audio files start at zero and decode to the corresponding prefix of the source audio. Dance3's runtime audio ends at 243.976 s, during the closing dip and before the first unstable pose. All retained template frames and beats keep their original timestamps.
4. Validate the templates with Pulse's `parseDance`, check the beats and frames against the source duration, then register the four IDs in the store's manifest. The browser store loaded all four bundles. Each built app route under `/dance/:id/play` started, animated the coach, paused, and resumed in headless Chrome with a simulated camera. Typecheck, all 320 tests, and the production build passed.

## Pose corrections

- Dance3's original video enters a forward bend around 243.4 s. The runtime bundle includes the dip and ends at the AAC packet boundary before the first unstable pose at about 243.994 s. To reproduce the cut, use `ffmpeg -i dance-sources/dance3.mp4 -t 243.968 -map 0:a:0 -c:a copy dance3.m4a`. Use the resulting stream duration for `lengthSec` and retain the original frames and beats before that time.
- Tip Toe's side turns hid the far hip, knee and ankle from the lite model. Reprocess the affected source frames offline with MediaPipe Pose Landmarker Full and Heavy in VIDEO mode, with at least 1.2 s of lead-in. Use the Full model's pixel-space leg directions only where the original thigh/shin is missing. The Heavy model agreed within 6.82° on the 418 restored directions. Review the restored shapes and the transitions at 45–51, 84–91 and 165–171 s. Existing directions, frame times, beats and audio are preserved. Fully occluded joints remain estimates.

## Follow-up checks

- All four bundles validated and passed direct playback. Catalogue → ready → play passed with main plus the assets. Recheck the catalogue on the shipping build after [PR #53](https://github.com/Zaidmcuni/Pulse/pull/53) merges and before closing [#18](https://github.com/Zaidmcuni/Pulse/issues/18).
- The team reported the coach looked in time across all four dances. Calibrated physical audio-to-display timing is a separate NFR-02 check. The headed dance2 run found a 36.09 ms median coach lead against Chrome's estimated output clock. [DancePlay #10](https://github.com/Zaidmcuni/Pulse/issues/10) · [Song player #19](https://github.com/Zaidmcuni/Pulse/issues/19)
- Whole-body side and back orientation is tracked under [#73](https://github.com/Zaidmcuni/Pulse/issues/73).

## Coach body tracks (#97)

Each dance can have a sidecar `public/dances/<id>.body.json` that only the coach reads. It holds a 3D body track for the 2.5D coach, which stands on a stage seen by a fixed camera. Without the file the coach falls back to a flat body built from the template segments. The dance JSON, its segments and scoring don't use it.

It is made offline from the same source video, on the same frame times as the template (frame *i* at *i* × 1001 / 24 ms):

1. `python dance-sources/tools/extract_body.py dance-sources/<id>.mp4 pose_landmarker_heavy.task <id>.npz` runs MediaPipe Pose Landmarker Heavy in VIDEO mode on every frame and keeps 33 image and 33 world landmarks. The model and the `.npz` stay outside the repo. Install `mediapipe opencv-python-headless numpy` in a scratch virtualenv first.
2. `python dance-sources/tools/process_body.py <id>.npz <id> public/dances/<id>.body.json` does the rest:
   - It fixes left/right label swaps while the dancer faces away, using frame-to-frame continuity, and mirrors depth on those frames.
   - It fills gaps up to 0.5 s and smooths lightly, using a centred filter that is stronger on depth.
   - It places the hips on stage. Left/right comes from the hip centre in the image, scaled to at most ±0.7 m. Height comes from the feet: a foot on the floor in the video stays on the floor, a jump lifts the body, and a squat lowers it.
   - Each frame keeps 25 points (nose, ears, shoulders to foot tips) with their visibility, plus the hip position on stage.
