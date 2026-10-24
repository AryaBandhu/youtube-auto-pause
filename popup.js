/**
 * popup.js — Extension Popup UI Manager
 *
 * Interacts with chrome.storage.local and current YouTube tab to display:
 * - Auto-pause toggle state
 * - Picture-in-Picture (PiP) exit/block toggle state
 * - Count of currently playing videos
 * - Total videos detected on current YouTube page
 * Safe to open on any web page (YouTube or non-YouTube).
 */

'use strict';

const toggle        = document.getElementById('toggle');
const statusText    = document.getElementById('status-text');
const pipToggle     = document.getElementById('pip-toggle');
const pipStatusText = document.getElementById('pip-status-text');
const tabToggle     = document.getElementById('tab-toggle');
const tabStatusText = document.getElementById('tab-status-text');
const playingCount  = document.getElementById('playing-count');
const totalCount    = document.getElementById('total-count');
const statState     = document.getElementById('stat-state');

// ─── Storage Helper ────────────────────────────────────────────────────────

function getTabStorage() {
  return chrome.storage.session || chrome.storage.local;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────

function setPauseUI(enabled) {
  toggle.checked = enabled;

  if (enabled) {
    statusText.textContent = 'Active — pauses on switch';
    statusText.className   = 'toggle-desc state-active';
    statState.textContent  = 'ON';
    statState.className    = 'stat-value state-active';
  } else {
    statusText.textContent = 'Disabled — plays normally';
    statusText.className   = 'toggle-desc state-inactive';
    statState.textContent  = 'OFF';
    statState.className    = 'stat-value state-disabled';
  }
}

function setPiPUI(blockPiP) {
  pipToggle.checked = blockPiP;

  if (blockPiP) {
    pipStatusText.textContent = 'ON — Exit & block PiP on leave';
    pipStatusText.className   = 'toggle-desc state-active';
  } else {
    pipStatusText.textContent = 'OFF — Allow PiP normally';
    pipStatusText.className   = 'toggle-desc state-disabled';
  }
}

function setTabPauseUI(tabEnabled, isYouTube = true) {
  if (!tabToggle || !tabStatusText) return;

  if (!isYouTube) {
    tabToggle.checked = false;
    tabToggle.disabled = true;
    tabStatusText.textContent = 'Unavailable — not a YouTube tab';
    tabStatusText.className   = 'toggle-desc state-disabled';
    return;
  }

  tabToggle.disabled = false;
  tabToggle.checked = tabEnabled;

  if (tabEnabled) {
    tabStatusText.textContent = 'Active — pauses this tab';
    tabStatusText.className   = 'toggle-desc state-active';
  } else {
    tabStatusText.textContent = 'Disabled — plays normally';
    tabStatusText.className   = 'toggle-desc state-inactive';
  }
}

/** Safely query active tab and fetch status from content script if on YouTube */
async function queryActiveYouTubeTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      return null;
    }

    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
  } catch {
    // Content script not ready or non-YouTube tab
    return null;
  }
}

// ─── Initialization ───────────────────────────────────────────────────────

async function init() {
  // Load persisted global preferences
  const { enabled = true, blockPiP = false } = await chrome.storage.local.get(['enabled', 'blockPiP']);
  setPauseUI(enabled);
  setPiPUI(blockPiP);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isYouTube = Boolean(tab?.url?.includes('youtube.com'));

    if (!isYouTube || !tab?.id) {
      setTabPauseUI(false, false);
      playingCount.textContent = '—';
      totalCount.textContent   = '—';
      return;
    }

    // Default to stored tab preference or true
    const storage = getTabStorage();
    const tabKey = `tab_${tab.id}`;
    const stored = await storage.get([tabKey]).catch(() => ({}));
    const storedTabEnabled = stored[tabKey] !== undefined ? stored[tabKey] : true;
    setTabPauseUI(storedTabEnabled, true);

    // Fetch live status from active tab
    const status = await queryActiveYouTubeTab();
    if (status) {
      playingCount.textContent = status.playingVideos !== undefined ? status.playingVideos : '0';
      totalCount.textContent   = status.totalVideos !== undefined ? status.totalVideos : '0';
      if (status.enabled !== undefined) setPauseUI(status.enabled);
      if (status.blockPiP !== undefined) setPiPUI(status.blockPiP);
      if (status.tabEnabled !== undefined) setTabPauseUI(status.tabEnabled, true);
    } else {
      playingCount.textContent = '—';
      totalCount.textContent   = '—';
    }
  } catch {
    setTabPauseUI(false, false);
    playingCount.textContent = '—';
    totalCount.textContent   = '—';
  }
}

// ─── Event Listeners ───────────────────────────────────────────────────────

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  setPauseUI(enabled);

  // Persist preference to storage (broadcasts to content scripts automatically)
  await chrome.storage.local.set({ enabled });

  // Explicitly inform current tab if available
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.includes('youtube.com')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled });
    }
  } catch {
    // Tab messaging failure handled silently
  }
});

pipToggle.addEventListener('change', async () => {
  const blockPiP = pipToggle.checked;
  setPiPUI(blockPiP);

  // Persist preference to storage
  await chrome.storage.local.set({ blockPiP });

  // Explicitly inform current tab if available
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.includes('youtube.com')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_BLOCK_PIP', blockPiP });
    }
  } catch {
    // Tab messaging failure handled silently
  }
});

tabToggle.addEventListener('change', async () => {
  const tabEnabled = tabToggle.checked;
  setTabPauseUI(tabEnabled, true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('youtube.com')) return;

    // Persist per-tab preference to storage
    const storage = getTabStorage();
    await storage.set({ [`tab_${tab.id}`]: tabEnabled });

    // Explicitly notify content script in this tab
    await chrome.tabs.sendMessage(tab.id, { type: 'SET_TAB_ENABLED', tabEnabled });
  } catch {
    // Tab messaging failure handled silently
  }
});

// Boot popup
init();
