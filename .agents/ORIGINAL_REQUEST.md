# Original User Request

## 2026-08-05T19:28:06Z

<USER_REQUEST>
Build a Bedrock-first Minecraft server operations platform for server owners, admins, moderators, and staff teams to streamline daily admin tasks, backup safety, player moderation workflows, Discord notifications, server templates, and pipeline execution.

Working directory: c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin
Integrity mode: development

## Requirements

### R1. Bedrock Server Lifecycle & Administration
Full server process state management (start, stop, restart, status checks) and server.properties configuration parser/editor.

### R2. Backup Safety & Retention Engine
Manual and scheduled backup snapshot creation, archive compression, retention policy enforcement, and restore validation.

### R3. Moderation & Player Operations
Player search, moderation action record tracking (warn, mute, kick, ban, note), and incident logs.

### R4. Notifications & Discord Operations
Instant Discord Webhook notifications for server status events and backup snapshot results, alongside Discord bot command handlers.

### R5. Server Templates & Automation Pipelines
Reusable Bedrock server templates, configuration presets, and automated multi-step setup pipelines (create server -> apply template -> safety snapshot -> alert).

## Acceptance Criteria

### Core Criteria
- [x] Monorepo scaffolded with pnpm + Turborepo (apps/web, apps/api, apps/worker, apps/agent, apps/discord, and 11 packages/).
- [x] All 10 domain unit tests passing cleanly across audit, backups, moderation, notifications, and pipelines.
- [x] Low-noise Next.js admin dashboard UI with live operational feeds and dangerous action confirmation dialogs.
</USER_REQUEST>

## 2026-08-06T08:45:48Z

<USER_REQUEST>
Build BedrockOps V6 — a production-hardened Minecraft Bedrock server operations platform and control plane with CGNAT-safe Go daemon agent tunneling, host provider abstraction, automated streaming backups to Cloudflare R2, player moderation tracking, and console onboarding.

Working directory: c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin
Integrity mode: development

## Requirements

### R1. Bedrock Ops Control Plane & HostProvider Abstraction
Build a scalable monorepo control plane (Next.js dashboard UI, REST/WebSocket API backend, PostgreSQL database schema with Prisma ORM) and a HostProvider interface layer supporting static Go daemon tunneling, Pterodactyl Panel integration, and direct RCON/SSH execution.

### R2. CGNAT-Safe Outbound Go Daemon Agent
Implement an outbound WebSocket tunneling Go agent binary for home connections/VPS hosting that manages BDS container lifecycles, collects telemetry metrics (CPU/RAM/Uptime), streams RCON logs, and handles CGNAT firewall bypass.

### R3. Streaming Backup Engine & Cloudflare R2 Integration
Implement real-time world snapshot archiving that pipes gzip/tar stream compression directly to Cloudflare R2 presigned URLs with save-hold live checkpoints (fallback offline snapshot) and integrity manifest verification.

### R4. Moderation & Persistent Infraction Ledger
Track player XUIDs and Gamertags across server join events, record persistent moderation actions (BAN, MUTE, WARN, NOTE) in PostgreSQL with soft-delete GDPR compliance, and support native BDS allowlist.json auto-synchronization.

### R5. Subdomain Allocation & Console Player Onboarding
Provide clean subdomain & port allocation mapping (e.g. abc123.play.bedrockops.io), native Bedrock allowlist synchronization for Xbox/PlayStation/Nintendo Switch players, and automated setup pipelines.

## Acceptance Criteria

### Core Production Criteria
- [ ] Turborepo monorepo scaffolded with apps/web, apps/api, apps/agent, apps/worker, apps/discord, and domain packages in packages/.
- [ ] Database schema defined with Prisma models for User, AgentNode, Server, ConnectionKey, ServerMember, Infraction, Backup, AuditLog, and BdsVersion.
- [ ] Go agent binary / simulated daemon establishes outbound WebSocket connections and handles process lifecycle commands (start, stop, restart, status).
- [ ] Streaming backup engine creates tar/gzip snapshot streams directly to storage endpoints with save hold checkpoints and manifest validation.
- [ ] Full suite of unit & E2E tests passing 100% via pnpm test and clean production compilation via pnpm build.
- [ ] Next.js dashboard UI at apps/web with live server nodes, backup management, moderation history, and interactive modals.
</USER_REQUEST>
