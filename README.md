<p align="center">
  <img src="docs/images/00-hero-bedrockops.png" alt="BedrockOps Hero Panel" width="100%" />
</p>

<h1 align="center">⚡ BedrockOps</h1>

<p align="center">
  <strong>The Ultimate Local-First Developer Studio, Multi-Server Control Plane & Ops Hub for Minecraft Bedrock.</strong><br/>
  Create, customize, run, and monitor real Bedrock servers locally on your machine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Minecraft-Bedrock%20Dedicated%20Server-green?style=for-the-badge&logo=minecraft" alt="Minecraft Bedrock" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge" alt="Platforms" />
  <img src="https://img.shields.io/badge/License-Open%20Source-orange?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Tests-100%25%20Passing-success?style=for-the-badge" alt="Tests" />
</p>

<p align="center">
  <a href="#-why-bedrockops-exists">Why BedrockOps</a> ·
  <a href="#-feature-matrix">Key Features</a> ·
  <a href="#-product-tour">UI Walkthrough</a> ·
  <a href="#-supported-server-engines">Supported Engines</a> ·
  <a href="#%EF%B8%8F-architecture-blueprint">Architecture Blueprint</a> ·
  <a href="#-quick-start">Quick Start Guide</a> ·
  <a href="#-contributing">Contributing</a>
</p>

---

## 💡 Why BedrockOps Exists

While Minecraft Java Edition has enjoyed a decade of robust server management stacks (Pterodactyl, Crafty Controller, Paper, Spigot), **Minecraft Bedrock Edition represents over 80% of total active players worldwide**—yet its hosting and developer tools remain severely fragmented.

Minecraft server owners struggle daily with:
* **The Console IP Barrier**: Xbox, PlayStation, and Nintendo Switch players cannot easily connect to custom server IPs without router DNS tricks.
* **The Plugin API Vacuum**: Standard Bedrock Dedicated Server (BDS) lacks event hooks, permission levels, or detailed player logging out-of-the-box.
* **Complex Addon Installation**: Installing Behavior Packs and Script API addons requires unzipping, matching UUIDs, and editing JSON manifests manually.
* **Home NAT & CGNAT Firewalls**: Hosting a server at home for friends requires manual port forwarding, which is often blocked by ISPs.

**BedrockOps bridges these gaps.** It is a standalone local-first developer studio and virtual control plane that installs directly on your local computer to download, configure, run, and monitor Bedrock servers with 1-click ease.

---

## 🚀 Key Features

### 1-Click Guided Setup Wizard (`/setup`)
* **Environment Diagnostics**: Automated check for Node.js, databases, and local runtimes with a single-click **Auto-Repair Environment** button.
- **Server Architect**: Select server engine, mode catalog templates, plugins, and custom skin/resource packs.
- **Interactive Progress Terminal**: Live log streamer showing download, manifest synthesis, port mapping, and container startup progress.

### Live Telemetry & Monitoring
* **Gauges**: Real-time CPU usage, RAM allocation, server uptime, and active player counts.
* **Console Log Stream**: Live streaming server stdout/stderr.
* **Interactive RCON Shell**: Dispatch in-game commands (`/list`, `/op`, `/say`, `/kick`, `/tp`) directly from the browser.

### Persistent Player Moderation Ledger
* **Join Ingest**: Log player connection events, gamer tags, and XUIDs.
* **Infraction History**: Issue and persist warn, mute, kick, and ban logs.
* **GDPR Compliance**: Anonymize option to safely wipe player records on request.

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

### Monorepo Structure

* `apps/web`: React / Next.js web interface and Guided Setup wizard.
* `apps/api`: REST & WebSocket backend control plane (Express).
* `apps/agent`: Go WebSocket agent daemon for outbound CGNAT-safe remote hosting.
* `packages/bedrock`: Standalone server process engine (`LocalServerRunner`), RCON client, Endstone configuration.
* `packages/geyser`: **GeyserMC & Floodgate** Java & Bedrock cross-play manager.
* `packages/lan-discovery`: **Phantom LAN Broadcast Controller** for console player auto-discovery.
* `packages/waterdog`: **WaterdogPE Proxy Orchestrator** for multi-server proxy networks.
* `packages/marketplace`: Unified mod & pack synthesis engine (`.mcpack`, `.whl`, `.phar`).
* `packages/nbt`: World levelDB and player inventory NBT reader/editor.
* `packages/db`: Memory database and Prisma PostgreSQL schema.

---

## 🏁 Quick Start

BedrockOps is built to work **out-of-the-box with zero external database setup required** (defaults to an in-memory pre-seeded database).

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
   # Terminal A — Start API Backend (Port 4000)
   $env:PORT="4000"
   pnpm --filter @mc-admin/api dev

   # Terminal B — Start Web Dashboard (Port 3000)
   pnpm --filter @mc-admin/web dev
   ```

4. **Launch BedrockOps**:
   Open **http://localhost:3000/setup** in your browser!

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
   Open **http://localhost:3000/setup** (Login seed: `admin@minecraft-admin.local` / `admin`).

---

## 🛠️ Development Commands

```bash
pnpm install             # Install all dependencies across the monorepo
pnpm dev                 # Run all dev servers in parallel
pnpm test                # Run test suite across all 25 projects (100% passing)
pnpm typecheck           # Run strict TypeScript typecheck
pnpm build               # Build all production bundles
pnpm --filter @mc-admin/web clean   # Clean Next.js cache
```

---

## 🤝 Contributing

We welcome contributions from Minecraft server operators, addon creators, and open-source developers!

1. Fork this repository.
2. Create your feature branch (`git checkout -b feature/cool-addition`).
3. Verify your changes pass all unit tests (`pnpm test`).
4. Push your branch and open a Pull Request.

---

## 📄 License

**Free forever. Open source.** Fork it, host it, improve it, and run your Bedrock servers with complete ownership.
