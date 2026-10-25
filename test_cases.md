# Test Cases — YouTube Auto-Pause Pro

This file documents every testable scenario for the extension. It serves as:

1. **Acceptance criteria** — a change is not complete until all cases pass
2. **Manual regression checklist** — run after any code change before releasing
3. **Source of truth** for the automated test (`scripts/test_tab_auto_pause.js`) and any future pytest port

---

## Quick-Start: Automated Suite

```bash
node scripts/test_tab_auto_pause.js
```

- Runs in Node (no browser, no dependencies).
- Exercises **background.js** for real, but **re-implements** content.js / popup.js logic inline.
- Passes on the current codebase.
- **After any change to pause/resume or popup logic you must update the mirror in the test** and run it again.
- The test does **not** cover: real YouTube DOM, SPA navigation timing, PiP API presence, or browser autoplay policies — those require manual verification.

---

## Test Matrix

| ID | Scenario | Trigger | Preconditions | Expected Result | Automated? | Manual Steps |
|----|----------|---------|---------------|----------------|:----------:|--------------|
| TC-01 | Tab switch away | `document.hidden` + `tabs.onActivated` | Playing video, extension ON, tabEnabled ON | Video pauses; `extensionPausedSet` has video | ✅ | Open YT video → play → switch tab → verify pause |
| TC-02 | Tab switch back | `visibilitychange` (visible) + `tabs.onActivated` | Video paused by extension (TC-01) | Video resumes; `extensionPausedSet` cleared | ✅ | Return to YT tab → verify resume |
| TC-03 | Window blur | `window.blur` + `windows.onFocusChanged` → `WINDOW_ID_NONE` | Playing video, extension ON | Video pauses | ✅ | Alt+Tab to another app → verify pause |
| TC-04 | Window focus | `window.focus` + `windows.onFocusChanged` → windowId | Video paused by extension (TC-03) | Video resumes | ✅ | Alt+Tab back → verify resume |
| TC-05 | Minimize / restore | OS minimize → `visibilitychange`/`blur`; restore → `focus`/`visible` | Playing video, extension ON | Pause on minimize, resume on restore | ❌ | Minimize browser window → restore → verify |
| TC-06 | Manual pause protection | User clicks pause button while context active | Playing video, extension ON | Video pauses; marked in `userPausedSet` | ✅ | Play → click YT pause button → leave tab → return → **must stay paused** |
| TC-07 | Manual pause, then leave, then return | Manual pause → tab switch → tab return | Video manually paused | Remains paused on return | ✅ | Same as TC-06, explicit return step |
| TC-08 | SPA navigation: click another video | `yt-navigate-finish` | Extension ON, video playing | New video detected, auto-pause works on leave | ❌ | Play video → click another in sidebar → switch tab → verify pause |
| TC-09 | SPA navigation: browser back | `popstate` | Extension ON, video playing | Extension re-binds to previous video | ❌ | Play → click another → browser back → switch tab → verify pause |
| TC-10 | SPA navigation: browser forward | `popstate` | Extension ON, video playing | Extension re-binds to forward video | ❌ | After TC-09 → browser forward → switch tab → verify pause |
| TC-11 | YouTube search / homepage nav | `spadated` | Extension ON | Extension continues working | ❌ | Search → click result → play → switch tab → verify pause |
| TC-12 | Browser refresh | F5 / Ctrl+R | Extension ON, video playing | Extension re-initializes, works | ❌ | Play → refresh → switch tab → verify pause |
| TC-13 | Multiple YouTube tabs — isolation | Tab A playing, Tab B playing | Both tabs have extension | Switching Tab A pauses only A; Tab B unaffected | ✅ | Open two YT videos in separate tabs → play both → switch away from A → verify B still plays |
| TC-14 | Per-tab toggle OFF | `SET_TAB_ENABLED` with `false` | Extension ON, tabEnabled OFF | Video **continues playing** in background | ✅ | Popup → "Auto-Pause for This Tab" OFF → switch tab → video keeps playing |
| TC-15 | Per-tab toggle OFF, other tab ON | Tab A OFF, Tab B ON | Extension ON | Tab A plays in background, Tab B pauses | ✅ | Two tabs, different toggle states → verify independence |
| TC-16 | Per-tab state cleanup on close | `tabs.onRemoved` | Tab with `tab_<id>` = false | Storage key deleted | ✅ | Turn per-tab OFF → close tab → reload extension → new tab defaults to ON |
| TC-17 | Global toggle OFF | `SET_ENABLED` with `false` | Extension ON, video paused by extension | All extension-paused videos resume | ✅ | Popup → main toggle OFF → verify paused video resumes |
| TC-18 | Global toggle ON | `SET_ENABLED` with `true` | Extension OFF, video playing | Auto-pause re-activates on next leave | ✅ | Popup → main toggle ON → switch tab → verify pause |
| TC-19 | PiP block ON — exit active PiP | `blockPiP` = true, context becomes inactive | Video in PiP, extension ON | `exitPictureInPicture()` called, PiP closed | ❌ | Enable PiP block → enter PiP → switch tab → verify PiP exits |
| TC-20 | PiP block ON — prevent entry | `blockPiP` = true, context inactive | Video not in PiP | `enterpictureinpicture` listener calls `exitPictureInPicture()` | ❌ | Enable PiP block → switch tab → try to enter PiP via YT UI → verify blocked |
| TC-21 | PiP block OFF — no interference | `blockPiP` = false | Any context | PiP works normally | ❌ | Disable PiP block → enter PiP → switch tab → PiP stays open |
| TC-22 | Popup on non-YouTube page | Open popup on `example.com` | Extension loaded | No crash; stats show `—`; tab toggle disabled with "Unavailable" text | ✅ | Navigate to non-YT page → click extension icon → verify UI |
| TC-23 | Popup on YouTube before content script ready | Open popup immediately after reload | Content script not yet injected | No crash; falls back to storage defaults | ❌ | Refresh YT → quickly open popup → verify no error |
| TC-24 | Rapid focus switching | Quick Alt+Tab / tab hopping | Extension ON | No duplicate pauses/plays; state stays consistent | ✅ (partial) | Rapidly switch between 3+ tabs/windows → verify no flicker or double-pause |
| TC-25 | `video.play()` rejection | Autoplay policy blocks play | Extension tries to resume | Promise caught; `extensionPausedSet` re-added; no unhandled rejection | ❌ | Requires browser with strict autoplay; or mock in DevTools |
| TC-26 | Storage sync across tabs | Change global toggle in popup | Multiple YT tabs open | All tabs receive `onChanged` and update | ❌ | Open two tabs → popup toggle OFF → verify both tabs resume |

