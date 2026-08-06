# Original User Request

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
