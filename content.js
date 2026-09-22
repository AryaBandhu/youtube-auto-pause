/**
 * YouTube Auto-Pause — content.js
 *
 * Automatically pauses YouTube videos when the user leaves the viewing context
 * (tab switch, window switch, or window blur) and resumes playback upon return.
 * Protects manual user pauses, handles YouTube SPA dynamic video elements,
 * and manages Picture-in-Picture (PiP) behavior based on user toggle settings.
 *
 * Critical design note: The `play` event listener is the primary guard against
 * YouTube's internal player overriding our pause in a background tab. Because
 * Chromium throttles setTimeout/setInterval/rAF to 4-second ticks in hidden tabs,
 * any timer-based re-pause would be delayed by exactly 4 seconds. The `play` event
 * fires synchronously on the HTMLMediaElement and is NOT subject to background
 * throttling, making it the only reliable mechanism.
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────

  let enabled = true;
  let blockPiP = false;
  let isWindowFocused = document.hasFocus();
  let isTabActive = !document.hidden;

  /** Track videos programmatically paused by this extension */
  const extensionPausedSet = new WeakSet();

  /** Track videos explicitly paused by the user */
  const userPausedSet = new WeakSet();

  /** Handshake tracking for extension-initiated pauses */
  const programmaticPauseSet = new WeakSet();

  /** Handshake tracking for extension-initiated play calls */
  const programmaticPlaySet = new WeakSet();

  /** Track videos with event listeners attached */
  const trackedVideos = new WeakSet();

  /** Debounce timer for DOM mutations */
  let mutationDebounceTimer = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Determines if the current YouTube tab viewing context is active.
   * A context is active if the tab is visible, the tab is active, and the
   * browser window is focused.
   */
  function isViewingContextActive() {
    return !document.hidden && isTabActive && isWindowFocused;
  }

  /** Get all <video> elements present in the DOM */
  function getVideos() {
    return Array.from(document.querySelectorAll('video'));
  }

  /** Count currently playing videos */
  function getPlayingVideoCount() {
    return getVideos().filter((v) => !v.paused && !v.ended && v.readyState > 2).length;
  }

  /** Safely exit Picture-in-Picture if active */
  function exitPiPIfActive() {
    if (typeof document.exitPictureInPicture === 'function' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {
        // Silently catch browser PiP rejection
      });
    }
  }

  /**
   * Pause a video element. Sets handshake flag so the `pause` event listener
   * knows this was extension-initiated and does not record it as a user pause.
   */
  function pauseVideoElement(video) {
    if (video.paused) return; // Already paused, skip

    programmaticPauseSet.add(video);
    extensionPausedSet.add(video);
    try {
      video.pause();
    } catch (err) {
      programmaticPauseSet.delete(video);
      extensionPausedSet.delete(video);
      console.warn('YouTube Auto-Pause: pause error', err);
    }
  }

  /**
   * Resume a video element. Sets handshake flag so the `play` event listener
   * knows this was extension-initiated and does not re-pause it.
   */
  function playVideoElement(video) {
    programmaticPlaySet.add(video);
    extensionPausedSet.delete(video);

    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err) => {
          // Play was rejected (e.g. autoplay policy). Restore extensionPaused
          // state so a future reconciliation can retry.
          extensionPausedSet.add(video);
          programmaticPlaySet.delete(video);
          console.warn('YouTube Auto-Pause: play promise rejected', err);
        });
      }
    } catch (err) {
      extensionPausedSet.add(video);
      programmaticPlaySet.delete(video);
      console.warn('YouTube Auto-Pause: play call error', err);
    }
  }

  /**
   * Attach pause/play/PiP listeners to a video element.
   *
   * The `play` event listener is the CRITICAL guard: if YouTube's internal
   * DASH player, ad stitcher, or quality-switch logic calls video.play() in a
   * background tab after the extension paused it, this handler fires
   * synchronously (not throttled by Chromium) and immediately re-pauses.
   */
  function attachVideoListeners(video) {
    if (!video || trackedVideos.has(video)) return;
    trackedVideos.add(video);

    video.addEventListener('pause', () => {
      // If pause was initiated by extension, consume handshake flag
      if (programmaticPauseSet.has(video)) {
        programmaticPauseSet.delete(video);
        return;
      }

      // If paused while viewing context is active and not extension-driven,
      // this is a manual user pause (click, spacebar, YouTube UI)
      if (isViewingContextActive()) {
        userPausedSet.add(video);
        extensionPausedSet.delete(video);
      }
    });

    video.addEventListener('play', () => {
      // If play was initiated by the extension (resuming on tab return),
      // consume handshake flag and allow it through
      if (programmaticPlaySet.has(video)) {
        programmaticPlaySet.delete(video);
        userPausedSet.delete(video);
        extensionPausedSet.delete(video);
        return;
      }

      // ── CRITICAL GUARD ──
      // If the viewing context is NOT active (tab hidden, window unfocused)
      // and the extension is enabled, this play event was triggered by
      // YouTube's internal player (DASH rebuffer, ad transition, quality
      // switch, stream keepalive). Immediately re-pause it synchronously.
      // This fires on the HTMLMediaElement event, NOT subject to Chrome's
      // 4-second background timer throttling.
      if (enabled && !isViewingContextActive()) {
        programmaticPauseSet.add(video);
        extensionPausedSet.add(video);
        try {
          video.pause();
        } catch {
          programmaticPauseSet.delete(video);
          extensionPausedSet.delete(video);
        }
        return;
      }

      // Context IS active: user manually played the video
      userPausedSet.delete(video);
      extensionPausedSet.delete(video);
    });

    // Guard against entering PiP while context is inactive and blockPiP is enabled
    video.addEventListener('enterpictureinpicture', () => {
      if (blockPiP && !isViewingContextActive()) {
        exitPiPIfActive();
      }
    });
  }

  // ─── Core Playback & PiP Reconciliation ────────────────────────────────────

  function reconcilePlaybackState() {
    // Sync DOM visibility state
    if (document.hidden) {
      isTabActive = false;
    }

    const videos = getVideos();
    videos.forEach(attachVideoListeners);

    const active = isViewingContextActive();

    // ─── Picture-in-Picture Management ───
    if (blockPiP) {
      if (!active) {
        exitPiPIfActive();
        videos.forEach((video) => {
          try {
            if (!video.disablePictureInPicture) video.disablePictureInPicture = true;
          } catch {}
        });
      } else {
        videos.forEach((video) => {
          try {
            if (video.disablePictureInPicture) video.disablePictureInPicture = false;
          } catch {}
        });
      }
    } else {
      videos.forEach((video) => {
        try {
          if (video.disablePictureInPicture) video.disablePictureInPicture = false;
        } catch {}
      });
    }

    // ─── Auto-Pause / Resume Management ───
    if (!enabled) return;

    if (!active) {
      // Pause playing videos that were not manually paused by the user
      videos.forEach((video) => {
        // A currently playing video cannot be in the user-paused state
        if (!video.paused) {
          userPausedSet.delete(video);
        }

        if (!video.paused && !userPausedSet.has(video)) {
          pauseVideoElement(video);
        }
      });
    } else {
      // Resume videos previously paused by this extension
      videos.forEach((video) => {
        if (video.paused && extensionPausedSet.has(video) && !userPausedSet.has(video)) {
          playVideoElement(video);
        }
      });
    }
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────

  // Document visibility change (tab switch within browser).
  // Executed synchronously — no setTimeout/rAF to avoid 4s background throttle.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isTabActive = false;
    } else {
      isTabActive = true;
      isWindowFocused = true;
    }
    reconcilePlaybackState();
  });

  // Window focus & blur
  window.addEventListener('focus', () => {
    isWindowFocused = true;
    isTabActive = !document.hidden;
    reconcilePlaybackState();
  });

  window.addEventListener('blur', () => {
    isWindowFocused = document.hasFocus();
    reconcilePlaybackState();
  });

  // YouTube SPA Navigation Events
  const handleSPANavigation = () => {
    reconcilePlaybackState();
    setTimeout(() => {
      reconcilePlaybackState();
    }, 200);
  };

  document.addEventListener('yt-navigate-finish', handleSPANavigation);
  document.addEventListener('spadated', handleSPANavigation);
  window.addEventListener('popstate', handleSPANavigation);

  // Dynamic Video Mutation Observer — only used for discovering new <video>
  // elements after SPA navigation. The debounce timer may be throttled in
  // background tabs, but the `play` event listener (above) is the primary
  // guard for background-tab re-pause, not this observer.
  const observer = new MutationObserver(() => {
    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
      reconcilePlaybackState();
    }, 100);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  // ─── Messaging ────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'FOCUS_STATE_UPDATE') {
      if (typeof message.windowFocused === 'boolean') {
        isWindowFocused = message.windowFocused;
      }
      if (typeof message.tabActive === 'boolean') {
        isTabActive = message.tabActive;
      }
      reconcilePlaybackState();
      sendResponse({ ok: true });
    } else if (message.type === 'SET_ENABLED') {
      enabled = message.enabled;
      if (!enabled) {
        const videos = getVideos();
        videos.forEach((video) => {
          if (extensionPausedSet.has(video)) {
            playVideoElement(video);
          }
        });
      } else {
        reconcilePlaybackState();
      }
      sendResponse({ ok: true, enabled });
    } else if (message.type === 'SET_BLOCK_PIP') {
      blockPiP = message.blockPiP;
      reconcilePlaybackState();
      sendResponse({ ok: true, blockPiP });
    } else if (message.type === 'GET_STATUS') {
      const videos = getVideos();
      sendResponse({
        enabled,
        blockPiP,
        totalVideos: videos.length,
        playingVideos: getPlayingVideoCount(),
        isContextActive: isViewingContextActive()
      });
    }

    return true; // keep async channel open
  });

  // ─── Storage Change Listener ──────────────────────────────────────────────

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
        if (!enabled) {
          getVideos().forEach((video) => {
            if (extensionPausedSet.has(video)) {
              playVideoElement(video);
            }
          });
        } else {
          reconcilePlaybackState();
        }
      }
      if (changes.blockPiP) {
        blockPiP = changes.blockPiP.newValue;
        reconcilePlaybackState();
      }
    }
  });

  // ─── Initialization ───────────────────────────────────────────────────────

  chrome.storage.local.get({ enabled: true, blockPiP: false }, (result) => {
    enabled = result.enabled;
    blockPiP = result.blockPiP;
    reconcilePlaybackState();
  });
})();
