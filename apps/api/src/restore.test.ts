import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signJwt } from '@mc-admin/auth';
import { BackupEngine } from '@mc-admin/backups';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { db, UserRole } from '@mc-admin/db';
import { app } from './app';

describe('Backup restore API', () => {
  let authToken: string;

  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.auditLogs = [];
    db.agentNodes = [];
    db.seedDefaults();
    HostProviderFactory.reset();

    authToken = signJwt(
      { userId: 'usr_admin_1', username: 'admin', role: UserRole.OWNER },
      'dev_jwt_secret_change_in_production'
    );
  });

  it('restores via connected agent tunnel using downloadUrlOverride', async () => {
    const server = db.servers[0];
    const backup = BackupEngine.triggerBackup({ serverId: server.id, isManual: true });
    BackupEngine.completeBackup(backup.id, {
      fileSizeBytes: 4096,
      storageUrl: `r2://backups/${server.id}/${backup.id}/world.tar.gz`
    });

    HostProviderFactory.bindAgentTunnel({
      isNodeConnected: () => true,
      sendCommand: async (_nodeId, _serverId, command, payload) => {
        expect(command).toBe('RESTORE_BACKUP');
        expect(payload.presignedDownloadUrl).toBe('http://127.0.0.1:9/world.tar.gz');
        return {
          success: true,
          backupId: payload.backupId,
          fileSizeBytes: 4096,
          output: 'restored 2 files'
        };
      }
    });

    const res = await request(app)
      .post(`/api/v1/backups/${backup.id}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ downloadUrlOverride: 'http://127.0.0.1:9/world.tar.gz' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.auditLogs.some((a) => a.action === 'BACKUP_RESTORE')).toBe(true);
  });

  it('returns 503 when R2 and override are unavailable', async () => {
    const server = db.servers[0];
    const backup = BackupEngine.triggerBackup({ serverId: server.id, isManual: true });
    BackupEngine.completeBackup(backup.id, 1024);

    HostProviderFactory.bindAgentTunnel({
      isNodeConnected: () => true,
      sendCommand: async () => ({ success: true })
    });

    const res = await request(app)
      .post(`/api/v1/backups/${backup.id}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('RESTORE_UNAVAILABLE');
    expect(res.body.stub).toBe(true);
  });
});
