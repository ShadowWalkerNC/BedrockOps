<p align="center">
  <img src="docs/images/00-hero-bedrockops.png" alt="BedrockOps Hero Panel" width="100%" />
</p>

<h1 align="center">⚡ BedrockOps</h1>

<p align="center">
  <strong>The Ultimate Local-First Developer Studio, Multi-Server Control Plane & Ops Hub for Minecraft Bedrock.</strong><br/>
  Deploy, manage, customize, run, and monitor real Bedrock servers locally on your machine with 1-click ease.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Minecraft-Bedrock%20Dedicated%20Server-green?style=for-the-badge&logo=minecraft" alt="Minecraft Bedrock" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge" alt="Platforms" />
  <img src="https://img.shields.io/badge/License-Open%20Source-orange?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Tests-100%25%20Passing-success?style=for-the-badge" alt="Tests" />
</p>

<p align="center">
  <a href="#-why-bedrockops-exists">Why BedrockOps</a> ·
  <a href="#-key-capabilities">Key Capabilities</a> ·
  <a href="#-product-tour">Product Tour</a> ·
  <a href="#-supported-server-engines">Supported Engines</a> ·
  <a href="#%EF%B8%8F-architecture-blueprint">Architecture</a> ·
  <a href="#-quick-start--installation">Installation Guide</a> ·
  <a href="#-extending--contributing">Developer Guide</a>
</p>

---

## 💡 Why BedrockOps Exists

While Minecraft Java Edition has enjoyed a decade of robust server management stacks (Pterodactyl, Crafty Controller, Paper, Spigot), **Minecraft Bedrock Edition represents over 80% of active players worldwide**—yet its server hosting, moderation, and developer tools remain fragmented.

Minecraft server owners struggle daily with:
* **The Console IP Barrier**: Xbox, PlayStation, and Nintendo Switch players cannot easily enter custom server IPs without router DNS tricks.
* **The Plugin API Vacuum**: Standard Bedrock Dedicated Server (BDS) lacks event hooks, permission levels, or detailed player logging out-of-the-box.
* **Complex Addon Installation**: Installing Behavior Packs, Resource Packs, and Script API addons requires unzipping, matching UUIDs, and editing JSON manifests manually.
* **Home NAT & CGNAT Firewalls**: Hosting a server at home for friends requires manual port forwarding, which is often blocked by ISPs.

**BedrockOps bridges these gaps.** It is a standalone local-first developer studio and virtual control plane that installs directly on your local computer to download, configure, run, and monitor Bedrock servers with 1-click ease.

---

## 🚀 Key Capabilities

### ⚡ 1. Local Native Server Runner
* **Direct Process Spawning**: Spawns real `bedrock_server.exe` / `bedrock_server` native binaries directly on your machine.
* **Automatic Mojang BDS Downloader**: Downloads and extracts official Bedrock Dedicated Server binaries directly from Mojang's CDN.
* **Disk Workspace Management**: Keeps all server files neatly organized under `data/servers/<server_id>/` with dynamic `server.properties` synthesis.

### 🖥️ 2. Live Terminal & Interactive RCON Shell
* **Real-Time Logs**: Live streaming stdout and stderr events over WebSockets.
* **1-Click Action Chips**: Execute quick commands (`/list`, `/status`, `/help`, `/save-all`, `/stop`, `/kick`, `/broadcast`) with a single click.
* **Interactive RCON Shell**: Dispatch custom in-game slash commands directly to the running server stdin.

### 🛒 3. Addon & Plugin Marketplace (`/marketplace`)
* **1-Click Pack Mounting**: Mount Endstone Python plugins (`.whl`), Script API addons (`.mcpack`), and PocketMine plugins (`.phar`).
* **Automated Manifest Synthesis**: Generates and updates `world_behavior_packs.json` and `world_resource_packs.json` automatically.

### 👥 4. Player Moderation Ledger & Allowlist Sync
* **Join Tracking**: Ingest player connections, gamertags, and Xbox XUIDs.
* **Infraction History**: Issue and persist warn, mute, kick, and ban logs.
* **Atomic Allowlist Sync**: Atomically writes and reloads `allowlist.json` without file corruption.
* **GDPR Compliance**: Soft-delete and redact player records on request.

### 🌉 5. Console & Network Proxying
* **Phantom LAN Broadcast**: Broadcasts local servers on the local Wi-Fi network so Xbox, PlayStation, and Nintendo Switch players see them in the "LAN Games" tab.
* **GeyserMC & Floodgate**: Integrated Java & Bedrock cross-play bridging.
* **WaterdogPE Proxy**: Multi-server proxying and hub networking.

---

## 🎨 Product Tour

Captured from a live running local development stack:

![BedrockOps Product Tour](docs/demo/bedrockops-product-tour.gif)

| Login Screen | Guided Setup Wizard | Operations Overview |
|:--:|:--:|:--:|
| ![Login](docs/images/01-login.png) | ![Setup](docs/images/08-setup.png) | ![Dashboard](docs/images/02-dashboard.png) |

