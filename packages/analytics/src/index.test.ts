import { describe, it, expect, beforeEach } from 'vitest';
import { db, BackupStatus, ModerationType } from '@mc-admin/db';
import { OperationalMetrics, RateLimiter, detectJoinFlood, JoinFloodMonitor } from './index';

describe('OperationalMetrics.overview', () => {
  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.moderationActions = [];
    db.auditLogs = [];
    db.agentNodes = [];
    db.seedDefaults();
  });

  it('summarizes servers, agents, backups, moderation, and audit', () => {
    db.backups.push(
      { id: 'b1', serverId: 'srv_bedrock_1', filename: 'a', fileSizeBytes: 1, status: BackupStatus.COMPLETED, isManual: true, storagePath: 'x', createdAt: new Date() },
      { id: 'b2', serverId: 'srv_bedrock_1', filename: 'b', fileSizeBytes: 1, status: BackupStatus.COMPLETED, isManual: true, storagePath: 'x', createdAt: new Date() },
      { id: 'b3', serverId: 'srv_bedrock_1', filename: 'c', fileSizeBytes: 1, status: BackupStatus.FAILED, isManual: true, storagePath: 'x', createdAt: new Date() }
    );
    db.moderationActions.push(
      { id: 'm1', gamertag: 'X', actionType: ModerationType.BAN, reason: 'r', issuerId: 'u', issuerName: 'i', active: true, createdAt: new Date() }
    );
    db.auditLogs.push(
      { id: 'a1', actorId: 'u', actorName: 'i', action: 'SERVER_POWER_START', entityType: 'BedrockServer', entityId: 's', timestamp: new Date() },
      { id: 'a2', actorId: 'u', actorName: 'i', action: 'SERVER_POWER_START', entityType: 'BedrockServer', entityId: 's', timestamp: new Date() },
      { id: 'a3', actorId: 'u', actorName: 'i', action: 'MODERATION_BAN', entityType: 'ModerationAction', entityId: 'm', timestamp: new Date() }
    );

    const o = OperationalMetrics.overview(db);
    expect(o.servers.total).toBe(1);
    expect(o.servers.online).toBe(1); // seeded server is ONLINE
    expect(o.agents.total).toBe(1);
    expect(o.agents.online).toBe(1);
    expect(o.backups.completed).toBe(2);
    expect(o.backups.failed).toBe(1);
    expect(o.backups.successRatePct).toBe(67); // 2/3
    expect(o.moderation.activeTotal).toBe(1);
    expect(o.moderation.byType.BAN).toBe(1);
    expect(o.audit.topActions[0]).toEqual({ action: 'SERVER_POWER_START', count: 2 });
  });

  it('reports 100% success when there are no finished backups', () => {
    const o = OperationalMetrics.overview(db);
    expect(o.backups.successRatePct).toBe(100);
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit then blocks within the window', () => {
    const rl = new RateLimiter(3, 60_000);
    const t0 = 1_000_000;
    expect(rl.check('u:ban', t0).allowed).toBe(true);
    expect(rl.check('u:ban', t0 + 1).allowed).toBe(true);
    expect(rl.check('u:ban', t0 + 2).allowed).toBe(true);
    const blocked = rl.check('u:ban', t0 + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('permits again after the window slides forward', () => {
    const rl = new RateLimiter(1, 1_000);
    const t0 = 1_000_000;
    expect(rl.check('k', t0).allowed).toBe(true);
    expect(rl.check('k', t0 + 500).allowed).toBe(false);
    expect(rl.check('k', t0 + 1_001).allowed).toBe(true);
  });

  it('isolates keys and supports reset', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.check('a').allowed).toBe(true);
    expect(rl.check('b').allowed).toBe(true);
    rl.reset('a');
    expect(rl.check('a').allowed).toBe(true);
  });
});

describe('detectJoinFlood', () => {
  it('flags a flood and a suspicious bot pattern', () => {
    const now = 1_000_000;
    const events = [
      { xuid: '1', at: now - 100 },
      { xuid: '1', at: now - 90 },
      { xuid: '1', at: now - 80 },
      { xuid: '2', at: now - 70 }
    ];
    const res = detectJoinFlood(events, { windowMs: 1000, threshold: 4, now });
    expect(res.flood).toBe(true);
    expect(res.count).toBe(4);
    expect(res.uniqueXuids).toBe(2);
    expect(res.suspiciousBotPattern).toBe(false); // 4/2 = 2 < 3
  });

  it('detects bot storm when many joins share few identities', () => {
    const now = 1_000_000;
    const events = Array.from({ length: 6 }, (_, i) => ({ xuid: '1', at: now - i }));
    const res = detectJoinFlood(events, { windowMs: 1000, threshold: 4, now });
    expect(res.flood).toBe(true);
    expect(res.suspiciousBotPattern).toBe(true); // 6/1 >= 3
  });

  it('ignores events outside the window', () => {
    const now = 1_000_000;
    const events = [{ xuid: '1', at: now - 5000 }];
    const res = detectJoinFlood(events, { windowMs: 1000, threshold: 1, now });
    expect(res.flood).toBe(false);
    expect(res.count).toBe(0);
  });
});

describe('JoinFloodMonitor', () => {
  it('accumulates joins and flags a flood', () => {
    const monitor = new JoinFloodMonitor({ windowMs: 60_000, threshold: 3 });
    expect(monitor.record('x1').flood).toBe(false);
    expect(monitor.record('x1').flood).toBe(false);
    const hit = monitor.record('x1');
    expect(hit.flood).toBe(true);
    expect(hit.suspiciousBotPattern).toBe(true);
    monitor.reset();
    expect(monitor.record('x2').flood).toBe(false);
  });
});
