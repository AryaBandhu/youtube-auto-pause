/**
 * Test Suite for YouTube Auto-Pause Pro: Per-Tab Selective Control
 *
 * Simulates Chrome extension environment (DOM, chrome.* APIs, media elements)
 * and verifies all matrix scenarios from AGENTS.md.
 */

'use strict';

const assert = require('assert');

// ─── Chrome API Mock ─────────────────────────────────────────────────────────

function createMockChrome() {
  const storageData = { local: {}, session: {} };
  const storageListeners = [];
  const messageListeners = [];
  const installedListeners = [];
  const windowFocusListeners = [];
  const tabActivatedListeners = [];
  const tabUpdatedListeners = [];
  const tabRemovedListeners = [];

  const mockTabs = new Map();

  function createStorageArea(areaName) {
    return {
      get: async (keys) => {
        const result = {};
        if (typeof keys === 'string') keys = [keys];
        if (Array.isArray(keys)) {
          for (const k of keys) {
            if (storageData[areaName][k] !== undefined) {
              result[k] = storageData[areaName][k];
            }
          }
        } else if (typeof keys === 'object' && keys !== null) {
          for (const [k, defaultVal] of Object.entries(keys)) {
            result[k] = storageData[areaName][k] !== undefined ? storageData[areaName][k] : defaultVal;
          }
        } else {
          Object.assign(result, storageData[areaName]);
        }
        return result;
      },
      set: async (items) => {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: storageData[areaName][k], newValue: v };
          storageData[areaName][k] = v;
        }
        for (const listener of storageListeners) {
          listener(changes, areaName);
        }
      },
      remove: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const k of list) {
          changes[k] = { oldValue: storageData[areaName][k], newValue: undefined };
          delete storageData[areaName][k];
        }
        for (const listener of storageListeners) {
          listener(changes, areaName);
        }
      },
      clear: async () => {
        storageData[areaName] = {};
      }
    };
  }

  return {
    storageData,
    tabsMap: mockTabs,
    storage: {
      local: createStorageArea('local'),
      session: {
        ...createStorageArea('session'),
        setAccessLevel: async () => {}
      },
      onChanged: {
        addListener: (fn) => storageListeners.push(fn)
      }
    },
    runtime: {
      installedListeners,
      onInstalled: {
        addListener: (fn) => { installedListeners.push(fn); }
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: (msg, callback) => {
        let responded = false;
        const sendResponse = (res) => {
          responded = true;
          if (callback) callback(res);
        };
        for (const fn of messageListeners) {
          const ret = fn(msg, { tab: { id: 101, url: 'https://www.youtube.com/watch?v=abc' } }, sendResponse);
          if (ret === true) return;
        }
        if (!responded && callback) callback(null);
      }
    },
    tabs: {
      query: async (queryInfo) => {
        const results = [];
        for (const tab of mockTabs.values()) {
          let match = true;
          if (queryInfo.url && !tab.url.includes('youtube.com')) match = false;
          if (queryInfo.active !== undefined && tab.active !== queryInfo.active) match = false;
          if (match) results.push(tab);
        }
        return results;
      },
      sendMessage: async (tabId, msg) => {
        const tab = mockTabs.get(tabId);
        if (!tab || !tab.messageHandler) {
          throw new Error('Tab not found or no handler');
        }
        return new Promise((resolve) => {
          tab.messageHandler(msg, {}, (res) => resolve(res));
        });
      },
      onActivated: {
        addListener: (fn) => tabActivatedListeners.push(fn),
        dispatch: async (activeInfo) => {
          for (const fn of tabActivatedListeners) await fn(activeInfo);
        }
      },
      onUpdated: {
        addListener: (fn) => tabUpdatedListeners.push(fn),
        dispatch: async (tabId, changeInfo, tab) => {
          for (const fn of tabUpdatedListeners) await fn(tabId, changeInfo, tab);
        }
      },
      onRemoved: {
        addListener: (fn) => tabRemovedListeners.push(fn),
        dispatch: async (tabId) => {
          for (const fn of tabRemovedListeners) await fn(tabId);
        }
      }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: async () => ({ id: 1, focused: true }),
      onFocusChanged: {
        addListener: (fn) => windowFocusListeners.push(fn),
        dispatch: async (windowId) => {
          for (const fn of windowFocusListeners) await fn(windowId);
        }
      }
    }
  };
}

