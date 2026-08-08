/**
 * Prisma ↔ MemoryDatabase sync for Wave A persistence.
 *
 * Domain packages keep using the synchronous in-memory `db` singleton.
 * When DB_ADAPTER=prisma, the API hydrates memory from Postgres on boot and
 * write-through flushes after mutating requests.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  BackupStatus,
  HostProviderType,
  ModerationType,
  PipelineStatus,
  ServerStatus,
  UserRole,
  type AgentNode,
  type AuditLog,
  type BackupRecord,
  type BdsVersion,
  type BedrockServer,
  type ConnectionKey,
  type ModerationAction,
  type Pipeline,
  type PipelineRun,
  type ServerMember,
  type ServerTemplate,
  type User
} from './schema';
import { getDatabaseAdapterMode } from './adapter';
import { prisma as defaultPrisma } from './client';

/** Minimal surface needed for hydrate/flush (avoids circular import with index.ts). */
export interface PersistableDatabase {
  users: User[];
  agentNodes: AgentNode[];
  connectionKeys: ConnectionKey[];
  serverMembers: ServerMember[];
  servers: BedrockServer[];
  backups: BackupRecord[];
  moderationActions: ModerationAction[];
  templates: ServerTemplate[];
  pipelines: Pipeline[];
  pipelineRuns: PipelineRun[];
  auditLogs: AuditLog[];
  bdsVersions: BdsVersion[];
  seedDefaults(): void;
}

export function isPrismaPersistenceEnabled(): boolean {
  return getDatabaseAdapterMode() === 'prisma';
}

function asHostProvider(value: string | undefined): HostProviderType {
  if (value === HostProviderType.PTERODACTYL) return HostProviderType.PTERODACTYL;
  if (value === HostProviderType.DIRECT_RCON_SSH) return HostProviderType.DIRECT_RCON_SSH;
  return HostProviderType.DOCKER_AGENT;
}

function asServerStatus(value: string): ServerStatus {
  return (Object.values(ServerStatus) as string[]).includes(value)
    ? (value as ServerStatus)
    : ServerStatus.OFFLINE;
}

function asBackupStatus(value: string): BackupStatus {
  return (Object.values(BackupStatus) as string[]).includes(value)
    ? (value as BackupStatus)
    : BackupStatus.PENDING;
}

function asUserRole(value: string): UserRole {
  return (Object.values(UserRole) as string[]).includes(value)
    ? (value as UserRole)
    : UserRole.VIEWER;
}

function asModerationType(value: string): ModerationType {
  return (Object.values(ModerationType) as string[]).includes(value)
    ? (value as ModerationType)
    : ModerationType.NOTE;
}

