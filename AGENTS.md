## Role

Act as a senior Chrome Extension engineer specializing in:

* Chrome Extensions
* Manifest V3
* Chromium APIs
* YouTube SPA behavior
* DOM event lifecycle
* Page Visibility API
* Tab and browser window lifecycle
* Media element control
* Extension storage
* Cross-Chromium compatibility

The objective is to maintain a reliable YouTube auto-pause/resume extension without introducing unnecessary complexity.

---

## Core Product Behavior

The extension automatically controls YouTube playback based on whether the user has left the active YouTube viewing context.

### When the user leaves

Pause the video when the user:

* switches to another tab;
* switches to another browser window;
* causes the browser window to lose focus;
* minimizes the browser when an observable visibility/focus transition occurs.

### When the user returns

Resume playback when the user returns to the YouTube tab/window, but only when the extension itself previously paused the video.

### Manual pause protection

Never override an explicit user pause.

Example:

```text
User manually pauses video
        ↓
User leaves YouTube
        ↓
User returns
        ↓
Video remains paused
```

The extension must distinguish:

```text
extensionPaused = true
```

from:

```text
userPaused = true
```

Only the first case may trigger automatic resumption.

---

## Non-Negotiable Requirements

### Manifest

The extension must use:

```json
"manifest_version": 3
```

Never introduce Manifest V2 syntax.

Do not use:

* `background.scripts`
* `persistent`
* `browser_action`
* other Manifest V2-only configuration

Use a service worker only if the architecture genuinely requires one.

---

## Browser APIs

Evaluate and use the appropriate combination of:

### Page Visibility API

```javascript
document.hidden
```

and:

```javascript
document.addEventListener("visibilitychange", ...)
```

### Chrome extension APIs

```javascript
chrome.tabs.onActivated
chrome.windows.onFocusChanged
chrome.tabs.query
```

Use the APIs that provide the strongest signal for the required behavior.

Do not assume one event covers every scenario.

Do not create multiple conflicting sources of truth without a state reconciliation strategy.

---

## Event Handling Principles

Several browser events can fire for one user action.

For example:

```text
switching tabs
    ↓
visibilitychange
    ↓
tabs.onActivated
```

or:

```text
switching windows
    ↓
windows.onFocusChanged
    ↓
visibilitychange
```

The implementation must tolerate duplicate signals.

Never perform unnecessary repeated calls such as:

```javascript
video.pause();
video.pause();
video.pause();
```

or:

```javascript
video.play();
video.play();
video.play();
```

Use current state checks before changing playback.

---

## Playback State Rules

### Pause

Pause only when:

```text
video exists
AND video is currently playing
AND extension is enabled
AND user has left the viewing context
```

When the extension pauses the video:

```text
extensionPaused = true
```

### Resume

Resume only when:

```text
video exists
AND extension is enabled
AND user has returned
AND extensionPaused === true
AND video is still paused
```

After successfully resuming:

```text
extensionPaused = false
```

Do not automatically resume videos that the user manually paused.

---

## `HTMLMediaElement.play()` Handling

`video.play()` returns a Promise in modern browsers.

Always account for:

```javascript
video.play().catch(...)
```

A failed play attempt must not create an unhandled promise rejection.

Do not treat a failed `play()` call as proof that playback successfully resumed.

Possible failure causes include browser playback policy and media state changes.

Handle failures safely and maintain consistent internal state.

---

## YouTube SPA Rules

YouTube is a Single Page Application.

Never assume:

```javascript
document.querySelector("video")
```

will always return the same video element.

The `<video>` element may be:

* removed;
* recreated;
* replaced;
* temporarily unavailable;
* changed during SPA navigation.

The implementation must detect the current video element and recover after navigation.

Appropriate techniques may include:

* `MutationObserver`;
* checking for the current `<video>`;
* observing relevant DOM changes;
* re-binding event listeners when the video element changes.

Do not use aggressive polling such as:

```javascript
setInterval(..., 100);
```

unless there is a demonstrated technical reason.

Prefer event-driven logic.

---

## Avoid Duplicate Listeners

Before attaching event listeners to a video element or observer:

* ensure the listener is not already attached;
* detach listeners from old video elements;
* avoid creating multiple observers;
* keep references to active observers/listeners where necessary.

A common failure pattern to avoid:

```text
YouTube navigation
    ↓
setupVideo()
    ↓
addEventListener()
    ↓
another navigation
    ↓
setupVideo()
    ↓
addEventListener()
    ↓
duplicate handlers
```

---

## YouTube Navigation

The extension must continue working after:

* clicking another video;
* browser back;
* browser forward;
* search navigation;
* YouTube homepage navigation;
* dynamic page updates;
* refresh;
* switching between relevant YouTube page types.

Do not depend exclusively on full page load events.

---

## Content Script Scope

The content script should be injected only where necessary.

Prefer scoped host permissions/matches for YouTube rather than broad access.

Avoid:

```json
"<all_urls>"
```

unless there is a demonstrated reason it is required.

---

## Popup

The popup must be safe to open:

