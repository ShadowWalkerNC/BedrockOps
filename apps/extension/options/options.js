/**
 * BedrockOps Options Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get({
    apiUrl: 'http://localhost:4000/api/v1',
    token: ''
  });

  document.getElementById('api-url').value = data.apiUrl;
  document.getElementById('auth-token').value = data.token;

  document.getElementById('save-btn').addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim() || 'http://localhost:4000/api/v1';
    const token = document.getElementById('auth-token').value.trim();

    await chrome.storage.local.set({ apiUrl, token });

    const status = document.getElementById('status-msg');
    status.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      status.textContent = '';
    }, 2500);

    chrome.runtime.sendMessage({ action: 'refreshBadge' });
  });
});
