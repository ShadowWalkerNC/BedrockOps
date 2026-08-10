import { createHash } from 'crypto';
import { UserRole, ServerStatus } from './schema';
import { assertDatabaseModeAllowed, isMemoryDatabaseMode } from './adapter';

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
export * from './persist';
export * from './paths';

/** Well-known bcrypt hash of password "admin" (cost 10) for local/test seeding only. */
export const DEV_ADMIN_PASSWORD_HASH =
  '$2a$10$Sh1gOjVviMfq2IbRugR.k.DTz1c5rOoj8fGzBXEDXj/lIJyLgHDZq';

/** Dev agent bearer token — hash is seeded; plaintext ships only in .env.example. */
export const DEV_AGENT_TOKEN = 'dev_agent_token_change_me';

export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** @deprecated Use assertDatabaseModeAllowed — kept for callers from security hardening. */
export function assertMemoryDbAllowed(): void {
  assertDatabaseModeAllowed();
}

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
      passwordHash: DEV_ADMIN_PASSWORD_HASH,
      role: UserRole.OWNER,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    this.agentNodes.push({
      id: 'node_docker_agent_1',
      name: 'Local Docker Host Agent',
      version: 'v1.0.0-static-go',
      status: 'ONLINE',
      secretTokenHash: hashAgentToken(DEV_AGENT_TOKEN),
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

    this.bdsVersions.push(
      {
        id: 'bds_v1_20_80',
        version: '1.20.80',
        downloadUrl: 'https://minecraft.azureedge.net/bin-linux/bedrock-server-1.20.80.05.zip',
        releaseDate: new Date('2024-04-15'),
        isLatest: false,
        isSupported: true
      },
      {
        id: 'bds_v1_21_0',
        version: '1.21.0',
        downloadUrl: 'https://minecraft.azureedge.net/bin-linux/bedrock-server-1.21.0.03.zip',
        releaseDate: new Date('2024-06-15'),
        isLatest: true,
        isSupported: true
      }
    );
  }
}

assertDatabaseModeAllowed();
export const db = new MemoryDatabase();

// Memory mode seeds at import for unit tests / local dev.
// Prisma mode hydrates (and seeds if empty) via initializeDatabase() in the API boot path.
if (isMemoryDatabaseMode()) {
  db.seedDefaults();
}