function asPipelineStatus(value: string): PipelineStatus {
  return (Object.values(PipelineStatus) as string[]).includes(value)
    ? (value as PipelineStatus)
    : PipelineStatus.PENDING;
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringRecord(value: unknown): Record<string, string> {
  const obj = jsonObject(value) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = String(v);
  }
  return out;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

/** Load all Prisma rows into the in-memory database (replaces collections). */
export async function hydrateMemoryFromPrisma(
  memory: PersistableDatabase,
  client: PrismaClient = defaultPrisma
): Promise<void> {
  const [
    users,
    agentNodes,
    servers,
    connectionKeys,
    serverMembers,
    backups,
    moderationActions,
    templates,
    pipelines,
    pipelineRuns,
    auditLogs,
    bdsVersions
  ] = await Promise.all([
    client.user.findMany(),
    client.agentNode.findMany(),
    client.bedrockServer.findMany(),
    client.connectionKey.findMany(),
    client.serverMember.findMany(),
    client.backupRecord.findMany(),
    client.moderationAction.findMany(),
    client.serverTemplate.findMany(),
    client.pipeline.findMany(),
    client.pipelineRun.findMany(),
    client.auditLog.findMany(),
    client.bdsVersion.findMany()
  ]);

  memory.users = users.map(
    (u): User => ({
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash ?? undefined,
      username: u.username ?? undefined,
      role: asUserRole(u.role),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    })
  );

  memory.agentNodes = agentNodes.map(
    (n): AgentNode => ({
      id: n.id,
      name: n.name,
      version: n.version,
      status: (n.status as AgentNode['status']) || 'OFFLINE',
      secretTokenHash: n.secretTokenHash ?? undefined,
      lastHeartbeat: n.lastHeartbeat ?? undefined,
      createdAt: n.createdAt
    })
  );

  memory.servers = servers.map(
    (s): BedrockServer => ({
      id: s.id,
      name: s.name,
      type: s.type,
      hostProvider: s.hostProvider,
      version: s.version,
      host: s.host,
      port: s.port,
      rconPort: s.rconPort ?? undefined,
      rconPassword: s.rconPassword ?? undefined,
      serverPath: s.serverPath,
      status: asServerStatus(s.status),
      maxPlayers: s.maxPlayers,
      gameMode: s.gameMode,
      difficulty: s.difficulty,
      ownerId: s.ownerId ?? undefined,
      agentId: s.agentId ?? undefined,
      agentTunnelId: s.agentTunnelId ?? undefined,
      pterodactylServerId: s.pterodactylServerId ?? undefined,
      autoUpdate: s.autoUpdate,
      lastCrashAt: s.lastCrashAt ?? undefined,
      crashCount24h: s.crashCount24h,
      deletedAt: s.deletedAt ?? undefined,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    })
  );

  memory.connectionKeys = connectionKeys.map(
    (k): ConnectionKey => ({
      id: k.id,
      serverId: k.serverId,
      key: k.key,
      maxUses: k.maxUses,
      useCount: k.useCount,
      expiresAt: k.expiresAt ?? undefined,
      createdAt: k.createdAt
    })
  );

  memory.serverMembers = serverMembers.map(
    (m): ServerMember => ({
      id: m.id,
      serverId: m.serverId,
      userId: m.userId,
      role: asUserRole(m.role)
    })
  );

  memory.backups = backups.map(
    (b): BackupRecord => ({
      id: b.id,
      serverId: b.serverId,
      filename: b.filename,
      fileSizeBytes: Number(b.fileSizeBytes),
      storageUrl: b.storageUrl ?? undefined,
      sha256: b.sha256 ?? undefined,
      verified: b.verified,
      status: asBackupStatus(b.status),
      isManual: b.isManual,
      notes: b.notes ?? undefined,
      storagePath: b.storagePath,
      bdsVersion: b.bdsVersion ?? undefined,
      manifest: jsonObject(b.manifestJson) as Record<string, any> | undefined,
      createdAt: b.createdAt
    })
  );

  memory.moderationActions = moderationActions.map(
    (m): ModerationAction => ({
      id: m.id,
      serverId: m.serverId ?? undefined,
      playerXuid: m.playerXuid ?? undefined,
      gamertag: m.gamertag,
      actionType: asModerationType(m.actionType),
      reason: m.reason,
      issuerId: m.issuerId ?? '',
      issuerName: m.issuerName,
      durationMinutes: m.durationMinutes ?? undefined,
      active: m.active,
      deletedAt: m.deletedAt ?? undefined,
      createdAt: m.createdAt
    })
  );

  memory.templates = templates.map(
    (t): ServerTemplate => ({
      id: t.id,
      name: t.name,
      description: t.description,
      bdsVersion: t.bdsVersion,
      defaultProperties: stringRecord(t.defaultProperties),
      addonPacks: stringArray(t.addonPacks),
      createdAt: t.createdAt
    })
  );

  memory.pipelines = pipelines.map((p): Pipeline => {
    const stepsRaw = Array.isArray(p.steps) ? p.steps : [];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      steps: stepsRaw.map((step, index) => {
        const s = (step ?? {}) as Record<string, unknown>;
        return {
          order: typeof s.order === 'number' ? s.order : index,
          action: String(s.action ?? 'unknown'),
          config: (jsonObject(s.config) ?? {}) as Record<string, any>
        };
      }),
      createdAt: p.createdAt
    };
  });

  memory.pipelineRuns = pipelineRuns.map(
    (r): PipelineRun => ({
      id: r.id,
      pipelineId: r.pipelineId,
      serverId: r.serverId ?? undefined,
      status: asPipelineStatus(r.status),
      logs: stringArray(r.logs),
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? undefined
    })
  );

  memory.auditLogs = auditLogs.map(
    (a): AuditLog => ({
      id: a.id,
      userId: a.userId ?? undefined,
      actorId: a.actorId,
      actorName: a.actorName,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: jsonObject(a.metadata) as Record<string, any> | undefined,
      timestamp: a.timestamp
    })
  );

  memory.bdsVersions = bdsVersions.map(
    (v): BdsVersion => ({
      id: v.id,
      version: v.version,
      downloadUrl: v.downloadUrl,
      releaseDate: v.releaseDate,
      isLatest: v.isLatest,
      isSupported: v.isSupported
    })
  );
}

