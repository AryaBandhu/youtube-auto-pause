# AGENTS.md

Repo-specific guidance for agents working on **YouTube Auto-Pause Pro**: a Manifest V3
extension that pauses YouTube playback when the viewing context is left, and resumes only
what the extension itself paused. Act as a senior Chrome Extension/MV3 engineer; optimize for
correctness → reliability → maintainability → compatibility → simplicity.

User-facing docs live in `README.md`. This file is the working contract.

## Repo Facts

- **No package manager, build, lint, typecheck, bundler, or CI.** Do not invent `npm test`,
  `npm run …`, or TypeScript. All files are plain scripts loaded by `manifest.json`/`<script>`.
- **Only automated check:** `node scripts/test_tab_auto_pause.js`
  (Node stdlib `assert`, CommonJS, no dependencies, no browser). It passes on the current tree.
- **Test coverage caveat:** the test `require`s `background.js` for real, but *re-implements*
  the logic of `content.js` and `popup.js` inline (`createContentScriptInstance`,
  `simulatePopupUI`). It therefore does **not** execute those two files. After changing
  pause/resume or popup logic, update the mirror in the test **and** verify manually in Chrome.
- **Manual load:** `chrome://extensions` → enable Developer mode → **Load unpacked** → select
  the repo root (the folder containing `manifest.json`).
- **After every edit:** click **Reload** on the extension card *and* refresh the YouTube tab.
  Content scripts are not re-injected into already-open tabs. Service-worker changes need the
  extension reload; popup changes need the popup reopened.
- **Debugging:** service-worker logs via "Inspect views: service worker"; page logs via DevTools
  on the YouTube tab; popup logs by right-clicking the popup → Inspect.
- Version is declared only in `manifest.json`. Keep `CHANGELOG.md` in sync when releasing.
- `state/` is empty and untracked. `Screenshots/` is user-facing README media.

## Where Things Live

| Path | Responsibility |
|---|---|
| `background.js` | Service worker. Focus/tab signals, per-tab state cleanup, install defaults. No playback decisions. |
| `content.js` | Single IIFE per YouTube tab. Owns all video discovery, state tracking, pause/resume, PiP control. |
| `popup.js` / `popup.html` / `popup.css` | Settings UI and live stats. No build step; element IDs are looked up with `getElementById`. |
| `manifest.json` | MV3 entrypoints, scope, permissions, version. |
| `scripts/test_tab_auto_pause.js` | The only executable verification. |

Change focus/activation behavior in `background.js`; change playback decisions in
`content.js`'s `reconcilePlaybackState()`; change settings behavior in `popup.*`.

## Architecture

Three layers converging on one idempotent function:

1. **Background service worker** (`background.js`) listens to `chrome.windows.onFocusChanged`,
   `chrome.tabs.onActivated`, and `chrome.tabs.onUpdated` (status `complete` + YouTube URL).
   It queries YouTube tabs and pushes `FOCUS_STATE_UPDATE` via `safeSendMessage()`, which
   swallows missing-tab errors.
2. **Content script** (`content.js`) also listens to `document.visibilitychange` and
   `window.focus`/`blur`. Keeping both sources matters: the DOM signals cover tab/window
   transitions even if the worker is asleep; the worker covers cases the page cannot observe.
3. **Popup** (`popup.js`) reads settings from storage, then asks the active YouTube tab for
   `GET_STATUS`. It must work with no content script present.

Every signal follows the same shape: update one or two booleans, then call
`reconcilePlaybackState()`. That function is the single source of truth, re-derives
`isViewingContextActive()`, and is safe to run on duplicate events. Do not add independent
`pause()`/`play()` logic to event handlers; the `play` guard is the only intentional exception.

### The `play` guard is load-bearing

`attachVideoListeners()` re-pauses synchronously from the media `play` event when
`enabled && tabEnabled && !isViewingContextActive()`. This exists because Chromium throttles
timers in hidden tabs, while media events still fire; YouTube's player regularly calls
`play()` again (rebuffer, ad transition, quality switch). Never replace this with
`setInterval`, `setTimeout` retries, or polling, and do not defer the re-pause.

