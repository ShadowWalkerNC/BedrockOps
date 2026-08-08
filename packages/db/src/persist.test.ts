import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupStatus, HostProviderType, ServerStatus, UserRole } from './schema';
import {
  flushMemoryToPrisma,
  hydrateMemoryFromPrisma,
  initializeDatabase,
  type PersistableDatabase
} from './persist';

function emptyMemory(): PersistableDatabase {
  return {
    users: [],
    agentNodes: [],
    connectionKeys: [],
    serverMembers: [],
    servers: [],
    backups: [],
    moderationActions: [],
    templates: [],
    pipelines: [],
    pipelineRuns: [],
    auditLogs: [],
    bdsVersions: [],
    seedDefaults() {
      this.users.push({
        id: 'usr_seed',
        email: 'seed@example.com',
        role: UserRole.OWNER,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z')
      });
      this.agentNodes.push({
        id: 'node_seed',
        name: 'Seed Node',
        version: 'v1',
        status: 'ONLINE',
        createdAt: new Date('2024-01-01T00:00:00Z')
      });
      this.servers.push({
        id: 'srv_seed',
        name: 'Seed Realm',
        type: 'VANILLA',
        hostProvider: HostProviderType.DOCKER_AGENT,
        version: '1.21.0',
        host: '127.0.0.1',
        port: 19132,
        serverPath: '/data/seed',
        status: ServerStatus.OFFLINE,
        maxPlayers: 10,
        gameMode: 'survival',
        difficulty: 'easy',
        agentId: 'node_seed',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z')
      });
    }
  };
}

function mockPrismaClient(rows?: Partial<Record<string, unknown[]>>) {
  const empty = rows ?? {};
  const upsert = vi.fn(async ({ where, create }: { where: { id: string }; create: unknown }) => ({
    id: where.id,
    ...(create as object)
  }));

  return {
    user: { findMany: vi.fn(async () => empty.user ?? []), upsert },
    agentNode: { findMany: vi.fn(async () => empty.agentNode ?? []), upsert },
    bedrockServer: { findMany: vi.fn(async () => empty.bedrockServer ?? []), upsert },
    connectionKey: { findMany: vi.fn(async () => empty.connectionKey ?? []), upsert },
    serverMember: { findMany: vi.fn(async () => empty.serverMember ?? []), upsert },
    backupRecord: { findMany: vi.fn(async () => empty.backupRecord ?? []), upsert },
    moderationAction: { findMany: vi.fn(async () => empty.moderationAction ?? []), upsert },
    serverTemplate: { findMany: vi.fn(async () => empty.serverTemplate ?? []), upsert },
    pipeline: { findMany: vi.fn(async () => empty.pipeline ?? []), upsert },
    pipelineRun: { findMany: vi.fn(async () => empty.pipelineRun ?? []), upsert },
    auditLog: { findMany: vi.fn(async () => empty.auditLog ?? []), upsert },
    bdsVersion: { findMany: vi.fn(async () => empty.bdsVersion ?? []), upsert }
  };
}

describe('Prisma persist layer', () => {
  beforeEach(() => {
    delete process.env.DB_ADAPTER;
  });

  it('hydrates memory collections from Prisma rows', async () => {
    const memory = emptyMemory();
    const client = mockPrismaClient({
      user: [
        {
          id: 'usr_1',
          email: 'a@b.c',
          passwordHash: null,
          username: 'admin',
          role: 'OWNER',
          createdAt: new Date('2024-02-01T00:00:00Z'),
          updatedAt: new Date('2024-02-01T00:00:00Z')
        }
      ],
      bedrockServer: [
        {
          id: 'srv_1',
          name: 'Hydrated Realm',
          type: 'VANILLA',
          hostProvider: 'DOCKER_AGENT',
          version: '1.21.3',
          host: '10.0.0.2',
          port: 19132,
          rconPort: 19133,
          rconPassword: 'x',
          serverPath: '/data/a',
          status: 'ONLINE',
          maxPlayers: 20,
          gameMode: 'survival',
          difficulty: 'hard',
          ownerId: 'usr_1',
          agentId: null,
          agentTunnelId: null,
          pterodactylServerId: null,
          autoUpdate: false,
          lastCrashAt: null,
          crashCount24h: 0,
          deletedAt: null,
          createdAt: new Date('2024-02-01T00:00:00Z'),
          updatedAt: new Date('2024-02-01T00:00:00Z')
        }
      ],
      backupRecord: [
        {
          id: 'bkp_1',
          serverId: 'srv_1',
          filename: 'a.tar.gz',
          fileSizeBytes: BigInt(2048),
          storageUrl: 'https://r2.example/a.tar.gz',
          storagePath: 'backups/a.tar.gz',
          sha256: 'abc',
          verified: true,
          status: 'COMPLETED',
          isManual: true,
          isHoldCheckpoint: true,
          notes: null,
          bdsVersion: '1.21.3',
          manifestJson: { version: 1 },
          createdAt: new Date('2024-02-02T00:00:00Z')
        }
      ]
    });

    await hydrateMemoryFromPrisma(memory, client as never);

    expect(memory.users).toHaveLength(1);
    expect(memory.users[0].role).toBe(UserRole.OWNER);
    expect(memory.servers[0].name).toBe('Hydrated Realm');
    expect(memory.backups[0].fileSizeBytes).toBe(2048);
    expect(memory.backups[0].status).toBe(BackupStatus.COMPLETED);
    expect(memory.backups[0].manifest).toEqual({ version: 1 });
  });

  it('flushes memory rows through Prisma upserts in FK-safe order', async () => {
    const memory = emptyMemory();
    memory.seedDefaults();
    memory.backups.push({
      id: 'bkp_seed',
      serverId: 'srv_seed',
      filename: 'seed.tar.gz',
      fileSizeBytes: 10,
      status: BackupStatus.PENDING,
      isManual: true,
      storagePath: '/backups/seed.tar.gz',
      createdAt: new Date('2024-01-02T00:00:00Z')
    });

    const client = mockPrismaClient();
    await flushMemoryToPrisma(memory, client as never);

    expect(client.user.upsert).toHaveBeenCalled();
    expect(client.agentNode.upsert).toHaveBeenCalled();
    expect(client.bedrockServer.upsert).toHaveBeenCalled();
    expect(client.backupRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bkp_seed' },
        create: expect.objectContaining({ fileSizeBytes: BigInt(10) })
      })
    );
  });

  it('initializeDatabase seeds and flushes when Prisma is empty', async () => {
    process.env.DB_ADAPTER = 'prisma';
    const memory = emptyMemory();
    const client = mockPrismaClient();

    const result = await initializeDatabase(memory, client as never);

    expect(result).toEqual({ mode: 'prisma', seeded: true });
    expect(memory.users[0].id).toBe('usr_seed');
    expect(client.user.upsert).toHaveBeenCalled();
  });

  it('initializeDatabase is a no-op hydrate path in memory mode', async () => {
    const memory = emptyMemory();
    const result = await initializeDatabase(memory, mockPrismaClient() as never);
    expect(result.mode).toBe('memory');
    expect(memory.users).toHaveLength(0);
  });
});
