import { describe, it, expect, beforeEach } from 'vitest';
import { db, PipelineStatus, ServerStatus } from '@mc-admin/db';
import {
  PipelineEngine,
  PortPool,
  DnsProvider,
  SubdomainAllocator,
  generateSubdomain,
  ConsoleOnboardingService
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
    // Reset shared port pool between tests by releasing all leases for known servers
    for (const lease of PipelineEngine.getPortPool().listLeases()) {
      PipelineEngine.getPortPool().release(lease.port);
    }
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

  it('allocates play subdomain and UDP port when allocateNetwork is set', async () => {
    const result = await PipelineEngine.runServerSetupPipeline({
      serverName: 'Networked Realm',
      templateId: 'tmpl_vanilla_survival',
      actorName: 'AdminUser',
      allocateNetwork: true,
      nodeIp: '10.0.0.8',
      subdomain: 'realmnet',
      preferredPort: 19140
    });

    expect(result.network).toBeDefined();
    expect(result.network?.fqdn).toBe('realmnet.play.bedrockops.io');
    expect(result.network?.port).toBe(19140);
    expect(result.server.port).toBe(19140);
    expect(result.server.host).toBe('realmnet.play.bedrockops.io');
    expect(result.network?.dns.stub).toBe(true);
  });
});

describe('PortPool & DnsProvider', () => {
  it('allocates and releases ports within 19132-19999', () => {
    const pool = new PortPool(19132, 19134);
    const a = pool.allocate('srv_a');
    expect(a.port).toBe(19132);
    const b = pool.allocate('srv_b', 19134);
    expect(b.port).toBe(19134);
    expect(pool.isAvailable(19133)).toBe(true);
    expect(pool.remaining()).toBe(1);
    expect(pool.release(19132)).toBe(true);
    expect(pool.isAvailable(19132)).toBe(true);
  });

  it('throws when pool is exhausted', () => {
    const pool = new PortPool(19132, 19132);
    pool.allocate('srv_1');
    expect(() => pool.allocate('srv_2')).toThrow(/exhausted/);
  });

  it('provisions A+SRV records and verifies routing', () => {
    const dns = new DnsProvider('play.bedrockops.io');
    const res = dns.provisionSubdomain('myrealm', '1.2.3.4', 19150);
    expect(res.fqdn).toBe('myrealm.play.bedrockops.io');
    expect(res.aRecord.type).toBe('A');
    expect(res.srvRecord.port).toBe(19150);
    expect(dns.verifyRecordRouting(res.fqdn, 19150).valid).toBe(true);
    expect(dns.deleteSubdomain('myrealm').deletedCount).toBe(2);
  });

  it('generates stable subdomains from seed', () => {
    expect(generateSubdomain('srv_1')).toBe(generateSubdomain('srv_1'));
    expect(generateSubdomain().length).toBe(6);
  });

  it('SubdomainAllocator wires port + DNS together', () => {
    const pool = new PortPool(19132, 19999);
    const dns = new DnsProvider('play.bedrockops.io');
    const allocator = new SubdomainAllocator(pool, dns);
    const alloc = allocator.allocate({
      serverId: 'srv_x',
      nodeIp: '10.0.0.1',
      subdomain: 'abc123'
    });
    expect(alloc.fqdn).toBe('abc123.play.bedrockops.io');
    expect(alloc.port).toBeGreaterThanOrEqual(19132);
    const freed = allocator.deallocate('srv_x', 'abc123');
    expect(freed.portsReleased).toBe(1);
    expect(freed.dnsDeleted).toBe(2);
  });
});

describe('ConsoleOnboardingService', () => {
  it('resolves gamertag, invites friend bot, and builds allowlist plan', async () => {
    const service = new ConsoleOnboardingService();
    const result = await service.onboard({
      gamertag: 'SwitchGamer99',
      serverId: 'srv_1',
      serverPath: '/var/minecraft/srv_1',
      autoAcceptInvite: true
    });

    expect(result.xuid).toMatch(/^25354/);
    expect(result.invite.status).toBe('ACCEPTED');
    expect(result.allowlistEntry.name).toBe('SwitchGamer99');
    expect(result.allowlistPlan?.entriesCount).toBe(1);
    expect(result.stub).toBe(true);
  });
});
