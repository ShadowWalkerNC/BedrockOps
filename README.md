<p align="center">
  <img src="docs/images/00-hero-bedrockops.png" alt="BedrockOps — Open Control Plane & Developer Hub for Minecraft Bedrock" width="100%" />
</p>

<h1 align="center">⚡ BedrockOps</h1>

<p align="center">
  <strong>The Local-First Server Control Plane, Developer Studio & Operational Hub for Minecraft Bedrock.</strong><br/>
  Create, customize, test, and monitor real Bedrock servers locally on your machine. Free forever. Fork it. Run it. Build with it.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#product-tour">Demo</a> ·
  <a href="#what-is-bedrockops">What is BedrockOps</a> ·
  <a href="#key-features">Key Features</a> ·
  <a href="#server-architectures--engines">Supported Engines</a> ·
  <a href="#quick-start">Full Setup Guide</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## What is BedrockOps?

**BedrockOps** is an all-in-one local-first control plane, developer hub, and live monitoring studio for **Minecraft Bedrock Edition**. 

Think of it as **Vercel for Bedrock Minecraft** — a standalone application installed on your local computer (Windows, macOS, or Linux) that empowers you to generate, customize, run, and monitor real Bedrock servers locally without complex setup, port headaches, or hidden paid tiers.

Whether you're developing custom Python & C++ plugins, testing Behavior Packs, hosting a local server for your friends on console (Xbox, Switch, PlayStation) and mobile, or managing production VPS nodes, BedrockOps brings all the tools together into one unified ops center.

---

## Product Tour

Real UI. Real pages. Captured from a running local stack.

![BedrockOps product tour](docs/demo/bedrockops-product-tour.gif)

| Setup Wizard | Live Ops Room & Telemetry | Live Console & RCON Shell |
|:--:|:--:|:--:|
| ![Setup](docs/images/08-setup.png) | ![Ops Room](docs/images/03-ops-room.png) | ![Console](docs/images/04-console.png) |

| Operations Overview | Customizations & Plugins | Worlds & Backups |
|:--:|:--:|:--:|
| ![Dashboard](docs/images/02-dashboard.png) | ![Plugins](docs/images/07-plugins.png) | ![Worlds](docs/images/05-worlds.png) |

---

## Key Features

### 🚀 1-Click Guided Setup Launcher (`/setup`)
- **System Environment Check**: Automated self-diagnostics for Node.js, database adapters, and local runtimes with a 1-click **Auto-Repair Environment** button.
- **Server Architect**: Select server engine, mode catalog templates, Endstone plugins, custom skin packs, and resource packs.
- **Live Deployment Pipeline**: Visual terminal streaming execution steps (subdomain allocation, BDS download, properties injection, plugin setup, container launch).
- **Embedded Console & RCON Shell**: Real-time log streamer and interactive command terminal (`/list`, `/op`, `/say`, `/kick`, `/tp`).

### ⚡ Supported Server Architectures & Engines
- **Official Vanilla BDS (Mojang Dedicated Server)**: Official Bedrock Dedicated Server binaries directly from Mojang CDN.
- **⚡ Endstone (`endstonemc/endstone`)**: C++ & Python plugin API framework for BDS enabling Bukkit/Spigot-like event hooks, custom commands, and moderation plugins.
- **Script API / Behavior Pack Companion**: BDS configured for custom Bedrock addons and behavior packs.
- **PocketMine-MP**: PHP-based Bedrock server engine.

### 📊 Real-Time Operations Room (`/servers/[id]`)
- **Live Telemetry Gauges**: Real-time CPU %, RAM MB allocation, uptime, and active player counts.
- **Console Onboarding**: Allowlist Xbox/PlayStation/Nintendo Switch players via Gamertag with automatic `allowlist.json` synchronization.
- **Player Moderation Ledger**: Search tracked players, view join events, issue infractions (WARNs, MUTES, KICKs, BANs), with GDPR soft-delete path.
- **World Snapshot Engine**: One-click local backup archives with compression and safety restores.

### 🌐 CGNAT-Safe Outbound Go Agent Tunnel (Optional)
- Works behind home NAT / CGNAT without port forwarding for remote hosting.
- WebSocket tunnel gateway for remote agent daemon nodes.

---

## Quick Start (Run Locally in 2 Minutes)

BedrockOps works **out-of-the-box with zero external database setup required** (defaults to an in-memory pre-seeded database).

### Prerequisites
- **Node.js 18+**
- **pnpm 9** — Enable via: `corepack enable && corepack prepare pnpm@9.0.0 --activate`

---

### 💻 Windows Setup Guide

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/ShadowWalkerNC/BedrockOps.git
   cd BedrockOps
   ```

2. **Install dependencies**:
   ```powershell
   pnpm install
   ```

3. **Start the Development Servers**:
   ```powershell
   # Terminal A — API Backend (Port 4000)
   $env:PORT="4000"
   pnpm --filter @mc-admin/api dev

   # Terminal B — Web Dashboard (Port 3000)
   pnpm --filter @mc-admin/web dev
   ```

4. **Launch BedrockOps**:
   Open **http://localhost:3000/setup** in your browser to launch the 1-Click Guided Setup Wizard!

---

### 🍎 macOS & 🐧 Linux Setup Guide

1. **Clone & Install**:
   ```bash
   git clone https://github.com/ShadowWalkerNC/BedrockOps.git
   cd BedrockOps
   pnpm install
   ```

2. **Start Local Stack**:
   ```bash
   ./scripts/start-local.sh
   ```

3. **Launch BedrockOps**:
   Open **http://localhost:3000/setup** (or `http://localhost:3000/login` with seed login `admin@minecraft-admin.local` / `admin`).

---

## Architecture Overview

```text
┌─────────────────────────┐               REST / WS                ┌─────────────────────────┐
│      Web Dashboard      │ ──────────────────────────────────────► │       API Backend       │
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

| Package / App | Description |
|---------------|-------------|
| `apps/web` | Operator UI, Guided Setup Wizard, Live Telemetry & Console (Next.js) |
| `apps/api` | REST & WebSocket Control Plane API Server (Express + ts-node) |
| `apps/agent` | Outbound Go WebSocket Agent Daemon for remote host management |
| `apps/worker` | Background scheduled backup & retention policy processor |
| `packages/bedrock` | Local server process engine (`LocalServerRunner`), RCON client, Endstone parser, version matrix |
| `packages/db` | Database abstraction layer (In-memory pre-seeded store + Prisma PostgreSQL adapter) |
| `packages/templates` | Mode catalog manifest synthesis engine (Survival, Skyblock, Minigames) |
| `packages/pipelines` | Automated server setup & console player onboarding pipelines |

---

## Useful Development Commands

```bash
pnpm install             # Install all dependencies across monorepo
pnpm dev                 # Run dev servers
pnpm test                # Run Vitest test suite across all 20 packages & apps (100% passing)
pnpm typecheck           # Run strict TypeScript validation
pnpm build               # Build all production apps & packages

# Utility tasks
pnpm --filter @mc-admin/web clean   # Clear Next.js .next cache
pnpm --filter @mc-admin/db db:generate # Generate Prisma client
```

---

## Contributing

Contributions are welcome! If you're a Minecraft server operator, developer, or enthusiast, we'd love your help expanding BedrockOps.

1. Fork the repository & create a feature branch (`git checkout -b feature/my-feature`).
2. Make your changes and run tests (`pnpm test`).
3. Commit your changes and open a Pull Request.

---

## License

**Free forever. Open source.** Fork it, self-host it, customize it, and run your Bedrock servers with complete control.
