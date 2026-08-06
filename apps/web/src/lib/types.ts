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
