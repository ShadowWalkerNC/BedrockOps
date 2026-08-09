# Comprehensive Analysis: Milestone 1 (M1) Admin Dashboard UI (R1.5) & End-to-End Integration

## 1. Executive Summary & Scope Assessment

Milestone 1 (M1) establishes the foundational Control Plane, Database Schema, and HostProvider Layer for BedrockOps V6. The primary focus of feature R1.5 is the **Next.js Admin Dashboard UI** located in `apps/web` and supported by the `@mc-admin/ui` component design system.

### Scope Requirements for R1.5 & M1 Integration
1. **Live Server Nodes Panel**: Interactive grid displaying Bedrock Dedicated Server (BDS) instances, power controls (`START`, `STOP`, `RESTART`), node host details, slot allocation, game modes, difficulties, and live telemetry metrics.
2. **Host & Agent Node Management**: Monitoring connected Go Agent Nodes (`AgentNode` model), health/heartbeat indicators, and pairing key generation workflows.
3. **Backup & Safety Management**: List of snapshot archives (`BackupRecord` model), manually triggered streaming snapshots, checksum verification status, and restore confirmation dialogs.
4. **Player Moderation & Infraction Ledger**: Searchable player infraction table (`ModerationAction` model: `WARN`, `MUTE`, `KICK`, `BAN`, `NOTE`), infraction submission form, and explicit modal confirmations for destructive actions (`BAN`).
5. **Structured Audit Trail View**: Complete history of administrative and system operations (`AuditLog` model).
6. **Interactive Modals**:
   - `RegisterServerModal`: Server node registration form with HostProvider selection (`DOCKER_AGENT`, `PTERODACTYL`, `DIRECT_RCON_SSH`).
   - `RegisterNodeModal`: Go Agent Node pairing token generator.
   - `ConfirmModal`: Explicit confirmation dialog for dangerous actions (Process Stop, Snapshot Overwrite, Player Ban).
   - `ServerConsoleModal`: Real-time RCON log tailing and command execution interface.
7. **End-to-End Integration Layer**: Clean client API abstraction connecting `apps/web` to `apps/api` REST endpoints (`/api/v1/*`), WebSocket gateway (`/api/v1/ws/client`), `@mc-admin/db` Prisma models, `@mc-admin/bedrock` HostProviders, `@mc-admin/audit`, `@mc-admin/backups`, and `@mc-admin/moderation`.

---

## 2. Current State & Codebase Inspection

### 2.1 Existing Structure in `apps/web`
- **Framework**: Next.js 14 (Pages Router using `src/pages`).
- **Main Dashboard Page (`apps/web/src/pages/index.tsx`)**:
  - Contains a 581-line monolithic component `BedrockAdminDashboard`.
  - Implements tab switching (`servers`, `backups`, `moderation`, `discord`, `templates`, `referrals`).
  - Manages raw state arrays (`servers`, `backups`, `moderation`).
  - Includes simple inline forms for registering servers and recording moderation actions.
  - Implements inline modal dialog overlays for server registration and action confirmation.
- **Existing Next.js API Routes (`apps/web/src/pages/api/`)**:
  - `servers.ts`: `GET` (list servers), `POST` (create server, apply template, trigger backup, record audit).
  - `backups.ts`: `GET` (list backups), `POST` (trigger manual backup, restore backup, send Discord notification, record audit).
  - `moderation.ts`: `GET` (list infractions or filter by player), `POST` (create infraction, record audit).
  - `servers/[id]/control.ts`: `POST` (power actions `start`, `stop`, `restart`, update server status, send Discord notification, record audit).

### 2.2 Existing Structure in `packages/ui`
- **Current Exports (`packages/ui/src/index.ts`)**:
  - `UI_THEME`: Theme color tokens (`bgDark`, `panelBg`, `panelBorder`, `primary`, `success`, `danger`, `warning`, `textMain`, `textMuted`).
  - `getStatusBadgeStyle(status)`: Helper function returning inline background and text colors.
- **Current Limitation**: Lacks atomic, reusable React components (`Button`, `Badge`, `Card`, `Modal`, `ConfirmModal`, `Table`, `Input`, `Select`). All UI elements in `apps/web/src/pages/index.tsx` currently rely on raw inline styles.

