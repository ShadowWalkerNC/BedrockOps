import {
  UserRole,
  ServerStatus,
  BackupStatus,
  ModerationType,
  PipelineStatus
} from './schema';

import type {
  User,
  AgentNode,
  ConnectionKey,
  ServerMember,
  BedrockServer,
  BackupRecord,
  ModerationAction,
  ServerTemplate,
  Pipeline,
  PipelineRun,
  AuditLog,
  BdsVersion
} from './schema';

export * from './schema';
export * from './client';
export * from './adapter';

export class MemoryDatabase {
  public users: User[] = [];
  public agentNodes: AgentNode[] = [];
  public connectionKeys: ConnectionKey[] = [];
  public serverMembers: ServerMember[] = [];
  public servers: BedrockServer[] = [];
  public backups: BackupRecord[] = [];
  public moderationActions: ModerationAction[] = [];
  public templates: ServerTemplate[] = [];
  public pipelines: Pipeline[] = [];
  public pipelineRuns: PipelineRun[] = [];
  public auditLogs: AuditLog[] = [];
  public bdsVersions: BdsVersion[] = [];

  // Seed defaults for development & unit testing
  public seedDefaults() {
    this.users.push({
      id: 'usr_admin_1',
      username: 'admin',
      email: 'admin@minecraft-admin.local',
      role: UserRole.OWNER,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    this.agentNodes.push({
      id: 'node_docker_agent_1',
      name: 'Local Docker Host Agent',
      version: 'v1.0.0-static-go',
      status: 'ONLINE',
      lastHeartbeat: new Date(),
      createdAt: new Date()
    });

    this.servers.push({
      id: 'srv_bedrock_1',
      name: 'Main Survival Realm',
      type: 'VANILLA',
      hostProvider: 'DOCKER_AGENT',
      version: '1.20.80',
      host: '127.0.0.1',
      port: 19132,
      rconPort: 19133,
      rconPassword: 'secret_rcon_pass',
      serverPath: '/var/minecraft/bedrock-server-1',
      status: ServerStatus.ONLINE,
      maxPlayers: 10,
      gameMode: 'survival',
      difficulty: 'hard',
      ownerId: 'usr_admin_1',
      agentId: 'node_docker_agent_1',
      agentTunnelId: 'tunnel_ws_main_1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    this.connectionKeys.push({
      id: 'key_1',
      serverId: 'srv_bedrock_1',
      key: 'MINEADMIN2026',
      useCount: 3,
      createdAt: new Date()
    });

    this.templates.push({
      id: 'tmpl_vanilla_survival',
      name: 'Vanilla Hard Survival',
      description: 'Standard vanilla survival Bedrock configuration template.',
      bdsVersion: '1.20.80',
      defaultProperties: {
        'gamemode': 'survival',
        'difficulty': 'hard',
        'allow-cheats': 'false',
        'max-players': '10'
      },
      addonPacks: [],
      createdAt: new Date()
    });

    this.bdsVersions.push({
      id: 'bds_v1_20_80',
      version: '1.20.80',
      downloadUrl: 'https://minecraft.azureedge.net/bin-linux/bedrock-server-1.20.80.05.zip',
      releaseDate: new Date('2024-04-15'),
      isLatest: true,
      isSupported: true
    });
  }
}

export const db = new MemoryDatabase();
db.seedDefaults();
