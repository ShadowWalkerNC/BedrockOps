## 2026-08-06T08:49:00Z

<USER_REQUEST>
You are the Project Orchestrator for BedrockOps V6.
Your working directory is c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\orchestrator.
The user request is recorded in c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md and c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\ORIGINAL_REQUEST.md.

Read the user request in ORIGINAL_REQUEST.md carefully.
Your objective is to orchestrate the implementation of BedrockOps V6:
- R1: Bedrock Ops Control Plane & HostProvider Abstraction (Next.js dashboard UI, REST/WebSocket API backend, PostgreSQL database schema with Prisma ORM, HostProvider interface layer for Go daemon tunneling, Pterodactyl Panel integration, direct RCON/SSH execution)
- R2: CGNAT-Safe Outbound Go Daemon Agent (outbound WebSocket tunneling Go agent binary, BDS container lifecycles, CPU/RAM/Uptime telemetry metrics, RCON log streaming, CGNAT bypass)
- R3: Streaming Backup Engine & Cloudflare R2 Integration (real-time world snapshot archiving, gzip/tar stream compression to Cloudflare R2 presigned URLs, save-hold live checkpoints, integrity manifest verification)
- R4: Moderation & Persistent Infraction Ledger (track player XUIDs/Gamertags on join events, BAN/MUTE/WARN/NOTE actions in PostgreSQL with soft-delete GDPR compliance, BDS allowlist.json auto-sync)
- R5: Subdomain Allocation & Console Player Onboarding (subdomain & port allocation mapping e.g. abc123.play.bedrockops.io, native Bedrock allowlist sync for Xbox/PlayStation/Switch players, automated setup pipelines)

Follow the team protocols: create plan.md and progress.md in your working directory (.agents/orchestrator/), decompose into milestones, spawn specialist subagents to execute and audit, and maintain progress logging.
When all requirements and acceptance criteria are fully met and verified with 100% passing tests (pnpm test) and clean build (pnpm build), notify the Sentinel of completion so the Victory Audit can be initiated.
</USER_REQUEST>
