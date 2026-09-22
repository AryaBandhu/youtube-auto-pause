/**
 * YouTube Auto-Pause — background.js (Service Worker)
 *
 * Ultra-low-latency event dispatcher for tab activation and window focus changes.
 * Notifies YouTube content scripts in real-time so playback can be reliably
 * paused/resumed with zero user-perceivable delay.
 */

'use strict';

// ─── Storage Initialization ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['enabled', 'blockPiP']);
  const updates = {};
  if (data.enabled === undefined) updates.enabled = true;
  if (data.blockPiP === undefined) updates.blockPiP = false;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
});

// ─── Messaging Helper ───────────────────────────────────────────────────────

/**
 * Safely send a message to a specific tab without blocking or throwing.
 */
function safeSendMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script not ready or tab closed; ignore safely
  });
}

/**
 * Broadcast focus & active state directly to all YouTube tabs with zero async IPC delays.
 */
async function notifyYouTubeTabs(focusedWindowId) {
  try {
    const youtubeTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    if (!youtubeTabs || youtubeTabs.length === 0) return;

    const promises = youtubeTabs.map((tab) => {
      const isWindowFocused = focusedWindowId !== null && focusedWindowId !== undefined && tab.windowId === focusedWindowId;
      const isTabActive = tab.active;

      return safeSendMessage(tab.id, {
        type: 'FOCUS_STATE_UPDATE',
        windowFocused: isWindowFocused,
        tabActive: isTabActive
      });
    });

    await Promise.all(promises);
  } catch {
    // Ignore runtime errors during state broadcast
  }
}

// ─── Event Listeners ────────────────────────────────────────────────────────

// Window focus changed (e.g. user Alt+Tabs or Command+Tabs to another application/window)
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All browser windows lost focus
    notifyYouTubeTabs(null);
  } else {
    // Specific window gained focus
    notifyYouTubeTabs(windowId);
  }
});

// Tab activation changed (e.g. user switches tabs within browser)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const youtubeTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    if (!youtubeTabs || youtubeTabs.length === 0) return;

    const promises = youtubeTabs.map((tab) => {
      const isTabActive = tab.id === activeInfo.tabId;
      return safeSendMessage(tab.id, {
        type: 'FOCUS_STATE_UPDATE',
        tabActive: isTabActive
      });
    });

    await Promise.all(promises);
  } catch {
    // Ignore runtime errors
  }
});

// Tab URL update (e.g. tab finishes loading YouTube)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
    chrome.windows.getLastFocused().then((win) => {
      const isWindowFocused = win && win.focused && win.id === tab.windowId;
      safeSendMessage(tabId, {
        type: 'FOCUS_STATE_UPDATE',
        windowFocused: isWindowFocused,
        tabActive: tab.active
      });
    }).catch(() => {});
  }
});
