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
    expect(result.server.status).toBe(ServerStatus.OFFLINE);
    expect(result.server.hostProvider).toBe('DOCKER_AGENT');
    expect(result.server.agentId).toBe('node_docker_agent_1');
    expect(result.server.serverPath).toBeTruthy();
    expect(result.server.serverPath).not.toContain('/var/minecraft/');
    expect(result.run.status).toBe(PipelineStatus.SUCCESS);
    expect(db.servers.some((s) => s.id === result.server.id)).toBe(true);
    expect(result.run.logs.some((l) => l.includes('backup snapshot'))).toBe(true);
    expect(db.auditLogs.some((a) => a.action === 'PIPELINE_SERVER_SETUP')).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
  });

  it('applies Creative Sandbox mode and prepares properties plan', async () => {
    const result = await PipelineEngine.runServerSetupPipeline({
      serverName: 'Sandbox Realm',
      templateId: 'tmpl_creative_sandbox',
      actorName: 'AdminUser'
    });

    expect(result.server.gameMode).toBe('creative');
    expect(result.server.difficulty).toBe('peaceful');
    expect(result.server.maxPlayers).toBe(20);
    expect(result.propertiesPlan?.contents).toContain('gamemode=creative');
    expect(result.propertiesPlan?.targetPath).toContain(result.server.id);
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

  it('provisions deterministic subdomain A + SRV records', async () => {
    const allocator = new SubdomainAllocator(new PortPool(), new DnsProvider('play.example.com'));
    const alloc = await allocator.allocate({ serverId: 'srv_x', nodeIp: '198.51.100.5', subdomain: 'abc123' });
    expect(alloc.fqdn).toBe('abc123.play.example.com');
    expect(alloc.dns.srvRecord.content).toContain(`${alloc.port}`);
    expect(alloc.dns.stub).toBe(true);
    expect(alloc.dns.liveError).toContain('CLOUDFLARE_API_TOKEN');
    expect(generateSubdomain('srv_x')).toMatch(/^[a-f0-9]{6}$/);
  });

  it('posts live Cloudflare DNS records when token + zone are set', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method || 'GET'} ${String(url)}`);
      return new Response(JSON.stringify({ success: true, result: { id: `cf_${calls.length}` } }), {
        status: 200
      });
    };
    const dns = new DnsProvider('play.example.com', 'cf-token', 'zone-1', fetchImpl as typeof fetch);
    const result = await dns.provisionSubdomainLive('live1', '203.0.113.50', 19140);
    expect(result.stub).toBe(false);
    expect(result.aRecord.id).toBe('cf_1');
    expect(result.srvRecord.id).toBe('cf_2');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/zones/zone-1/dns_records');
  });

  it('keeps an honest stub when Cloudflare API fails', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'Invalid zone' }] }), {
        status: 400
      });
    const dns = new DnsProvider('play.example.com', 'cf-token', 'zone-1', fetchImpl as typeof fetch);
    const result = await dns.provisionSubdomainLive('bad', '203.0.113.50', 19141);
    expect(result.stub).toBe(true);
    expect(result.liveError).toContain('Invalid zone');
  });
});
