import { describe, it, expect, beforeEach } from 'vitest';
import { db, PipelineStatus, ServerStatus } from '@mc-admin/db';
import {
  PipelineEngine,
  PortPool,
  DnsProvider,
  SubdomainAllocator,
  generateSubdomain
} from './index';
import { NotificationDispatcher } from '@mc-admin/notifications';

describe('PipelineEngine Package', () => {
  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.auditLogs = [];
    db.pipelineRuns = [];
    NotificationDispatcher.sentMessages = [];
    db.seedDefaults();
  });

  it('runs server setup pipeline end-to-end', async () => {
    const result = await PipelineEngine.runServerSetupPipeline({
      serverName: 'New Skyblock Server',
      templateId: 'tmpl_vanilla_survival',
      webhookUrl: 'https://discord.com/api/webhooks/test',
      actorName: 'AdminUser'
    });

    expect(result.server).toBeDefined();
    expect(result.server.name).toBe('New Skyblock Server');
    expect(result.server.status).toBe(ServerStatus.ONLINE);
    expect(result.run.status).toBe(PipelineStatus.SUCCESS);
    expect(db.servers.some((s) => s.id === result.server.id)).toBe(true);
    expect(result.run.logs.some((l) => l.includes('backup snapshot'))).toBe(true);
    expect(db.auditLogs.some((a) => a.action === 'PIPELINE_SERVER_SETUP')).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
  });

  it('allocates a play subdomain + UDP port during setup (R5.1/R5.3)', async () => {
    const result = await PipelineEngine.runServerSetupPipeline({
      serverName: 'Network Realm',
      templateId: 'tmpl_vanilla_survival',
      actorName: 'AdminUser',
      allocateNetwork: true,
      nodeIp: '203.0.113.10'
    });

    expect(result.network).toBeDefined();
    expect(result.network!.port).toBeGreaterThanOrEqual(19132);
    expect(result.network!.port).toBeLessThanOrEqual(19999);
    expect(result.server.host).toBe(result.network!.fqdn);
    expect(result.server.port).toBe(result.network!.port);
    expect(result.network!.dns.aRecord.type).toBe('A');
    expect(result.network!.dns.srvRecord.type).toBe('SRV');
    // No Cloudflare token in dev → honest stub.
    expect(result.network!.dns.stub).toBe(true);
  });

  it('onboards a console player: resolves XUID, dispatches invite, seeds allowlist (R5.2)', async () => {
    const onboarding = await PipelineEngine.onboardConsolePlayer({
      gamertag: 'ConsoleKid',
      serverId: 'srv_bedrock_1',
      serverPath: '/var/minecraft/bedrock-server-1',
      autoAcceptInvite: true
    });

    expect(onboarding.xuid).toMatch(/^25354\d{11}$/);
    expect(onboarding.allowlistEntry.name).toBe('ConsoleKid');
    expect(onboarding.invite.status).toBe('ACCEPTED');
    expect(onboarding.allowlistPlan?.entriesCount).toBe(1);
    expect(onboarding.stub).toBe(true);
  });
});

describe('PortPool & DNS allocation (R5.1)', () => {
  it('reserves and releases ports within the pool range', () => {
    const pool = new PortPool(19132, 19134);
    const a = pool.allocate('srv_a');
    const b = pool.allocate('srv_b');
    expect(a.port).toBe(19132);
    expect(b.port).toBe(19133);
    expect(pool.remaining()).toBe(1);
    expect(() => pool.allocate('srv_a', 19133)).toThrow(); // already taken
    expect(pool.releaseByServer('srv_a')).toBe(1);
    expect(pool.remaining()).toBe(2);
  });

  it('provisions deterministic subdomain A + SRV records', () => {
    const allocator = new SubdomainAllocator(new PortPool(), new DnsProvider('play.example.com'));
    const alloc = allocator.allocate({ serverId: 'srv_x', nodeIp: '198.51.100.5', subdomain: 'abc123' });
    expect(alloc.fqdn).toBe('abc123.play.example.com');
    expect(alloc.dns.srvRecord.content).toContain(`${alloc.port}`);
    expect(generateSubdomain('srv_x')).toMatch(/^[a-f0-9]{6}$/);
  });
});