### State model

Persisted:

| Key | Area | Default | Meaning |
|---|---|---|---|
| `enabled` | `chrome.storage.local` | `true` | Global auto-pause master switch |
| `blockPiP` | `chrome.storage.local` | `false` | Exit/block PiP while context is inactive |
| `tab_<tabId>` | `chrome.storage.session` | `true` | Per-tab auto-pause; deleted on `tabs.onRemoved` |

In-memory in the content script: `enabled`, `blockPiP`, `tabEnabled`, `myTabId`,
`isWindowFocused`, `isTabActive`, plus `mutationDebounceTimer`.

Per-element state uses **`WeakSet`s, not booleans or tab-wide flags**:

- `extensionPausedSet` — the extension paused this video, so it may resume it.
- `userPausedSet` — the user paused it; never auto-resume it.
- `programmaticPauseSet` / `programmaticPlaySet` — one-shot handshakes consumed by the
  matching `pause`/`play` listener.
- `trackedVideos` — prevents duplicate listeners on the same element.

`isViewingContextActive()` = `!document.hidden && isTabActive && isWindowFocused`.

Exact gates:

```text
Pause:  !video.paused && !userPausedSet.has(video)
Resume: video.paused && extensionPausedSet.has(video) && !userPausedSet.has(video)
```

`playVideoElement()` deletes `extensionPausedSet` before calling `play()` and re-adds it if the
promise rejects, so a later reconcile can retry. Preserve that failure path.

## Messaging Protocol

| Type | Direction | Payload / reply |
|---|---|---|
| `GET_TAB_INIT` | content → background | reply `{ tabId, tabEnabled }`; handler returns `true` |
| `FOCUS_STATE_UPDATE` | background → content | `{ windowFocused?, tabActive? }` — **partial updates** |
| `SET_ENABLED` | popup → content | `{ enabled }` |
| `SET_BLOCK_PIP` | popup → content | `{ blockPiP }` |
| `SET_TAB_ENABLED` | popup → content | `{ tabEnabled }` |
| `GET_STATUS` | popup → content | reply `{ enabled, blockPiP, tabEnabled, totalVideos, playingVideos, isContextActive }` |

- A `FOCUS_STATE_UPDATE` omitting `windowFocused` or `tabActive` means **unchanged**, not
  `false`. The content handler already applies only boolean fields; keep that.
- Content listeners `return true` to keep the async channel open. Keep replies synchronous
  where they already are.
- Dual delivery (storage `onChanged` + direct `sendMessage`) is intentional and idempotent.
  Popup writes storage first, then best-effort messages; it must not depend on delivery.

## Non-Negotiable Constraints

- **Manifest V3 only.** No `background.scripts`, `persistent`, `browser_action`, or MV2 APIs.
- **Minimal scope:** permissions `storage` and `tabs`; host/content matches limited to
  `*://*.youtube.com/*`. Do not add `<all_urls>`, `scripting`, or broad host access.
- **Per-tab isolation.** Never move `tab_<tabId>` state to `chrome.storage.local` and never
  store playback state in a service-worker global (workers are ephemeral). Multiple YouTube
  tabs must not affect each other.
- **`chrome.storage.session` access level.** `background.js` calls
  `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` on install so content
  scripts can read tab state. Keep the `setAccessLevel` feature check and the
  `chrome.storage.session || chrome.storage.local` fallback in both `background.js` and
  `popup.js`.
- **Manual pause wins.** A non-programmatic `pause` while the context is active marks the
  video in `userPausedSet`. Disabling extension/tab auto-pause must resume only videos in
  `extensionPausedSet`; never resurrect a manual pause.
- **Multiple videos.** `getVideos()` returns *all* `<video>` elements. Do not replace it with
  `document.querySelector('video')`; playlists/embeds can expose several.