---

## How to Run Each Manual Test

### Environment
- Chromium-based browser (Chrome, Edge, Brave, Vivaldi) with **Developer mode** on
- Extension loaded **unpacked** from repo root
- At least one YouTube video page open (`https://www.youtube.com/watch?v=...`)

### Common Setup
1. `git pull` latest
2. `chrome://extensions` → **Reload** extension
3. Refresh every open YouTube tab (content scripts don't hot-reload)

### Example: TC-06 Manual Pause Protection
```
1. Open youtube.com/watch?v=ANY_VIDEO
2. Press Play
3. Click the native YouTube pause button (or press 'k')
4. Switch to another tab (Ctrl+Tab)
5. Wait 1 s
6. Switch back to YouTube tab
7. Observe: video STAYS PAUSED
```

### Example: TC-13 Multiple Tab Isolation
```
1. Open Tab A: youtube.com/watch?v=VIDEO_A → Play
2. Open Tab B: youtube.com/watch?v=VIDEO_B → Play
3. Switch to a third tab (non-YouTube)
4. Observe: Tab A paused, Tab B paused
5. Switch back to Tab A
6. Observe: Tab A resumes, Tab B remains paused (it's still in background)
```

### Example: TC-19/20 PiP Block
```
1. Popup → "Picture-in-Picture" toggle ON (green)
2. Play a video → right-click → Picture-in-Picture
3. Switch to another tab
4. Observe: PiP window closes automatically
5. Switch back → try to re-enter PiP via right-click menu
6. Observe: PiP does not open (or closes immediately)
```

---

## Extending to pytest (Optional)

If the team wants a Python/pytest harness that drives a real browser:

```python
# tests/conftest.py
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

@pytest.fixture(scope="session")
def extension_path():
    return "E:/Projects/youtube-auto-pause-pro"  # repo root

@pytest.fixture(scope="session")
def driver(extension_path):
    opts = Options()
    opts.add_argument(f"--load-extension={extension_path}")
    opts.add_argument("--disable-extensions-except=" + extension_path)
    d = webdriver.Chrome(options=opts)
    yield d
    d.quit()
```

```python
# tests/test_autopause.py
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

@pytest.mark.parametrize("video_url", [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
])
def test_tab_switch_pauses(driver, video_url):
    driver.get(video_url)
    # wait for player, click play, etc.
    # switch tab via driver.switch_to.window
    # assert video.paused via JS execution
    pass
```

**Not required** — the Node test is the mandated gate. Add pytest only if CI infra exists.

---

## CI Integration (Future)

```yaml
# .github/workflows/test.yml (example)
name: Test
on: [push, pull_request]
jobs:
  node-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node scripts/test_tab_auto_pause.js
  # manual matrix can't be automated without browser grid
```

---

## Tracking

- Add a row to the matrix for every new feature or bug fix
- Keep the **Automated?** column honest — if a case isn't in `scripts/test_tab_auto_pause.js`, mark ❌
- When porting a manual case to automated, move ✅ and update the test file

---

## Known Gaps (Cannot Fully Automate)

| Gap | Reason | Mitigation |
|-----|--------|------------|
| Real YouTube DOM / SPA timing | Requires browser + network | Manual TC-08…11 |
| PiP API presence / behavior | Varies by Chromium build | Manual TC-19…21; feature-detect in code |
| Browser autoplay policy | User/site-specific | Manual TC-25; promise-handling is unit-tested |
| Service worker wake-up latency | Event-driven, non-deterministic | Manual TC-24 rapid switching |
| Cross-browser (Chrome vs Edge vs Brave) | Different builds | Load unpacked in each; run manual matrix |

Document any new gap here when discovered.

---

## Sign-Off

Before tagging a release, the maintainer must:

- [ ] `node scripts/test_tab_auto_pause.js` passes
- [ ] All ✅ manual cases verified on at least Chrome latest
- [ ] Any ❌ cases with new code have a follow-up issue to automate
- [ ] `CHANGELOG.md` updated with version bump