let flushInFlight: Promise<void> | null = null;

/** Upsert the in-memory snapshot into Postgres (ordered for FK safety). */
export async function flushMemoryToPrisma(
  memory: PersistableDatabase,
  client: PrismaClient = defaultPrisma
): Promise<void> {
  if (flushInFlight) {
    await flushInFlight;
  }

  flushInFlight = (async () => {
    // Users first (referenced by members, moderation, audit)
    for (const u of memory.users) {
      await client.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          username: u.username,
          role: u.role,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt ?? u.createdAt
        },
        update: {
          email: u.email,
          passwordHash: u.passwordHash,
          username: u.username,
          role: u.role,
          updatedAt: u.updatedAt ?? new Date()
        }
      });
    }

    for (const n of memory.agentNodes) {
      await client.agentNode.upsert({
        where: { id: n.id },
        create: {
          id: n.id,
          name: n.name,
          version: n.version,
          secretTokenHash: n.secretTokenHash,
          status: n.status,
          lastHeartbeat: n.lastHeartbeat,
          createdAt: n.createdAt
        },
        update: {
          name: n.name,
          version: n.version,
          secretTokenHash: n.secretTokenHash,
          status: n.status,
          lastHeartbeat: n.lastHeartbeat
        }
      });
    }

    for (const s of memory.servers) {
      await client.bedrockServer.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          name: s.name,
          type: s.type ?? 'VANILLA',
          hostProvider: asHostProvider(s.hostProvider),
          version: s.version,
          host: s.host,
          port: s.port,
          rconPort: s.rconPort,
          rconPassword: s.rconPassword,
          serverPath: s.serverPath,
          status: s.status,
          maxPlayers: s.maxPlayers,
          gameMode: s.gameMode,
          difficulty: s.difficulty,
          ownerId: s.ownerId,
          agentId: s.agentId,
          agentTunnelId: s.agentTunnelId,
          pterodactylServerId: s.pterodactylServerId,
          autoUpdate: s.autoUpdate ?? false,
          lastCrashAt: s.lastCrashAt,
          crashCount24h: s.crashCount24h ?? 0,
          deletedAt: s.deletedAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        },
        update: {
          name: s.name,
          type: s.type ?? 'VANILLA',
          hostProvider: asHostProvider(s.hostProvider),
          version: s.version,
          host: s.host,
          port: s.port,
          rconPort: s.rconPort,
          rconPassword: s.rconPassword,
          serverPath: s.serverPath,
          status: s.status,
          maxPlayers: s.maxPlayers,
          gameMode: s.gameMode,
          difficulty: s.difficulty,
          ownerId: s.ownerId,
          agentId: s.agentId,
          agentTunnelId: s.agentTunnelId,
          pterodactylServerId: s.pterodactylServerId,
          autoUpdate: s.autoUpdate ?? false,
          lastCrashAt: s.lastCrashAt,
          crashCount24h: s.crashCount24h ?? 0,
          deletedAt: s.deletedAt,
          updatedAt: s.updatedAt
        }
      });
    }

    for (const k of memory.connectionKeys) {
      await client.connectionKey.upsert({
        where: { id: k.id },
        create: {
          id: k.id,
          serverId: k.serverId,
          key: k.key,
          maxUses: k.maxUses ?? 1,
          useCount: k.useCount,
          expiresAt: k.expiresAt,
          createdAt: k.createdAt
        },
        update: {
          serverId: k.serverId,
          key: k.key,
          maxUses: k.maxUses ?? 1,
          useCount: k.useCount,
          expiresAt: k.expiresAt
        }
      });
    }

    for (const m of memory.serverMembers) {
      await client.serverMember.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          serverId: m.serverId,
          userId: m.userId,
          role: m.role
        },
        update: {
          serverId: m.serverId,
          userId: m.userId,
          role: m.role
        }
      });
    }

    for (const t of memory.templates) {
      await client.serverTemplate.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          name: t.name,
          description: t.description,
          bdsVersion: t.bdsVersion,
          defaultProperties: t.defaultProperties as Prisma.InputJsonValue,
          addonPacks: t.addonPacks as Prisma.InputJsonValue,
          createdAt: t.createdAt
        },
        update: {
          name: t.name,
          description: t.description,
          bdsVersion: t.bdsVersion,
          defaultProperties: t.defaultProperties as Prisma.InputJsonValue,
          addonPacks: t.addonPacks as Prisma.InputJsonValue
        }
      });
    }

    for (const p of memory.pipelines) {
      await client.pipeline.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          description: p.description,
          steps: p.steps as unknown as Prisma.InputJsonValue,
          createdAt: p.createdAt
        },
        update: {
          name: p.name,
          description: p.description,
          steps: p.steps as unknown as Prisma.InputJsonValue
        }
      });
    }

    for (const b of memory.backups) {
      await client.backupRecord.upsert({
        where: { id: b.id },
        create: {
          id: b.id,
          serverId: b.serverId,
          filename: b.filename,
          fileSizeBytes: BigInt(b.fileSizeBytes ?? 0),
          storageUrl: b.storageUrl,
          storagePath: b.storagePath,
          sha256: b.sha256,
          verified: b.verified ?? false,
          status: b.status,
          isManual: b.isManual,
          notes: b.notes,
          bdsVersion: b.bdsVersion,
          manifestJson: (b.manifest ?? undefined) as Prisma.InputJsonValue | undefined,
          createdAt: b.createdAt
        },
        update: {
          serverId: b.serverId,
          filename: b.filename,
          fileSizeBytes: BigInt(b.fileSizeBytes ?? 0),
          storageUrl: b.storageUrl,
          storagePath: b.storagePath,
          sha256: b.sha256,
          verified: b.verified ?? false,
          status: b.status,
          isManual: b.isManual,
          notes: b.notes,
          bdsVersion: b.bdsVersion,
          manifestJson: (b.manifest ?? undefined) as Prisma.InputJsonValue | undefined
        }
      });
    }

    for (const m of memory.moderationActions) {
      await client.moderationAction.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          serverId: m.serverId,
          playerXuid: m.playerXuid,
          gamertag: m.gamertag,
          actionType: m.actionType,
          reason: m.reason,
          issuerId: m.issuerId || null,
          issuerName: m.issuerName,
          durationMinutes: m.durationMinutes,
          active: m.active,
          deletedAt: m.deletedAt,
          createdAt: m.createdAt
        },
        update: {
          serverId: m.serverId,
          playerXuid: m.playerXuid,
          gamertag: m.gamertag,
          actionType: m.actionType,
          reason: m.reason,
          issuerId: m.issuerId || null,
          issuerName: m.issuerName,
          durationMinutes: m.durationMinutes,
          active: m.active,
          deletedAt: m.deletedAt
        }
      });
    }

    for (const r of memory.pipelineRuns) {
      await client.pipelineRun.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          pipelineId: r.pipelineId,
          serverId: r.serverId,
          status: r.status,
          logs: r.logs as Prisma.InputJsonValue,
          startedAt: r.startedAt,
          completedAt: r.completedAt
        },
        update: {
          pipelineId: r.pipelineId,
          serverId: r.serverId,
          status: r.status,
          logs: r.logs as Prisma.InputJsonValue,
          completedAt: r.completedAt
        }
      });
    }

    for (const a of memory.auditLogs) {
      await client.auditLog.upsert({
        where: { id: a.id },
        create: {
          id: a.id,
          userId: a.userId,
          actorId: a.actorId,
          actorName: a.actorName,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          metadata: (a.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          timestamp: a.timestamp
        },
        update: {
          userId: a.userId,
          actorId: a.actorId,
          actorName: a.actorName,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          metadata: (a.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          timestamp: a.timestamp
        }
      });
    }

    for (const v of memory.bdsVersions) {
      await client.bdsVersion.upsert({
        where: { id: v.id },
        create: {
          id: v.id,
          version: v.version,
          downloadUrl: v.downloadUrl,
          releaseDate: v.releaseDate,
          isLatest: v.isLatest,
          isSupported: v.isSupported
        },
        update: {
          version: v.version,
          downloadUrl: v.downloadUrl,
          releaseDate: v.releaseDate,
          isLatest: v.isLatest,
          isSupported: v.isSupported
        }
      });
    }
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

/**
 * Boot helper: hydrate from Prisma when enabled; seed + flush if the DB is empty.
 */
export async function initializeDatabase(
  memory: PersistableDatabase,
  client: PrismaClient = defaultPrisma
): Promise<{ mode: 'memory' | 'prisma'; seeded: boolean }> {
  if (!isPrismaPersistenceEnabled()) {
    return { mode: 'memory', seeded: memory.users.length > 0 };
  }

  await hydrateMemoryFromPrisma(memory, client);

  if (memory.users.length === 0) {
    memory.seedDefaults();
    await flushMemoryToPrisma(memory, client);
    return { mode: 'prisma', seeded: true };
  }

  return { mode: 'prisma', seeded: false };
}
