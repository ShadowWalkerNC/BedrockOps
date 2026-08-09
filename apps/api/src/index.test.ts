import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ApiServer, app } from './index';
import { db } from '@mc-admin/db';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { signJwt } from '@mc-admin/auth';
import { UserRole } from '@mc-admin/db';

describe('ApiServer & REST API Backend (R1.3 & R1.4)', () => {
  let authToken: string;

  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.auditLogs = [];
    db.moderationActions = [];
    db.agentNodes = [];
    NotificationDispatcher.sentMessages = [];
    db.seedDefaults();

    authToken = signJwt(
      { userId: 'usr_admin_1', username: 'admin', role: UserRole.OWNER },
      'dev_jwt_secret_change_in_production'
    );
  });

  it('fetches server list via ApiServer', async () => {
    const servers = await ApiServer.getServers();
    expect(servers.length).toBe(1);
    expect(servers[0].name).toBe('Main Survival Realm');
  });

  it('creates new server via ApiServer', async () => {
    const server = await ApiServer.createServer({
      name: 'API Test Server',
      host: '127.0.0.1',
      port: 19140
    });

    expect(server.id).toBeDefined();
    expect(server.name).toBe('API Test Server');
    expect(db.servers.some((s) => s.id === server.id)).toBe(true);
  });

  it('authenticates user and returns JWT on /api/v1/auth/login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@minecraft-admin.local', password: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });

  it('fetches servers on GET /api/v1/servers with valid JWT', async () => {
    const res = await request(app)
      .get('/api/v1/servers')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.servers)).toBe(true);
    expect(res.body.servers.length).toBeGreaterThan(0);
  });

  it('creates server on POST /api/v1/servers with ADMIN role and records audit log', async () => {
    const res = await request(app)
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'New Realm Server',
        hostProvider: 'DOCKER_AGENT',
        version: '1.20.80',
        port: 19140
      });

    expect(res.status).toBe(201);
    expect(res.body.server.name).toBe('New Realm Server');
    expect(db.auditLogs.some(a => a.action === 'SERVER_CREATE')).toBe(true);
  });

  it('dispatches power actions on POST /api/v1/servers/:id/power and records audit log', async () => {
    const res = await request(app)
      .post('/api/v1/servers/srv_bedrock_1/power')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ action: 'START' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.stub).toBe(true);
    expect(db.auditLogs.some(a => a.action === 'SERVER_POWER_START')).toBe(true);
  });

  it('creates moderation action on POST /api/v1/moderation and records audit log', async () => {
    const res = await request(app)
      .post('/api/v1/moderation')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        gamertag: 'SteveGamer99',
        actionType: 'BAN',
        reason: 'Cheating/Hacking'
      });

    expect(res.status).toBe(201);
    expect(res.body.moderationAction.gamertag).toBe('SteveGamer99');
    expect(db.auditLogs.some(a => a.action === 'MODERATION_BAN')).toBe(true);
  });

  it('tracks a player join and lists them on GET /api/v1/moderation/players/search', async () => {
    const joinRes = await request(app)
      .post('/api/v1/moderation/players/join')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        serverId: 'srv_bedrock_1',
        line: '[2026-08-09 12:00:00:000 INFO] Player connected: JoinTester, xuid: 2535411111111111'
      });

    expect(joinRes.status).toBe(201);
    expect(joinRes.body.player.gamertag).toBe('JoinTester');
    expect(joinRes.body.player.xuid).toBe('2535411111111111');

    const searchRes = await request(app)
      .get('/api/v1/moderation/players/search?q=JoinTester')
      .set('Authorization', `Bearer ${authToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.tracked.some((p: { gamertag: string }) => p.gamertag === 'JoinTester')).toBe(true);
  });

  it('GDPR-anonymizes a player and records an audit log', async () => {
    await request(app)
      .post('/api/v1/moderation')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gamertag: 'RightToBeForgotten', playerXuid: '2535422222222222', actionType: 'BAN', reason: 'Test' });

    const res = await request(app)
      .post('/api/v1/moderation/gdpr/anonymize')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gamertagOrXuid: 'RightToBeForgotten' });

    expect(res.status).toBe(200);
    expect(res.body.result.updated).toBe(1);
    expect(db.auditLogs.some((a) => a.action === 'MODERATION_GDPR_ANONYMIZE')).toBe(true);

    const listRes = await request(app)
      .get('/api/v1/moderation')
      .set('Authorization', `Bearer ${authToken}`);
    expect(listRes.body.moderationActions.some((m: { gamertag: string }) => m.gamertag === 'RightToBeForgotten')).toBe(false);
  });

  it('returns an atomic allowlist write plan (202 stub) when no agent is connected', async () => {
    const res = await request(app)
      .post('/api/v1/moderation/allowlist/sync')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        serverId: 'srv_bedrock_1',
        entries: [{ name: 'AlexCraft', xuid: '2535433333333333' }]
      });

    expect(res.status).toBe(202);
    expect(res.body.stub).toBe(true);
    expect(res.body.plan.entriesCount).toBe(1);
    expect(res.body.plan.targetPath).toContain('allowlist.json');
    expect(db.auditLogs.some((a) => a.action === 'ALLOWLIST_SYNC')).toBe(true);
  });

  it('allocates a play subdomain + UDP port on POST /api/v1/provisioning/network', async () => {
    const res = await request(app)
      .post('/api/v1/provisioning/network')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ serverId: 'srv_bedrock_1', nodeIp: '203.0.113.20', subdomain: 'apitest' });

    expect(res.status).toBe(201);
    expect(res.body.allocation.fqdn).toBe('apitest.play.bedrockops.io');
    expect(res.body.allocation.port).toBeGreaterThanOrEqual(19132);
    expect(res.body.server.host).toBe('apitest.play.bedrockops.io');
    expect(db.auditLogs.some((a) => a.action === 'NETWORK_ALLOCATE')).toBe(true);

    // Release so the port pool stays clean for other tests.
    await request(app)
      .delete('/api/v1/provisioning/network/srv_bedrock_1?subdomain=apitest')
      .set('Authorization', `Bearer ${authToken}`);
  });

  it('onboards a console player on POST /api/v1/provisioning/onboarding/console', async () => {
    const res = await request(app)
      .post('/api/v1/provisioning/onboarding/console')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gamertag: 'ApiConsoleKid', serverId: 'srv_bedrock_1', autoAcceptInvite: true });

    expect(res.status).toBe(201);
    expect(res.body.onboarding.xuid).toMatch(/^25354\d{11}$/);
    expect(res.body.onboarding.invite.status).toBe('ACCEPTED');
    expect(res.body.onboarding.allowlistEntry.name).toBe('ApiConsoleKid');
    expect(db.auditLogs.some((a) => a.action === 'CONSOLE_ONBOARDING')).toBe(true);
  });

  it('queues a Discord alert when a BAN is issued', async () => {
    const res = await request(app)
      .post('/api/v1/moderation')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gamertag: 'AlertBanned', actionType: 'BAN', reason: 'Cheating', serverId: 'srv_bedrock_1' });

    expect(res.status).toBe(201);
    const alert = NotificationDispatcher.sentMessages.find(
      (m) => m.payload.embeds?.[0].title.includes('BAN') && m.payload.embeds?.[0].title.includes('AlertBanned')
    );
    expect(alert).toBeDefined();
    expect(alert!.payload.username).toBe('Minecraft Ops Alert');
  });

  it('does not queue a Discord alert for a WARN', async () => {
    await request(app)
      .post('/api/v1/moderation')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gamertag: 'JustWarned', actionType: 'WARN', reason: 'Minor spam' });

    expect(NotificationDispatcher.sentMessages.length).toBe(0);
  });

  it('queues a backup failure Discord alert when the agent is offline', async () => {
    const res = await request(app)
      .post('/api/v1/backups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ serverId: 'srv_bedrock_1', isManual: true });

    expect(res.status).toBe(503);
    const alert = NotificationDispatcher.sentMessages.find((m) => m.payload.username === 'Minecraft Backup Service');
    expect(alert).toBeDefined();
    expect(alert!.payload.embeds?.[0].description).toContain('failed');
  });

  it('lists audit logs on GET /api/v1/audit', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.auditLogs)).toBe(true);
  });

  it('rejects login when password does not match the stored hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@minecraft-admin.local', password: 'admin123' });

    expect(res.status).toBe(401);
  });

  it('strips rconPassword from server list responses', async () => {
    const res = await request(app)
      .get('/api/v1/servers')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.servers[0].rconPassword).toBeUndefined();
    expect(res.body.servers[0].hasRconPassword).toBe(true);
  });

  it('rejects mass-assignment of status/ownerId on PATCH', async () => {
    const serverId = db.servers[0].id;
    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'ONLINE', ownerId: 'usr_attacker', name: 'Renamed' });

    expect(res.status).toBe(400);
  });
});

describe('Agent WebSocket auth', () => {
  it('authenticates seeded node with DEV agent token', async () => {
    const { authenticateAgentUpgrade } = await import('./ws/router');
    const { DEV_AGENT_TOKEN } = await import('@mc-admin/db');
    const req = {
      headers: { authorization: `Bearer ${DEV_AGENT_TOKEN}` },
      url: '/api/v1/ws/agent?nodeId=node_docker_agent_1'
    } as import('http').IncomingMessage;

    expect(authenticateAgentUpgrade(req, 'node_docker_agent_1')).toEqual({ ok: true });
  });

  it('rejects missing or invalid agent tokens', async () => {
    const { authenticateAgentUpgrade } = await import('./ws/router');
    const bare = { headers: {}, url: '/api/v1/ws/agent?nodeId=node_docker_agent_1' } as import('http').IncomingMessage;
    expect(authenticateAgentUpgrade(bare, 'node_docker_agent_1').ok).toBe(false);

    const bad = {
      headers: { authorization: 'Bearer totally-wrong' },
      url: '/api/v1/ws/agent?nodeId=node_docker_agent_1'
    } as import('http').IncomingMessage;
    expect(authenticateAgentUpgrade(bad, 'node_docker_agent_1').ok).toBe(false);
  });
});
