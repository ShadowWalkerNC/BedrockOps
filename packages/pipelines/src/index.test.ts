import { describe, it, expect, beforeEach } from 'vitest';
import { db, PipelineStatus, ServerStatus } from '@mc-admin/db';
import { PipelineEngine } from './index';
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
});
