# White screen (Idle Skilling + Legends of Idleon)

Investigation 2026-10-25, after an Idle Skilling white screen at 17:46 PT, about 25 h into a session with CDP attached on port 9333.

## Evidence
- **Same shell in both games.** Electron 11.5.0 (Chromium 87.0.4280.141) with Greenworks; `src/main/index.js` and `config.js` are identical. Both have no `render-process-gone` / `crashed` / `unresponsive` handler and no `crashReporter`. Both set `OVERLAY_FIX = true`, which adds `--in-process-gpu` and `--disable-direct-composition`, with a leading `--` that `appendSwitch` may ignore. Both also set `disable-renderer-backgrounding`, `backgroundThrottling: false` and `incrementCapturerCount()`.
- **Steam `logs/gameprocess_log.txt`.** 2026-10-25 17:46:02 shows `no longer tracking PID 24100 (renderer), exit code -36861` (0xFFFF7003, not yet mapped to a known code). The main, network and audio processes all exited 0.
  - Idleon on 2026-05-07: renderer exit 0xE0000008, which looks like Chromium's out-of-memory exit. This is from recall and not verified.
  - No `gpu-process` entries ever, which fits the GPU running inside the browser process.
- **Windows Event Log 17:15-18:00.** No Application Error, no WER, no TDR/Display/nvlddmkm entries.
- **Crash dumps.** None, because `crashReporter` is never started.

## Mechanism (likely)
The renderer dies (out of memory, a GPU fault or a crash). Nothing handles the event, so the BrowserWindow stays open showing a blank white page. Ctrl+R reloads it.

Idleon reports predate CDP use, so CDP is not the root cause. The toolbox's `Debugger.enable` + full-source pull in `src/live.ts` could add pressure; this is unproven.

## Community (Steam; no developer reply found)
- https://steamcommunity.com/app/1476970/discussions/0/687490776811205864/: Ctrl+R recovers; capping FPS at 200 or lower in the Nvidia panel "seems to work".
- https://steamcommunity.com/app/1476970/discussions/0/4516631714058977552/: STATUS_ACCESS_VIOLATION; long sessions are blamed.
- https://steamcommunity.com/app/1476970/discussions/0/3463848083417083786: heavy on-screen load (pet rounds 115+).
- Same mechanism in another app: https://github.com/electron/electron/issues/2357, and a reload-on-`render-process-gone` fix at https://github.com/juspay/xyne-spaces/pull/1626.

## Capture next time
1. Before touching anything, check http://127.0.0.1:9333/json/list. If the target is listed but frozen, the renderer hung; if it is gone, the renderer crashed.
2. Run a CDP logger for `Inspector.targetCrashed` / `Target.targetCrashed` (gives the reason), plus a per-minute `Performance.getMetrics` heap sample.
3. Add launch options `--enable-logging=file --log-file=<path>`. Untested on this build.
4. Pull the renderer exit code from the Steam gameprocess_log and note the session length.

## For LavaFlame2
- Handle `render-process-gone` (log `reason` and `exitCode`, then reload) and `unresponsive`.
- Start `crashReporter` locally (`uploadToServer: false`).
- Drop the leading `--` in `appendSwitch`.
- Reconsider `incrementCapturerCount`.
- Upgrade Electron from 11.5, which is 2021-era.

## Stencyl / OpenFL angle (added 2026-10-25)
- The game is Stencyl output running on **OpenFL 8.9.5 + Lime** (2019-era). The bundle can render through WebGL or Canvas 2D.
- **Live check 2026-10-25:** Idle Skilling's game canvas (960×540) uses a **Canvas 2D** context, not WebGL; `getContext('2d')` returns the live context. The bundle's WebGL context-loss handling (Lime listeners, OpenFL renderer rebuild, empty Stencyl hooks) is therefore not in play here.
- **The remaining no-crash path is GPU-side.** Chromium accelerates Canvas 2D on the GPU, and a GPU reset can wipe it while the renderer lives. Chromium 87 has no 2D `contextlost` event (it shipped around Chrome 99), so nothing in the page can notice or redraw. Unverified for this game; it fits the FPS-cap and heavy-load reports.
- Today's crash was neither: Steam logged the renderer process exiting (-36861).
- **Telling them apart:** if the page target is still in `/json/list` and answers `Runtime.evaluate`, the cause is a hang or a GPU-side blank. If the target is gone, the renderer died.
- **Watcher:** `bun src/crash-watch.ts` logs renderer crash/detach, socket loss with whether the target is still listed, WebGL context events (none expected on 2D), and heap/DOM samples to `data/crash-log.jsonl`. It reattaches after a relaunch.
- **For LavaFlame2:** the fix lives in the Electron shell (`main/index.js`), which they own outright. It does not require touching Stencyl's generated code.

## Closing the game while the watcher runs

Observed 2026-10-26: with `src/crash-watch.ts` attached, the game window would not close; it closed as soon as the watcher was stopped. The game's own close path (`WINDOW_CLOSE` → `BrowserWindow.close()`, no `beforeunload` blocker) does not explain it, so the cause is in the CDP session (untraced). Stop the watcher before closing the game.
