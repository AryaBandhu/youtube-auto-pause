# Changelog

All notable changes to the YouTube Auto-Pause Chrome Extension are documented in this file.

---

## [1.0.0] - 2026-04-06

### Initial Release

- Basic auto-pause on tab switch using content script only.
- Popup UI with enable/disable toggle.
- Manifest V3 compliant.
- YouTube content script injected on `*.youtube.com/*`.

---

## [1.1.0] - 2026-08-19

### Added

- **Background service worker** (`background.js`) for reliable tab and window focus tracking.
  - `chrome.windows.onFocusChanged` listener for window switch detection.
  - `chrome.tabs.onActivated` listener for tab switch detection.
  - `chrome.tabs.onUpdated` listener for tab load completion on YouTube.
  - Broadcasts focus state to all open YouTube tabs.
- **YouTube SPA navigation support** — handles `yt-navigate-finish`, `spadated`, and `popstate` events.
- **MutationObserver** — detects dynamic `<video>` element creation and replacement by YouTube.
- **Manual pause protection** — distinguishes between user-initiated pauses and extension-initiated pauses using `extensionPausedSet` and `userPausedSet`.
- **Duplicate event handling** — `isProcessingAction` guard flag prevents redundant pause/play calls.
- **`play()` Promise handling** — safely catches `video.play()` rejections without unhandled promise rejections.
- **Popup live stats** — displays playing video count, total detected videos, and extension status (ON/OFF).
- **Storage-backed settings** — preferences persisted in `chrome.storage.local` and synced via `chrome.storage.onChanged` listeners.
- Added `tabs` permission to `manifest.json`.

### Changed

- Rewrote content script from scratch with IIFE structure and clear state model.
- Rewrote popup to communicate with content script for live status.
- Improved `safeSendMessage()` in background script to handle missing content scripts gracefully.

---

## [1.2.0] - 2026-08-20

### Added

- **Picture-in-Picture block toggle** — optional feature to prevent PiP when the viewing context is inactive.
  - Exits active PiP session when context becomes inactive.
  - Sets `disablePictureInPicture` attribute on video elements when block is enabled.
  - Restores PiP permission when context becomes active again.
  - Listens for `enterpictureinpicture` events to guard against PiP entry during inactive context.
- **PiP toggle in popup** — new toggle switch for Picture-in-Picture control with status display.
- **Storage initialization on install** — background script sets default values for `enabled` and `blockPiP` in `chrome.storage.local` when the extension is first installed.

### Changed

- Updated `content.js` to manage PiP state alongside pause/resume logic.
- Updated `popup.html` to include PiP toggle row with label and status text.
- Updated `popup.js` to handle PiP toggle persistence and messaging.
- Updated `popup.css` with styles for the PiP toggle row.

---

## [1.3.0] - 2026-08-22

### Added

- **Apache License 2.0** — added `LICENSE` file for open-source licensing.
- **AGENTS.md** — development guidelines and coding standards for AI coding agents.
- **PROMPT.md** — project requirements and technical specifications.
- **README.md** — comprehensive documentation covering installation, configuration, usage, troubleshooting, and contributing guidelines.
- **CHANGELOG.md** — this file, tracking version history.

---

## Known Limitations

- The extension cannot override browser-level autoplay policies. If the browser blocks `video.play()`, auto-resume may not work.
- The extension relies on YouTube's DOM structure. Major YouTube UI changes may temporarily affect video detection.
- Picture-in-Picture blocking depends on the `disablePictureInPicture` property, which may not be supported in all Chromium-based browsers.
- State is scoped per-tab via content script context, but rapid focus changes across many tabs may cause brief audio overlap before reconciliation completes.
