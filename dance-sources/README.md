# Pulse dance source videos

These are the four source videos selected for the private Pulse project. Keep the numbered filenames as stable source references. The original MP4s live outside Vite's `public/` directory. Pulse loads the generated JSON and M4A for each ID through `public/dances/index.json`.

| Source and ID | Song | Duration | BPM | First beat | Poses | Beats |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [dance1.mp4](dance1.mp4) | On The Floor — Jennifer Lopez feat. Pitbull | 4:29 | 130 | 413 ms | 5,623 | 583 |
| [dance2.mp4](dance2.mp4) | Don't Call Me Up — Mabel | 3:00 | 99 | 3,650 ms | 3,494 | 291 |
| [dance3.mp4](dance3.mp4) | Give Me Everything — Pitbull feat. Ne-Yo, Afrojack & Nayer | 4:13 | 129 | 1,355 ms | 5,188 | 541 |
| [dance4.mp4](dance4.mp4) | Tip Toe — Jason Derulo feat. French Montana | 3:06 | 98 | 120 ms | 3,871 | 305 |

## How the bundles were prepared

1. Measure tempo and first-beat offset from the audio in the exact source MP4. Check the single BPM grid across the clip. In Tip Toe the dominant accent shifts by about half a beat between sections. The 120 ms starting phase follows the opening accents, and the alternative accents remain subdivisions of the same tempo.
2. Run the real `/dev/extract` in Chrome with fixture poses disabled. For dance1, dance3, and dance4, the first runs dropped some opening frames. A second pass on the exact opening video packets with a warmed pose model recovered those frames. Overlapping poses were checked before joining each opening to its full extraction on the source timeline. The largest gap in each of those three templates was about 83 ms. Dance2 retains a 584 ms gap at the start of its quiet intro.
3. Copy the original AAC stream into an M4A. For example, run `ffmpeg -i dance-sources/dance4.mp4 -map 0:a:0 -c:a copy dance4.m4a` and work with scratch output until it passes. All four audio files start at zero, match their sources' audio duration, and decode to identical samples.
4. Validate the templates with Pulse's `parseDance`, check the beats and frames against the source duration, then register the four IDs in the store's manifest. The browser store loaded all four bundles. Each built app route under `/dance/:id/play` started, animated the coach, paused, and resumed in headless Chrome with a simulated camera. Typecheck, all 320 tests, and the production build passed.

## Follow-up checks

- Verify selection through the catalogue once its screen lands. The manifest follows the merged store contract, an array of string IDs. Initial difficulty labels are estimates based on movement, and popularity starts at zero. [Dance assets #18](https://github.com/Zaidmcuni/Pulse/issues/18) · [Store PR #54](https://github.com/Zaidmcuni/Pulse/pull/54) · [Catalogue #25](https://github.com/Zaidmcuni/Pulse/issues/25)
- Verify audible coach timing on a real device and measure the 25 ms target. The earlier full-length headless test on dance2 saw the coach clock 18–36 ms ahead of Chrome's estimated audio-output clock. Check the Tip Toe beat accents by ear during this pass. [DancePlay #10](https://github.com/Zaidmcuni/Pulse/issues/10) · [Song player #19](https://github.com/Zaidmcuni/Pulse/issues/19)
