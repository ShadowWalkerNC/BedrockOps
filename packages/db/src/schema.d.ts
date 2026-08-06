export declare enum UserRole {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MODERATOR = "MODERATOR",
    STAFF = "STAFF"
}
export declare enum ServerStatus {
    OFFLINE = "OFFLINE",
    STARTING = "STARTING",
    ONLINE = "ONLINE",
    STOPPING = "STOPPING",
    ERROR = "ERROR"
}
export declare enum BackupStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum ModerationType {
    WARN = "WARN",
    MUTE = "MUTE",
    KICK = "KICK",
    BAN = "BAN",
    NOTE = "NOTE"
}
export declare enum PipelineStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    SUCCESS = "SUCCESS",
    FAILED = "FAILED"
}
export interface User {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
}
export interface BedrockServer {
    id: string;
    name: string;
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
    createdAt: Date;
    updatedAt: Date;
}
export interface BackupRecord {
    id: string;
    serverId: string;
    filename: string;
    fileSizeBytes: number;
    status: BackupStatus;
    isManual: boolean;
    notes?: string;
    storagePath: string;
    createdAt: Date;
}
export interface ModerationAction {
    id: string;
    playerXuid?: string;
    gamertag: string;
    actionType: ModerationType;
    reason: string;
    issuerId: string;
    issuerName: string;
    durationMinutes?: number;
    active: boolean;
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
    actorId: string;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    timestamp: Date;
}
//# sourceMappingURL=schema.d.ts.map