### 2.3 Integration Contract Gaps Identified
1. **`apps/web` -> `apps/api` Integration**: Next.js API routes currently query local mock state (`db.servers`). For complete M1 integration, `apps/web` needs a unified API client (`apps/web/src/lib/apiClient.ts`) that fetches from `apps/api` REST endpoints (`/api/v1/servers`, `/api/v1/nodes`, `/api/v1/backups`, `/api/v1/moderation`, `/api/v1/audit`) or proxies requests seamlessly.
2. **HostProvider Selection**: Server registration modal does not currently prompt for `hostProvider` (`DOCKER_AGENT`, `PTERODACTYL`, `DIRECT_RCON_SSH`) or `agentId` assignment.
3. **Agent Node Pairing**: No UI interface exists for viewing registered `AgentNode` instances or generating agent pairing tokens.
4. **WebSocket Console & Telemetry**: No WebSocket hook exists in `apps/web` to stream live RCON stdout lines or real-time CPU/RAM metrics from `/api/v1/ws/client`.

---

## 3. UI Design & Component Architecture (R1.5 Specification)

To meet the production standards of `AGENTS.md` and ensure scalable maintainability, the UI architecture will be refactored into modular components across `@mc-admin/ui` and `apps/web`.

### 3.1 Design System Extensions (`packages/ui/src/`)

```
packages/ui/src/
├── index.ts                 # Export barrel for theme, tokens, and components
├── theme.ts                 # Color palette, spacing, typography tokens
├── components/
│   ├── Button.tsx           # Primary, Danger, Secondary, Outline, Ghost buttons
│   ├── Badge.tsx            # Status, HostProvider, and Action badges
│   ├── Card.tsx             # Panel container with headers and footers
│   ├── Modal.tsx            # Accessible modal dialog shell with backdrop
│   ├── ConfirmModal.tsx     # Dangerous action confirmation modal with red highlight
│   ├── Table.tsx            # Structured data table with header and cell wrappers
│   ├── Input.tsx            # Dark themed form text/number inputs
│   └── Select.tsx           # Dark themed select dropdowns
```