- **Duplicate signals are normal.** Never assume one action produces one event, and never
  call `pause()`/`play()` without the state checks above.
- **YouTube SPA.** Video elements are created/replaced. Handle `yt-navigate-finish`,
  `spadated`, and `popstate` (immediate + 200 ms reconcile). The `MutationObserver` on
  `document.documentElement` is discovery-only, debounced 100 ms; do not turn it into a
  general-purpose action trigger.
- **Popup safety.** `init()` must never throw: non-YouTube tabs show `—` and a disabled tab
  toggle; missing content script yields `null` status. Wrap `chrome.tabs.sendMessage` in
  `try/catch`.
- **`video.play()` returns a promise.** Always handle rejection and keep internal state
  consistent; never treat a call as proof playback resumed.
- **Chromium target.** `PROMPT.md` names Chrome, Comet, and other Chromium browsers. Do not
  claim support for a browser you have not loaded the unpacked build in; `disablePictureInPicture`
  and PiP APIs are the usual portability limits.

## Docs Drift — Trust Code, Not Prose

`README.md` predates v2.3.0 and is wrong in places:

- Its sequence diagrams mention `isProcessingAction` and `broadcastFocusState()`. Neither
  exists; the real names are `programmaticPauseSet`/`programmaticPlaySet` and
  `notifyYouTubeTabs()`.
- Its diagrams assume one video and no per-tab toggle. The code handles many videos plus
  `tabEnabled` and `blockPiP`.
- Its project structure omits `scripts/`, `CHANGELOG.md`, `CONTRIBUTING.md`, `PROMPT.md`,
  and `LICENSE`.

`CHANGELOG.md` jumps from 1.3.0 to 2.3.0. `PROMPT.md` is a historical prompt log, not a spec.
`content.js` also listens for a custom `spadated` event allowlisted in `.vscode/settings.json`;
verify against live YouTube before renaming it.

When docs and code disagree, the code is authoritative — then fix the doc rather than
"fixing" the code to match it.

## Verification

Automated: `node scripts/test_tab_auto_pause.js`.

Manual matrix (the test only simulates part of this):

| Scenario | Expected |
|---|---|
| Switch YouTube → another tab | Pause |
| Return to YouTube | Resume only if extension paused it |
| Switch to another browser window | Pause |
| Return to browser window | Resume only if extension paused it |
| Minimize / restore browser | Pause/resume on the observable visibility or focus signal |
| User manually pauses, leaves, returns | Stays paused |
| YouTube SPA navigation (click video, back/forward) | Extension keeps working on the new video |
| Browser refresh | Extension keeps working |
| Multiple YouTube tabs | No state leak; each tab independent |
| Per-tab toggle OFF on one tab | That tab keeps playing while another tab still pauses |
| `blockPiP` ON | Active PiP exits and re-entry is blocked while inactive; restored when active |
| Non-YouTube page / popup there | No runtime errors; stats show `—` |
| Rapid focus switching | No duplicate or unstable pause/play transitions |

The test cannot prove real YouTube behavior, DOM replacement timing, or PiP support. Say so
explicitly when reporting.

## Reporting Completed Work

1. **Root cause** per issue:
   ```text
   File:
   Problem:
   Root Cause:
   Impact:
   Fix:
   ```
   Name the listener/function, the event it actually receives, the state it reads, and the
   failing path. "The listener isn't working" is not a root cause.
2. **Architecture** summary if behavior changed (event sources, state, video discovery, SPA,
   messaging).
3. **Changed files**, then the **complete contents** of each changed file — no snippets and no
   `// existing code` placeholders (established convention in `PROMPT.md`).
4. **Testing:** what was actually run or manually verified, and what was not.
5. **Known limitations** (autoplay policy, YouTube DOM/PiP, untested browsers).

Do not rewrite functioning code without a technical reason, and do not claim a fix works
unless the implementation and verification support it.
