/**
 * BedrockOps Popup UI Controller
 */

let currentServers = [];
let activeServer = null;

async function getStoredConfig() {
  return chrome.storage.local.get({
    apiUrl: 'http://localhost:4000/api/v1',
    token: ''
  });
}

async function apiFetch(endpoint, options = {}) {
  const { apiUrl, token } = await getStoredConfig();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    document.getElementById('auth-banner').classList.remove('hidden');
    throw new Error('Authentication required');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API Error ${res.status}`);
  }

  return res.json();
}

function updateServerCard(server) {
  if (!server) return;
  activeServer = server;

  document.getElementById('srv-name').textContent = server.name;
  
  const statusEl = document.getElementById('srv-status');
  statusEl.textContent = server.status;
  statusEl.className = `status-pill ${server.status.toLowerCase()}`;

  document.getElementById('srv-address').textContent = `${server.host || '127.0.0.1'}:${server.port || 19132}`;
  document.getElementById('srv-players').textContent = `0/${server.maxPlayers || 10}`;
  document.getElementById('srv-version').textContent = `v${server.version || '1.21.0'}`;
}

async function loadServers() {
  const select = document.getElementById('server-select');
  try {
    const data = await apiFetch('/servers');
    currentServers = data.servers || [];

    if (currentServers.length === 0) {
      select.innerHTML = '<option value="">No servers found</option>';
      return;
    }

    select.innerHTML = '';
    currentServers.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.status})`;
      select.appendChild(opt);
    });

    updateServerCard(currentServers[0]);
  } catch (err) {
    document.getElementById('rcon-output').textContent = `Failed to connect: ${err.message}`;
  }
}

async function executePower(action) {
  if (!activeServer) return;
  const outputEl = document.getElementById('rcon-output');
  outputEl.textContent = `Executing power ${action}...`;

  try {
    const res = await apiFetch(`/servers/${activeServer.id}/power`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    outputEl.textContent = `Power ${action} sent. Status: ${res.server?.status || 'OK'}`;
    await loadServers();
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch (err) {
    outputEl.textContent = `Power failed: ${err.message}`;
  }
}

async function executeRcon(command) {
  if (!activeServer) return;
  const outputEl = document.getElementById('rcon-output');
  const cleanCmd = command.trim().replace(/^\//, '');
  if (!cleanCmd) return;

  outputEl.textContent = `> /${cleanCmd}\nExecuting...`;

  try {
    const res = await apiFetch(`/servers/${activeServer.id}/rcon`, {
      method: 'POST',
      body: JSON.stringify({ command: cleanCmd })
    });
    outputEl.textContent = res.output || '(no output)';
  } catch (err) {
    outputEl.textContent = `RCON Error: ${err.message}`;
  }
}

async function emergencyStopAll() {
  const outputEl = document.getElementById('rcon-output');
  outputEl.textContent = 'Triggering emergency stop for all processes...';
  try {
    const res = await apiFetch('/system/stop-all', { method: 'POST' });
    outputEl.textContent = res.message || 'All servers and processes stopped.';
    await loadServers();
    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  } catch (err) {
    outputEl.textContent = `Stop-all failed: ${err.message}`;
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadServers();

  document.getElementById('server-select').addEventListener('change', (e) => {
    const s = currentServers.find((srv) => srv.id === e.target.value);
    if (s) updateServerCard(s);
  });

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('auth-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-start').addEventListener('click', () => executePower('START'));
  document.getElementById('btn-restart').addEventListener('click', () => executePower('RESTART'));
  document.getElementById('btn-stop').addEventListener('click', () => executePower('STOP'));
  document.getElementById('btn-emergency-stop').addEventListener('click', () => emergencyStopAll());

  document.getElementById('btn-send-rcon').addEventListener('click', () => {
    const input = document.getElementById('rcon-cmd');
    executeRcon(input.value);
    input.value = '';
  });

  document.getElementById('rcon-cmd').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('rcon-cmd');
      executeRcon(input.value);
      input.value = '';
    }
  });

  // Quick Chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const cmd = chip.getAttribute('data-cmd');
      executeRcon(cmd);
    });
  });
});