#### Detailed Specs for Design System Components:
1. **`Button`**:
   - Props: `variant?: 'primary' | 'danger' | 'success' | 'secondary' | 'outline'`, `size?: 'sm' | 'md' | 'lg'`, `isLoading?: boolean`, `icon?: React.ReactNode`.
   - Dark theme styling: `primary` (#1d4ed8 hover #2563eb), `danger` (#dc2626 hover #b91c1c), `secondary` (#1f2937 hover #374151).
2. **`Badge`**:
   - Props: `status: string`, `type?: 'server' | 'backup' | 'moderation' | 'provider'`.
   - Renders semantic colors:
     - `ONLINE` / `COMPLETED` / `SUCCESS` -> Green (#14532d bg, #4ade80 text)
     - `OFFLINE` / `FAILED` / `BAN` -> Red (#7f1d1d bg, #f87171 text)
     - `STARTING` / `RUNNING` / `MUTE` / `WARN` -> Amber/Yellow (#78350f bg, #fde047 text)
     - `DOCKER_AGENT` / `PTERODACTYL` / `DIRECT_RCON_SSH` -> Blue/Purple (#1e3a8a bg, #60a5fa text)
3. **`ConfirmModal`**:
   - Dedicated modal component for high-risk operations (Stopping server, Restoring snapshot, Banning player, Deleting node).
   - Features: Red alert icon header (`AlertTriangle`), explicit risk warning description, requirement for secondary click confirmation, and disabling close-on-backdrop to prevent accidental dismissal.
4. **`Modal`**:
   - Props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `maxWidth?: string`.
   - Handles Escape key press and backdrop clicks.

---

### 3.2 Web Dashboard Layout & Pages (`apps/web/src/`)

```
apps/web/src/
├── components/
│   ├── Header.tsx                 # Global navigation header with node status & sync button
│   ├── Sidebar.tsx                # Left navigation drawer for dashboard tabs
│   ├── ServerCard.tsx             # Server card component with power & backup controls
│   ├── ServerGrid.tsx             # Grid layout for live server nodes
│   ├── NodeManagementView.tsx     # Agent nodes table & pairing token generator
│   ├── BackupManagementView.tsx   # Backup history table & manual trigger
│   ├── ModerationLedgerView.tsx   # Moderation history table & infraction form
│   ├── AuditTrailView.tsx         # Structured audit log viewer
│   ├── ConsoleModal.tsx           # Real-time server RCON console & log streamer
│   ├── RegisterServerModal.tsx    # Modal form to register new server node
│   └── RegisterNodeModal.tsx      # Modal form to generate Agent Node pairing key
├── hooks/
│   ├── useDashboardData.ts        # SWR/React fetch hook for polling server/backup/mod state
│   └── useServerConsole.ts        # WebSocket client hook for live RCON log streaming
├── lib/
│   └── apiClient.ts               # Client REST API wrapper for backend endpoints
└── pages/
    ├── _app.tsx                   # App wrapper with global CSS imports
    ├── _document.tsx              # HTML document setup
    └── index.tsx                  # Dashboard container mounting header, sidebar, and tab views
```

---

## 4. End-to-End Integration Architecture

### 4.1 Data Flow Sequence

```
+-----------------------------------------------------------------------------------+
|                                Next.js Admin Dashboard UI                         |
|                                       (apps/web)                                  |
+----+---------------------------------------+----------------------------------+---+
     | REST API Calls (Fetch / Axios)        | WebSocket Client Connection
     v                                       v
+-----------------------------------------------------------------------------------+
|                                  REST API Backend                                 |
|                                     (apps/api)                                    |
+----+-------------------+-------------------+-------------------+------------------+
     |                   |                   |                   |
     v (Prisma Client)   v (HostProvider)    v (Backup Engine)   v (AuditLogger)
+----------+       +-------------------+ +---------------+ +------------------+
|packages/ |       | packages/bedrock  | |packages/      | | packages/audit   |
|db        |       | - DockerAgent     | |backups        | | (AuditLog      |
|(Postgres)|       | - Pterodactyl     | |(R2 Streaming) | |  Event Dispatch|
+----------+       | - DirectRconSsh   | +---------------+ +------------------+
                   +---------+---------+
                             | Outbound WSS Tunnel
                             v
                   +-------------------+
                   |    apps/agent     |
                   | (Go Agent Daemon) |
                   +-------------------+
```

### 4.2 API Endpoint Mapping & Data Structures

| Web Dashboard UI Action | API Route Endpoint | Method | Payload / Params | Package Backend Invocation |
|---|---|---|---|---|
| **Fetch Dashboard State** | `/api/v1/servers`, `/api/v1/nodes`, `/api/v1/backups`, `/api/v1/moderation` | `GET` | None | `prisma.bedrockServer.findMany()`, `prisma.agentNode.findMany()`, etc. |
| **Register Server Node** | `/api/v1/servers` | `POST` | `{ name, hostProvider, host, port, rconPort, maxPlayers, gameMode, difficulty, agentId }` | `prisma.bedrockServer.create()`, `AuditLogger.record()` |
| **Power Control Action** | `/api/v1/servers/:id/power` | `POST` | `{ action: 'START' \| 'STOP' \| 'RESTART' \| 'KILL' }` | `HostProviderFactory.getProvider(server).startServer()`, `AuditLogger.record()` |
| **Send RCON Command** | `/api/v1/servers/:id/rcon` | `POST` | `{ command: "list" }` | `HostProviderFactory.getProvider(server).executeRcon()`, `AuditLogger.record()` |
| **Trigger Backup** | `/api/v1/backups` | `POST` | `{ serverId, isManual: true, notes }` | `BackupEngine.triggerBackup()`, `AuditLogger.record()` |
| **Restore Backup** | `/api/v1/backups/:id/restore` | `POST` | `{ serverId }` | `BackupEngine.restoreBackup()`, `AuditLogger.record()` |
| **Record Moderation** | `/api/v1/moderation` | `POST` | `{ gamertag, playerXuid, actionType, reason, durationMinutes }` | `ModerationService.createAction()`, `AuditLogger.record()` |
| **Generate Node Key** | `/api/v1/nodes/token` | `POST` | `{ nodeName }` | `prisma.connectionKey.create()`, `AuditLogger.record()` |
| **Live Console Stream** | `/api/v1/ws/client` | `WS` | `{ serverId, authToken }` | Real-time WebSocket multiplexing from Agent Tunnel |

---

## 5. Detailed Component Specs & Proposed Code Changes

### 5.1 `@mc-admin/ui` Enhancements (`packages/ui/src/index.ts`)

```typescript
// Shared UI design system constants, badges, buttons, and modal helpers
export const UI_THEME = {
  colors: {
    bgDark: '#090d16',
    panelBg: '#111827',
    panelBorder: '#1f2937',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#22c55e',
    successBg: '#14532d',
    danger: '#ef4444',
    dangerBg: '#7f1d1d',
    warning: '#f59e0b',
    warningBg: '#78350f',
    textMain: '#f9fafb',
    textMuted: '#9ca3af'
  }
};

export function getStatusBadgeStyle(status: string): { bg: string; color: string } {
  switch (status) {
    case 'ONLINE':
    case 'COMPLETED':
    case 'SUCCESS':
      return { bg: '#14532d', color: '#4ade80' };
    case 'STARTING':
    case 'RUNNING':
    case 'MUTE':
    case 'WARN':
      return { bg: '#78350f', color: '#fde047' };
    case 'OFFLINE':
    case 'FAILED':
    case 'BAN':
    case 'KICK':
    case 'ERROR':
      return { bg: '#7f1d1d', color: '#f87171' };
    case 'DOCKER_AGENT':
    case 'PTERODACTYL':
    case 'DIRECT_RCON_SSH':
      return { bg: '#1e3a8a', color: '#60a5fa' };
    default:
      return { bg: '#1f2937', color: '#9ca3af' };
  }
}
```

### 5.2 Server Card Component (`apps/web/src/components/ServerCard.tsx`)

```tsx
import React from 'react';
import { Play, Square, RotateCcw, HardDrive, Terminal, Server as ServerIcon } from 'lucide-react';
import { getStatusBadgeStyle } from '@mc-admin/ui';

interface ServerCardProps {
  server: {
    id: string;
    name: string;
    status: string;
    hostProvider?: string;
    host: string;
    port: number;
    rconPort?: number;
    version: string;
    maxPlayers: number;
    gameMode: string;
    difficulty: string;
  };
  onControl: (id: string, action: 'start' | 'stop' | 'restart') => void;
  onTriggerBackup: (id: string) => void;
  onOpenConsole: (server: any) => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({
  server,
  onControl,
  onTriggerBackup,
  onOpenConsole
}) => {
  const statusStyle = getStatusBadgeStyle(server.status);
  const providerStyle = getStatusBadgeStyle(server.hostProvider || 'DOCKER_AGENT');

  return (
    <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{server.name}</h3>
            <span style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
              {server.status}
            </span>
            <span style={{ backgroundColor: providerStyle.bg, color: providerStyle.color, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
              {server.hostProvider || 'DOCKER_AGENT'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>
            {server.host}:{server.port} | RCON: {server.rconPort || 19133}
          </p>
        </div>
        <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>BDS v{server.version}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
        <div>
          <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Slots</span>
          <strong style={{ fontSize: '14px', color: '#3b82f6' }}>{server.maxPlayers} Max</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Game Mode</span>
          <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>{server.gameMode}</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Difficulty</span>
          <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>{server.difficulty}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onControl(server.id, server.status === 'ONLINE' ? 'stop' : 'start')}
          style={{
            flex: 1,
            backgroundColor: server.status === 'ONLINE' ? '#7f1d1d' : '#14532d',
            color: '#fff',
            border: 'none',
            padding: '8px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          {server.status === 'ONLINE' ? <Square size={14} /> : <Play size={14} />}
          {server.status === 'ONLINE' ? 'Stop Process' : 'Start Process'}
        </button>

        <button
          onClick={() => onControl(server.id, 'restart')}
          style={{ backgroundColor: '#1f2937', color: '#f9fafb', border: '1px solid #374151', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <RotateCcw size={14} /> Restart
        </button>

        <button
          onClick={() => onTriggerBackup(server.id)}
          style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
        >
          <HardDrive size={14} /> Backup
        </button>

        <button
          onClick={() => onOpenConsole(server)}
          style={{ backgroundColor: '#374151', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Terminal size={14} /> RCON
        </button>
      </div>
    </div>
  );
};
```

### 5.3 Confirmation Modal Component (`apps/web/src/components/ConfirmModal.tsx`)

```tsx
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Confirm Action',
  confirmVariant = 'danger',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
      <div style={{ backgroundColor: '#111827', border: confirmVariant === 'danger' ? '1px solid #7f1d1d' : '1px solid #1f2937', borderRadius: '8px', padding: '24px', width: '440px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: confirmVariant === 'danger' ? '#ef4444' : '#3b82f6' }}>
          <AlertTriangle size={24} />
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f9fafb' }}>{title}</h3>
        </div>

        <p style={{ margin: 0, fontSize: '14px', color: '#d1d5db', lineHeight: 1.5 }}>{description}</p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            onClick={onCancel}
            style={{ backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              backgroundColor: confirmVariant === 'danger' ? '#dc2626' : '#1d4ed8',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 6. Verification Method & Build Steps

1. **Static Analysis & Type Checking**:
   - Run TypeScript compiler across monorepo: `pnpm --filter @mc-admin/web exec tsc --noEmit`.
   - Run Next.js linting: `pnpm --filter @mc-admin/web lint`.

2. **Monorepo Build Verification**:
   - Execute full monorepo build: `pnpm build`.
   - Verify zero compilation errors across `@mc-admin/ui`, `@mc-admin/db`, `@mc-admin/bedrock`, `@mc-admin/api`, and `@mc-admin/web`.

3. **E2E & Unit Test Verification**:
   - Run Vitest suite: `pnpm test`.
   - Ensure all 41+ E2E tests pass 100%.

4. **Manual UI Flow Sanity Verification**:
   - Launch Next.js dev server (`pnpm --filter @mc-admin/web dev`) and visit `http://localhost:3000`.
   - Verify server node registration modal successfully creates a new server card.
   - Verify stopping a process triggers the red `ConfirmModal`.
   - Verify recording a moderation action triggers infraction creation and audit logging.
