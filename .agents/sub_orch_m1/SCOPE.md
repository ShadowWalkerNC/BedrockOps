# Scope: Milestone 1 (M1: Control Plane, Database Schema & HostProvider Layer)

## Architecture
- `packages/db`: PostgreSQL schema with Prisma ORM (`schema.prisma`), client export, migrations setup.
- `packages/bedrock`: HostProvider interface abstraction with strategy pattern implementations for DOCKER_AGENT, PTERODACTYL, DIRECT_RCON_SSH.
- `apps/api`: REST API backend (Fastify/Express), JWT authentication routes, WebSocket agent tunnel (`/api/v1/ws/agent`), and client WS endpoint (`/api/v1/ws/client`).
- `apps/web`: Next.js admin dashboard UI (live server nodes, backup management, moderation history, interactive modals).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| R1.1 | DB Schema | Prisma ORM models (User, AgentNode, BedrockServer, ConnectionKey, ServerMember, BackupRecord, ModerationAction, AuditLog, BdsVersion) | M1 | PROJECT.md |
| R1.2 | HostProvider Layer | HostProvider strategy pattern interface for DOCKER_AGENT, PTERODACTYL, DIRECT_RCON_SSH in `packages/bedrock/src/provider.ts` | M1 | PROJECT.md |
| R1.3 | REST API Backend & JWT Auth | API backend with JWT auth routes in `apps/api` | M1 | PROJECT.md |
| R1.4 | WebSocket Agent Tunnel & Client WS | Server WS endpoints (`/api/v1/ws/agent`, `/api/v1/ws/client`) in `apps/api` | M1 | PROJECT.md |
| R1.5 | Next.js Admin Dashboard UI | Dashboard UI in `apps/web` with live server nodes, backup management, moderation history, interactive modals | M1 | PROJECT.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Control Plane, Database Schema & HostProvider Layer | R1.1, R1.2, R1.3, R1.4, R1.5 | None | IN_PROGRESS |

## Interface Contracts
### `packages/db` ↔ `apps/api`
- Prisma Client exports models for User, AgentNode, BedrockServer, ConnectionKey, ServerMember, BackupRecord, ModerationAction, AuditLog, BdsVersion.

### `packages/bedrock` ↔ `apps/api`
- HostProvider interface with implementations: DockerAgentProvider, PterodactylProvider, DirectRconSshProvider.

### `apps/api` ↔ `apps/web`
- REST API auth endpoints (`/api/v1/auth/login`, `/api/v1/auth/me`, etc.)
- WebSocket endpoints (`/api/v1/ws/agent`, `/api/v1/ws/client`)