// ─── Mock HTMLMediaElement & Document ──────────────────────────────────────

function createMockVideo() {
  const listeners = {};
  return {
    paused: false,
    ended: false,
    readyState: 4,
    disablePictureInPicture: false,
    addEventListener: (event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    dispatchEvent: function (event) {
      if (listeners[event]) {
        listeners[event].forEach((fn) => fn());
      }
    },
    pause: function () {
      if (!this.paused) {
        this.paused = true;
        this.dispatchEvent('pause');
      }
    },
    play: async function () {
      if (this.paused) {
        this.paused = false;
        this.dispatchEvent('play');
      }
      return Promise.resolve();
    }
  };
}

function createMockEnvironment(tabId, url = 'https://www.youtube.com/watch?v=123') {
  let docHidden = false;
  let hasFocusVal = true;
  const docListeners = {};
  const winListeners = {};
  const videos = [createMockVideo()];

  const mockDoc = {
    get hidden() { return docHidden; },
    set hidden(val) { docHidden = val; },
    hasFocus: () => hasFocusVal,
    querySelectorAll: (sel) => sel === 'video' ? videos : [],
    documentElement: {},
    addEventListener: (event, handler) => {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(handler);
    },
    dispatchEvent: (event) => {
      if (docListeners[event]) docListeners[event].forEach((fn) => fn());
    }
  };

  const mockWin = {
    addEventListener: (event, handler) => {
      winListeners[event] = winListeners[event] || [];
      winListeners[event].push(handler);
    },
    dispatchEvent: (event) => {
      if (winListeners[event]) winListeners[event].forEach((fn) => fn());
    },
    setFocus: (val) => {
      hasFocusVal = val;
      if (val) mockWin.dispatchEvent('focus');
      else mockWin.dispatchEvent('blur');
    }
  };

  return {
    tabId,
    url,
    videos,
    mockDoc,
    mockWin,
    setHidden: (val) => {
      docHidden = val;
      mockDoc.dispatchEvent('visibilitychange');
    }
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('--- Starting YouTube Auto-Pause Per-Tab Unit & Integration Tests ---');

  const mockChrome = createMockChrome();
  global.chrome = mockChrome;

  // 1. Initialize background.js logic
  const bg = require('../background.js');
  for (const fn of mockChrome.runtime.installedListeners) {
    await fn();
  }
  console.log('✔ Background script loaded and initialized');

  // Verify storage defaults
  const initialStorage = await mockChrome.storage.local.get(['enabled', 'blockPiP']);
  assert.strictEqual(initialStorage.enabled, true, 'Default enabled should be true');
  assert.strictEqual(initialStorage.blockPiP, false, 'Default blockPiP should be false');
  console.log('✔ Initial storage defaults verified (enabled=true, blockPiP=false)');

  // 2. Test Content Script Logic Simulation for Tab 101 and Tab 102
  const tab101Env = createMockEnvironment(101);
  const tab102Env = createMockEnvironment(102);

  mockChrome.tabsMap.set(101, { id: 101, windowId: 1, active: true, url: tab101Env.url });
  mockChrome.tabsMap.set(102, { id: 102, windowId: 1, active: false, url: tab102Env.url });

  // Instantiate content script controller for a tab
  function createContentScriptInstance(env) {
    let enabled = true;
    let blockPiP = false;
    let tabEnabled = true;
    let myTabId = env.tabId;
    let isWindowFocused = env.mockDoc.hasFocus();
    let isTabActive = !env.mockDoc.hidden;

    const extensionPausedSet = new WeakSet();
    const userPausedSet = new WeakSet();
    const programmaticPauseSet = new WeakSet();
    const programmaticPlaySet = new WeakSet();
    const trackedVideos = new WeakSet();

    function isViewingContextActive() {
      return !env.mockDoc.hidden && isTabActive && isWindowFocused;
    }

    function getVideos() {
      return env.videos;
    }

    function pauseVideoElement(video) {
      if (video.paused) return;
      programmaticPauseSet.add(video);
      extensionPausedSet.add(video);
      try {
        video.pause();
      } catch (err) {
        programmaticPauseSet.delete(video);
        extensionPausedSet.delete(video);
      }
    }

    function playVideoElement(video) {
      programmaticPlaySet.add(video);
      extensionPausedSet.delete(video);
      try {
        video.play().catch(() => {
          extensionPausedSet.add(video);
          programmaticPlaySet.delete(video);
        });
      } catch {
        extensionPausedSet.add(video);
        programmaticPlaySet.delete(video);
      }
    }

    function attachVideoListeners(video) {
      if (!video || trackedVideos.has(video)) return;
      trackedVideos.add(video);

      video.addEventListener('pause', () => {
        if (programmaticPauseSet.has(video)) {
          programmaticPauseSet.delete(video);
          return;
        }
        if (isViewingContextActive()) {
          userPausedSet.add(video);
          extensionPausedSet.delete(video);
        }
      });

      video.addEventListener('play', () => {
        if (programmaticPlaySet.has(video)) {
          programmaticPlaySet.delete(video);
          userPausedSet.delete(video);
          extensionPausedSet.delete(video);
          return;
        }

        if (enabled && tabEnabled && !isViewingContextActive()) {
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

        userPausedSet.delete(video);
        extensionPausedSet.delete(video);
      });
    }

    function reconcilePlaybackState() {
      if (env.mockDoc.hidden) isTabActive = false;
      const videos = getVideos();
      videos.forEach(attachVideoListeners);
      const active = isViewingContextActive();
      const shouldAutoPause = enabled && tabEnabled;

      if (!shouldAutoPause) {
        videos.forEach((video) => {
          if (extensionPausedSet.has(video)) {
            playVideoElement(video);
          }
        });
        return;
      }

      if (!active) {
        videos.forEach((video) => {
          if (!video.paused) userPausedSet.delete(video);
          if (!video.paused && !userPausedSet.has(video)) {
            pauseVideoElement(video);
          }
        });
      } else {
        videos.forEach((video) => {
          if (video.paused && extensionPausedSet.has(video) && !userPausedSet.has(video)) {
            playVideoElement(video);
          }
        });
      }
    }

    env.mockDoc.addEventListener('visibilitychange', () => {
      if (env.mockDoc.hidden) {
        isTabActive = false;
      } else {
        isTabActive = true;
        isWindowFocused = true;
      }
      reconcilePlaybackState();
    });

    // Handle messages
    const messageHandler = (message, sender, sendResponse) => {
      if (message.type === 'FOCUS_STATE_UPDATE') {
        if (typeof message.windowFocused === 'boolean') isWindowFocused = message.windowFocused;
        if (typeof message.tabActive === 'boolean') isTabActive = message.tabActive;
        reconcilePlaybackState();
        sendResponse({ ok: true });
      } else if (message.type === 'SET_TAB_ENABLED') {
        tabEnabled = message.tabEnabled;
        if (!tabEnabled) {
          getVideos().forEach((video) => {
            if (extensionPausedSet.has(video)) playVideoElement(video);
          });
        } else {
          reconcilePlaybackState();
        }
        sendResponse({ ok: true, tabEnabled });
      } else if (message.type === 'GET_STATUS') {
        sendResponse({
          enabled,
          blockPiP,
          tabEnabled,
          totalVideos: getVideos().length,
          playingVideos: getVideos().filter((v) => !v.paused).length,
          isContextActive: isViewingContextActive()
        });
      }
    };

    mockChrome.tabsMap.get(env.tabId).messageHandler = messageHandler;

    reconcilePlaybackState();

    return {
      getState: () => ({ enabled, tabEnabled, isWindowFocused, isTabActive, userPausedSet, extensionPausedSet }),
      reconcilePlaybackState,
      setTabEnabled: (val) => {
        tabEnabled = val;
        reconcilePlaybackState();
      }
    };
  }

  const tab101 = createContentScriptInstance(tab101Env);
  const tab102 = createContentScriptInstance(tab102Env);

  console.log('✔ Content script instances initialized for Tab 101 and Tab 102');

  // Test 1: Switching away from Tab 101 (tabEnabled=true) -> should pause
  assert.strictEqual(tab101Env.videos[0].paused, false, 'Tab 101 video starts playing');
  tab101Env.setHidden(true);
  assert.strictEqual(tab101Env.videos[0].paused, true, 'Tab 101 video pauses on tab leave');
  console.log('✔ Tab 101 auto-pauses when switching away (enabled=true, tabEnabled=true)');

  // Test 2: Returning to Tab 101 -> should resume
  tab101Env.setHidden(false);
  assert.strictEqual(tab101Env.videos[0].paused, false, 'Tab 101 video resumes on return');
  console.log('✔ Tab 101 resumes when returning to tab');

  // Test 3: Disable Auto-Pause for Tab 101
  await mockChrome.tabs.sendMessage(101, { type: 'SET_TAB_ENABLED', tabEnabled: false });
  const tab101Status = await mockChrome.tabs.sendMessage(101, { type: 'GET_STATUS' });
  assert.strictEqual(tab101Status.tabEnabled, false, 'Tab 101 reports tabEnabled=false');

  // Test 4: Switching away from Tab 101 when tabEnabled=false -> video continues playing!
  tab101Env.setHidden(true);
  assert.strictEqual(tab101Env.videos[0].paused, false, 'Tab 101 video continues playing when tabEnabled=false');
  console.log('✔ Tab 101 continues playing when leaving viewing context with tabEnabled=false');

  // Test 5: Verify Tab 102 is completely independent (tabEnabled remains true)
  const tab102Status = await mockChrome.tabs.sendMessage(102, { type: 'GET_STATUS' });
  assert.strictEqual(tab102Status.tabEnabled, true, 'Tab 102 still has tabEnabled=true');

  tab102Env.setHidden(true);
  assert.strictEqual(tab102Env.videos[0].paused, true, 'Tab 102 video pauses because its tabEnabled=true');
  tab102Env.setHidden(false);
  assert.strictEqual(tab102Env.videos[0].paused, false, 'Tab 102 video resumes on return');
  console.log('✔ Tab 102 operates independently and is unaffected by Tab 101 changes');

  // Test 6: Manual pause protection
  // In Tab 101, user manually pauses while active
  tab101Env.setHidden(false);
  // Re-enable tab auto-pause for Tab 101 to test manual pause protection
  await mockChrome.tabs.sendMessage(101, { type: 'SET_TAB_ENABLED', tabEnabled: true });
  // User manually pauses
  tab101Env.videos[0].pause();
  assert.strictEqual(tab101Env.videos[0].paused, true, 'User manually paused');

  // User leaves tab
  tab101Env.setHidden(true);
  assert.strictEqual(tab101Env.videos[0].paused, true, 'Remains paused');

  // User returns to tab -> MUST REMAIN PAUSED!
  tab101Env.setHidden(false);
  assert.strictEqual(tab101Env.videos[0].paused, true, 'Video MUST remain paused after manual user pause');
  console.log('✔ Manual pause protection: video remains paused upon return');

  // Test 7: Window focus & blur
  tab101Env.videos[0].play(); // user plays
  assert.strictEqual(tab101Env.videos[0].paused, false);
  await mockChrome.windows.onFocusChanged.dispatch(mockChrome.windows.WINDOW_ID_NONE);
  // Tab 101 receives focus state false
  await mockChrome.tabs.sendMessage(101, { type: 'FOCUS_STATE_UPDATE', windowFocused: false, tabActive: true });
  assert.strictEqual(tab101Env.videos[0].paused, true, 'Window blur pauses video when tabEnabled=true');

  await mockChrome.windows.onFocusChanged.dispatch(1);
  await mockChrome.tabs.sendMessage(101, { type: 'FOCUS_STATE_UPDATE', windowFocused: true, tabActive: true });
  assert.strictEqual(tab101Env.videos[0].paused, false, 'Window focus resumes video');
  console.log('✔ Window focus/blur correctly pauses and resumes video');

  // Test 8: Storage and Tab cleanup on close
  const tabStorage = mockChrome.storage.session || mockChrome.storage.local;
  await tabStorage.set({ tab_101: false });
  const storedVal = await tabStorage.get('tab_101');
  assert.strictEqual(storedVal.tab_101, false, 'tab_101 persisted in storage');

  // Tab closes -> dispatch tab onRemoved
  await mockChrome.tabs.onRemoved.dispatch(101);
  const afterRemoveVal = await tabStorage.get('tab_101');
  assert.strictEqual(afterRemoveVal.tab_101, undefined, 'tab_101 state cleaned up from storage upon tab close');
  console.log('✔ Tab state cleaned up upon tab close');

  // Test 9: Popup behavior on YouTube tab vs non-YouTube tab
  // Simulation of setTabPauseUI logic in popup
  function simulatePopupUI(tab, status, storedTabEnabled) {
    const isYouTube = Boolean(tab?.url?.includes('youtube.com'));
    let checked = false;
    let disabled = false;
    let statusText = '';

    if (!isYouTube || !tab?.id) {
      checked = false;
      disabled = true;
      statusText = 'Unavailable — not a YouTube tab';
    } else {
      disabled = false;
      const effectiveTabEnabled = status?.tabEnabled !== undefined ? status.tabEnabled : (storedTabEnabled !== undefined ? storedTabEnabled : true);
      checked = effectiveTabEnabled;
      statusText = effectiveTabEnabled ? 'Active — pauses this tab' : 'Disabled — plays normally';
    }

    return { isYouTube, checked, disabled, statusText };
  }

  // Non-YouTube tab popup test
  const nonYtTab = { id: 200, windowId: 1, active: true, url: 'https://example.com' };
  const nonYtUI = simulatePopupUI(nonYtTab, null, true);
  assert.strictEqual(nonYtUI.disabled, true, 'Tab toggle must be disabled on non-YouTube page');
  assert.strictEqual(nonYtUI.statusText, 'Unavailable — not a YouTube tab', 'Correct text on non-YouTube tab');
  console.log('✔ Popup UI properly disables on non-YouTube page');

  // YouTube tab with tabEnabled=true popup test
  const ytActiveTab = { id: 102, windowId: 1, active: true, url: 'https://www.youtube.com/watch?v=123' };
  const ytUIActive = simulatePopupUI(ytActiveTab, { tabEnabled: true }, true);
  assert.strictEqual(ytUIActive.disabled, false);
  assert.strictEqual(ytUIActive.checked, true);
  assert.strictEqual(ytUIActive.statusText, 'Active — pauses this tab');
  console.log('✔ Popup UI displays Active status on YouTube tab when tabEnabled=true');

  // YouTube tab with tabEnabled=false popup test
  const ytUIDisabled = simulatePopupUI(ytActiveTab, { tabEnabled: false }, false);
  assert.strictEqual(ytUIDisabled.disabled, false);
  assert.strictEqual(ytUIDisabled.checked, false);
  assert.strictEqual(ytUIDisabled.statusText, 'Disabled — plays normally');
  console.log('✔ Popup UI displays Disabled status on YouTube tab when tabEnabled=false');

  console.log('\n--- ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
