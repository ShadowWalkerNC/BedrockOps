export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  VIEWER = 'VIEWER'
}

export enum ServerStatus {
  OFFLINE = 'OFFLINE',
  STARTING = 'STARTING',
  ONLINE = 'ONLINE',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
  MAINTENANCE = 'MAINTENANCE'
}

export enum BackupStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum ModerationType {
  WARN = 'WARN',
  MUTE = 'MUTE',
  KICK = 'KICK',
  BAN = 'BAN',
  NOTE = 'NOTE'
}

export enum PipelineStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export enum HostProviderType {
  DOCKER_AGENT = 'DOCKER_AGENT',
  PTERODACTYL = 'PTERODACTYL',
  DIRECT_RCON_SSH = 'DIRECT_RCON_SSH'
}

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  username?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AgentNode {
  id: string;
  name: string;
  version: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  lastHeartbeat?: Date;
  createdAt: Date;
}

export interface ConnectionKey {
  id: string;
  serverId: string;
  key: string;
  maxUses?: number;
  useCount: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ServerMember {
  id: string;
  serverId: string;
  userId: string;
  role: UserRole;
}

export interface BedrockServer {
  id: string;
  name: string;
  type?: string; // e.g. VANILLA, BEHAVIOR, POCKETMINE
  hostProvider?: string; // e.g. DOCKER_AGENT, PTERODACTYL
  version: string;
  host: string;
  port: number;
  rconPort?: number;
  rconPassword?: string;
  serverPath: string;
  status: ServerStatus;
  maxPlayers: number;
  gameMode: string;
  difficulty: string;
  ownerId?: string;
  agentId?: string;
  agentTunnelId?: string;
  pterodactylServerId?: string;
  autoUpdate?: boolean;
  lastCrashAt?: Date;
  crashCount24h?: number;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupRecord {
  id: string;
  serverId: string;
  filename: string;
  fileSizeBytes: number;
  storageUrl?: string;
  verified?: boolean;
  status: BackupStatus;
  isManual: boolean;
  notes?: string;
  storagePath: string;
  bdsVersion?: string;
  manifest?: Record<string, any>;
  createdAt: Date;
}

export interface ModerationAction {
  id: string;
  serverId?: string;
  playerXuid?: string;
  gamertag: string;
  actionType: ModerationType;
  reason: string;
  issuerId: string;
  issuerName: string;
  durationMinutes?: number;
  active: boolean;
  deletedAt?: Date;
  createdAt: Date;
}

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  bdsVersion: string;
  defaultProperties: Record<string, string>;
  addonPacks: string[];
  createdAt: Date;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: {
    order: number;
    action: string;
    config: Record<string, any>;
  }[];
  createdAt: Date;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  serverId?: string;
  status: PipelineStatus;
  logs: string[];
  startedAt: Date;
  completedAt?: Date;
}

export interface AuditLog {
  id: string;
  userId?: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface BdsVersion {
  id: string;
  version: string;
  downloadUrl: string;
  releaseDate: Date;
  isLatest: boolean;
  isSupported: boolean;
}
