# ⚡ BedrockOps Companion Chrome Extension

The **BedrockOps Companion** brings live Minecraft Bedrock Dedicated Server management directly into your browser toolbar.

---

## 🚀 Features

- **Live Server Status Badge**: Shows the count of active online BDS servers right on the extension icon.
- **1-Click Power Controls**: Instantly Start, Restart, or Stop any registered realm.
- **Emergency Stop All**: Terminate all running BDS binaries and background tunnels with one click.
- **Live RCON Dispatcher**: Execute commands (`/list`, `/status`, `/save-all`, custom commands) directly from the popup.
- **Direct Web Dashboard Link**: 1-click jump to `http://localhost:3000`.

---

## 🛠️ How to Install in Chrome

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the directory:
   ```text
   <RepoRoot>/apps/extension
   ```
5. The **BedrockOps Companion** icon (⚡) will appear in your Chrome toolbar!

---

## ⚙️ Configuration

- Click the extension icon $\rightarrow$ click the **⚙️ Settings** icon (or right-click $\rightarrow$ **Options**).
- **API Endpoint URL**: Default `http://localhost:4000/api/v1`
- **Bearer JWT Token**: (Optional / automatically used when logged into the dashboard).
