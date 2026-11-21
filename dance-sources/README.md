# Pulse dance source videos

These are the four source videos selected for the private Pulse project. Keep the numbered filenames until the song titles and final dance metadata are confirmed. The source files live outside Vite's `public/` folder. The catalogue will use generated JSON and M4A files under `public/dances/`.

| Source | Duration | Status |
| --- | ---: | --- |
| [dance1.mp4](dance1.mp4) | 4:29 | Selected. Extraction and timing checks pending. |
| [dance2.mp4](dance2.mp4) | 3:00 | First candidate. Full extraction, audio validation, and isolated Chrome playback completed. |
| [dance3.mp4](dance3.mp4) | 4:13 | Selected. Check pose tracking during jumps and fast arm movements. |
| [dance4.mp4](dance4.mp4) | 3:06 | Selected. Next candidate to extract and measure. |

## Resume issue #18

- **Reproduce the first draft.** Run the real `/dev/extract` from current main on `dance2.mp4`, with fixtures disabled, using 99 BPM and a 3650 ms first beat. Copy the original AAC track into an M4A using `ffmpeg -i dance-sources/dance2.mp4 -map 0:a:0 -c:a copy dance2.m4a` in a scratch location. The previous run produced 3,494 poses and 291 beats. The M4A started at zero, lasted 179.797 seconds, and decoded to the same samples as the MP4 audio. The scratch template passed `parseDance`. Confirm the final ID, title, genre, difficulty, and popularity before registration. [Dance assets #18](https://github.com/Zaidmcuni/Pulse/issues/18) · [Extractor PR #43](https://github.com/Zaidmcuni/Pulse/pull/43)
- **Register and play it in the app.** Confirm the manifest's entry shape and ID policy with the store workstream, add the validated pair and its single entry, then verify that the production catalogue loads the dance and opens the real play route. On the last fetched main, `46588e6`, the index was empty, the store mock-backed, and Catalogue and DancePlay stubs. [Store #24](https://github.com/Zaidmcuni/Pulse/issues/24) · [Catalogue #25](https://github.com/Zaidmcuni/Pulse/issues/25) · [DancePlay #10](https://github.com/Zaidmcuni/Pulse/issues/10)
- **Verify production sync.** Audio onset analysis supported the draft grid in three sections. The isolated Chrome preview ran to the end and passed pause/resume. In 39 spot checks, the coach clock was 18–36 ms ahead of Chrome's estimated audio-output clock. Confirm perceived coach-to-audio timing and measure the 25 ms target on the production route. The headless clock comparison leaves that target open. [DancePlay #10](https://github.com/Zaidmcuni/Pulse/issues/10) · [Song player #19](https://github.com/Zaidmcuni/Pulse/issues/19) · [Coach PR #35](https://github.com/Zaidmcuni/Pulse/pull/35)
- **Prepare the rest of the demo set.** Issue #18 calls for two or three playable routines. Run actual extraction and beat checks for the remaining selected sources, then choose the demo set based on tracking, sync, and difficulty. Keep raw sources and generated runtime assets in their respective folders. [Dance assets #18](https://github.com/Zaidmcuni/Pulse/issues/18)