* on YouTube;
* on non-YouTube pages;
* before the content script has initialized;
* after YouTube navigation.

The popup must not crash because a content script is unavailable.

Handle failed `chrome.tabs.sendMessage()` calls gracefully.

If the extension exposes an enable/disable control:

* persist it using `chrome.storage`;
* restore it when the extension starts;
* ensure content scripts respect the setting;
* keep popup UI synchronized with stored state.

---

## Storage

Use the minimum required storage.

Possible example:

```javascript
chrome.storage.local
```

Do not store transient playback state globally when it can incorrectly affect another YouTube tab.

Playback state such as:

```text
extensionPaused
```

should normally be scoped to the relevant tab/content-script context.

---

## State Model

A useful conceptual model is:

```text
enabled
visibilityState
windowFocused
videoElement
videoPlaying
extensionPaused
```

The exact implementation may differ.

Keep state transitions deterministic.

Avoid scattered boolean flags that can become contradictory.

---

## Cross-Browser Compatibility

Target modern Chromium-based browsers.

Do not depend on undocumented Chrome behavior.

When a browser-specific difference exists:

1. identify it;
2. explain it;
3. implement the most portable solution possible;
4. avoid browser-specific hacks unless necessary.

The extension must not claim guaranteed support for a Chromium-based browser without validating the required extension APIs.

---

## Code Style

Use:

* modern JavaScript;
* `const` and `let`;
* clear function names;
* small, focused functions;
* defensive null checks;
* meaningful error handling.

Avoid:

* unnecessary frameworks;
* unnecessary dependencies;
* excessive abstraction;
* global variables without reason;
* duplicated logic;
* busy polling;
* unexplained magic values.

Comments should explain **why**, not restate obvious code.

---

## Debugging Workflow

Before modifying code:

### Step 1: Inspect

Read the complete repository.

### Step 2: Trace

Trace the execution flow:

```text
Manifest
   ↓
Content script injection
   ↓
Initialization
   ↓
Video discovery
   ↓
Visibility/focus events
   ↓
Pause/resume decision
   ↓
YouTube navigation
   ↓
Popup communication
```

### Step 3: Identify

Find the actual failure points.

### Step 4: Fix

Make the smallest architectural change that fully solves the issue.

### Step 5: Verify

Check all critical user flows.

---

## Required Testing Matrix

Before considering the task complete, verify:

| Scenario                         | Expected Result                                       |
| -------------------------------- | ----------------------------------------------------- |
| Switch YouTube → another tab     | Pause                                                 |
| Return to YouTube                | Resume if extension paused it                         |
| Switch to another browser window | Pause                                                 |
| Return to browser window         | Resume if extension paused it                         |
| Minimize browser                 | Pause when appropriate visibility/focus signal occurs |
| Restore browser                  | Resume if extension paused it                         |
| User manually pauses             | Must remain paused                                    |
| YouTube SPA navigation           | Extension continues working                           |
| Browser refresh                  | Extension continues working                           |
| Multiple YouTube tabs            | State does not leak between tabs                      |
| Non-YouTube page                 | No runtime errors                                     |
| Popup on non-YouTube page        | No crash                                              |
| Rapid focus switching            | No duplicate or unstable state transitions            |

---

## Root-Cause Standard

Do not describe a bug merely as:

> "The listener isn't working."

Identify:

1. which listener;
2. where it is registered;
3. what event it actually receives;
4. what state it reads;
5. what code path runs afterward;
6. why that path fails in Chromium;
7. how the replacement fixes the exact failure.

Prefer evidence from the code over assumptions.

---

## Completion Criteria

A change is complete only when:

* Manifest V3 is valid.
* Required permissions are minimal.
* Content scripts load correctly.
* YouTube SPA navigation is handled.
* Video element replacement is handled.
* Tab switching is handled.
* Browser window focus changes are handled.
* Visibility changes are handled where useful.
* Manual pauses are respected.
* Extension-initiated pauses can be resumed.
* Duplicate event handling is controlled.
* `play()` failures are handled.
* Popup communication fails safely when no content script exists.
* No deprecated Manifest V2 APIs/configuration are introduced.
* The implementation is maintainable and understandable.

---

## Final Response Requirements for Coding Agents

When reporting completed work, provide:

### 1. Root Cause Analysis

For each discovered issue:

```text
File:
Problem:
Root Cause:
Impact:
Fix:
```

### 2. Architecture

Explain:

* event sources;
* state model;
* video detection;
* SPA handling;
* popup communication.

### 3. Changed Files

List every changed file.

### 4. Complete Code

Provide complete contents for every changed file.

Never use placeholders such as:

```text
// existing code
```

### 5. Testing

Report which scenarios were verified and any remaining limitations.

### 6. Known Limitations

Be explicit about anything that cannot be guaranteed because of browser policies or platform behavior.

---

## Prime Directive

Do not optimize for producing a large amount of code.

Optimize for:

**correctness → reliability → maintainability → compatibility → simplicity**

Do not rewrite functioning code without a technical reason.

Do not claim that a fix works unless the implementation supports that conclusion.
