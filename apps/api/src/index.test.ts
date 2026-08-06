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

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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

  it('lists audit logs on GET /api/v1/audit', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.auditLogs)).toBe(true);
  });
});