| Live Ops Room & Telemetry | Live Console & RCON Shell | Customizations & Plugins |
|:--:|:--:|:--:|
| ![Ops Room](docs/images/03-ops-room.png) | ![Console](docs/images/04-console.png) | ![Plugins](docs/images/07-plugins.png) |

---

## ⚡ Supported Server Engines

BedrockOps is a multi-engine hub designed to orchestrate various server types inside a sandboxed local environment:

* **Official Vanilla BDS (Mojang Dedicated Server)**: Downloads official Bedrock Dedicated Server binaries directly from the Mojang CDN.
* **⚡ Endstone (`endstonemc/endstone`)**: BDS wrapped with C++ native binary hooks & Python plugin support, bringing Spigot/Bukkit-like event hooks, custom commands, and moderation scripts.
* **Script API / Behavior Pack Companion**: Vanilla BDS configured for custom Bedrock addons and behavior packs.
* **PocketMine-MP**: PHP-based high-performance Bedrock server engine.

---

## ⚙️ Architecture Blueprint

```text
┌─────────────────────────┐               REST / WS                ┌─────────────────────────┐
│   React Web Dashboard   │ ──────────────────────────────────────► │       API Backend       │
│       (apps/web)        │                                        │       (apps/api)        │
│  http://localhost:3000  │ ◄───────────────────────────────────── │  http://localhost:4000  │
└─────────────────────────┘                                        └────────────┬────────────┘
                                                                                │
                                           ┌────────────────────────────────────┴────────────────────────────────────┐
                                           ▼                                                                         ▼
                             ┌───────────────────────────┐                                             ┌───────────────────────────┐
                             │    Local BDS Execution    │                                             │   CGNAT Go Agent Tunnel   │
                             │   (LocalServerRunner)     │                                             │       (apps/agent)        │
                             │  Standalone Local Process │                                             │   Remote Host Daemon      │
                             └───────────────────────────┘                                             └───────────────────────────┘
```

### Monorepo Workspace Package Map

* `apps/web`: React / Next.js web interface, Marketplace UI, and Guided Setup wizard.
* `apps/api`: REST & WebSocket backend control plane (Express).
* `apps/agent`: Go WebSocket agent daemon for outbound CGNAT-safe remote hosting.
* `packages/bedrock`: Native server runner (`LocalServerRunner`), BDS downloader (`BdsDownloader`), RCON client, and Endstone configuration.
* `packages/templates`: Mode catalog templates and pack manifest synthesizer (`world_behavior_packs.json`).
* `packages/moderation`: Player identity tracking, persistent infraction ledger, and atomic allowlist writer.
* `packages/notifications`: Discord rich embed payload generator and webhook dispatcher.
* `packages/geyser`: GeyserMC & Floodgate Java & Bedrock cross-play manager.
* `packages/lan-discovery`: Phantom LAN Broadcast Controller for console player auto-discovery.
* `packages/waterdog`: WaterdogPE Proxy Orchestrator for multi-server networks.
* `packages/nbt`: LevelDB and player inventory NBT reader/editor.
* `packages/db`: In-memory seeded database and Prisma PostgreSQL schema.

---

## 🏁 Quick Start & Installation

BedrockOps works **out-of-the-box with zero external database setup required** (defaults to an in-memory pre-seeded database).

### Prerequisites
* **Node.js 18+**
* **pnpm 9** — Enable via: `corepack enable && corepack prepare pnpm@9.0.0 --activate`

---

### 💻 Windows Setup

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/ShadowWalkerNC/BedrockOps.git
   cd BedrockOps
   ```

2. **Install dependencies**:
   ```powershell
   pnpm install
   ```

3. **Start Development Stack**:
   ```powershell
   # Run both API (port 4000) and Web Dashboard (port 3000)
   pnpm dev
   ```

4. **Launch BedrockOps**:
   Open **http://localhost:3000** in your browser!
   * **Dev Login Credentials**: `admin@minecraft-admin.local` / `admin`

---

### 🍎 macOS & 🐧 Linux Setup

1. **Clone & Install**:
   ```bash
   git clone https://github.com/ShadowWalkerNC/BedrockOps.git
   cd BedrockOps
   pnpm install
   ```

2. **Start Stack**:
   ```bash
   ./scripts/start-local.sh
   ```

3. **Launch BedrockOps**:
   Open **http://localhost:3000** (Login: `admin@minecraft-admin.local` / `admin`).

---

## 🛠️ Extending & Contributing

We welcome contributions from Minecraft server operators, addon creators, and open-source developers!

### How to Add a New Package or Plugin

1. **Add a package under `packages/`**:
   - Create `packages/your-feature/package.json` extending `@mc-admin/config` TSConfig.
   - Implement clean exports with TypeScript types.

2. **Register in API or Web**:
   - Export your package functions and wire them into `apps/api/src/routes/` or React components in `apps/web/src/pages/`.

3. **Run Verification Commands**:
   ```bash
   pnpm install             # Install dependencies across monorepo
   pnpm dev                 # Start local API + Web dev environment
   pnpm test                # Run test suite across all workspace projects (100% passing)
   pnpm build               # Verify production build compilation
   ```

---

## 📄 License

**Free forever. Open source.** Fork it, host it, improve it, and run your Bedrock servers with complete ownership.
