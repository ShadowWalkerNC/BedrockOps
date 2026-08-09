/**
 * Live Postgres smoke — run only when DB_ADAPTER=prisma (CI service or local compose).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './client';
import { MemoryDatabase } from './index';
import {
  flushMemoryToPrisma,
  hydrateMemoryFromPrisma,
  initializeDatabase
} from './persist';

const enabled = process.env.DB_ADAPTER === 'prisma';

describe.runIf(enabled)('Prisma persistence integration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('initializes, flushes, and rehydrates against Postgres', async () => {
    // Isolate from other suites by wiping tables in FK-safe order
    await prisma.pipelineRun.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.moderationAction.deleteMany();
    await prisma.backupRecord.deleteMany();
    await prisma.serverMember.deleteMany();
    await prisma.connectionKey.deleteMany();
    await prisma.bedrockServer.deleteMany();
    await prisma.pipeline.deleteMany();
    await prisma.serverTemplate.deleteMany();
    await prisma.bdsVersion.deleteMany();
    await prisma.agentNode.deleteMany();
    await prisma.user.deleteMany();

    const memory = new MemoryDatabase();
    const init = await initializeDatabase(memory, prisma);
    expect(init.mode).toBe('prisma');
    expect(init.seeded).toBe(true);
    expect(memory.users.length).toBeGreaterThan(0);

    memory.servers[0].name = 'Persisted Realm';
    await flushMemoryToPrisma(memory, prisma);

    const reloaded = new MemoryDatabase();
    await hydrateMemoryFromPrisma(reloaded, prisma);
    expect(reloaded.servers[0]?.name).toBe('Persisted Realm');
    expect(reloaded.users[0]?.email).toBe(memory.users[0].email);
  });
});
