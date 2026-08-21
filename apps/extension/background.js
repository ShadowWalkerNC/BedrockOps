/**
 * BedrockOps Extension Background Service Worker
 * Periodically polls the local BedrockOps control plane and updates the extension badge.
 */

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

async function getApiConfig() {
  const data = await chrome.storage.local.get({
    apiUrl: DEFAULT_API_URL,
    token: ''
  });
  return data;
}

async function updateBadge() {
  try {
    const { apiUrl, token } = await getApiConfig();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${apiUrl}/servers`, { headers });
    if (!res.ok) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      return;
    }

    const data = await res.json();
    const servers = data.servers || [];
    const onlineCount = servers.filter((s) => s.status === 'ONLINE').length;

    if (onlineCount > 0) {
      chrome.action.setBadgeText({ text: String(onlineCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
}

// Alarm for periodic background polling every 30 seconds
chrome.alarms.create('pollBedrockOps', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollBedrockOps') {
    updateBadge();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'refreshBadge') {
    updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
});
