/** Dashboard view types aligned with @mc-admin/db schema (dates arrive as ISO strings from JSON). */

export interface DashboardServer {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  rconPort?: number;
  status: string;
  maxPlayers: number;
  gameMode: string;
  difficulty: string;
  serverPath?: string;
  agentId?: string;
  hostProvider?: string;
}

export interface DashboardNode {
  id: string;
  name: string;
  version: string;
  status: string;
  hasToken?: boolean;
  lastHeartbeat?: string;
  createdAt?: string;
}

export interface DashboardSessionUser {
  userId: string;
  email: string;
  username: string;
  role: string;
}

export interface SystemStatus {
  status: string;
  timestamp: string;
  nodeEnv: string;
  dbAdapter: string;
  corsOrigin: string;
  agents?: {
    connectedCount: number;
    connectedNodeIds: string[];
  };
  integrations: {
    r2: boolean;
    discordWebhook: boolean;
    discordSlash: boolean;
    cloudflareDns: boolean;
    xbox: boolean;
  };
}

export interface RealmTemplate {
  id: string;
  name: string;
  description: string;
  bdsVersion: string;
  defaultProperties: Record<string, string>;
  addonPacks: string[];
  createdAt: string;
}

export interface DashboardBackup {
  id: string;
  serverId: string;
  filename: string;
  fileSizeBytes?: number;
  status: string;
  isManual: boolean;
  notes?: string;
  createdAt: string;
}

export interface DashboardModeration {
  id: string;
  gamertag: string;
  actionType: string;
  reason: string;
  issuerName?: string;
}

export type PowerAction = 'START' | 'STOP' | 'RESTART';

export function toPowerAction(action: 'start' | 'stop' | 'restart'): PowerAction {
  return action.toUpperCase() as PowerAction;
}
