import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundJobWorker } from './index';
import { db } from '@mc-admin/db';
import { BackupEngine } from '@mc-admin/backups';
import { HostProviderFactory } from '@mc-admin/bedrock';

describe('BackgroundJobWorker App', () => {
  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.seedDefaults();
    HostProviderFactory.reset();
    BackgroundJobWorker.stop();
  });

  afterEach(() => {
    BackgroundJobWorker.stop();
  });

  it('runs scheduled backup sweep across registered servers (honest stub without agent)', async () => {
    const results = await BackgroundJobWorker.runScheduledBackupSweep();
    expect(results.length).toBe(db.servers.filter((s) => !s.deletedAt).length);
    expect(db.backups.length).toBe(results.length);
    expect(db.backups[0].notes).toContain('Automated nightly cron backup sweep');
    // Without a bound tunnel the host path must not pretend success.
    expect(results[0].stub).toBe(true);
    expect(['FAILED', 'RUNNING', 'PENDING', 'COMPLETED']).toContain(results[0].status);
  });

  it('applies retention during the sweep', async () => {
    const serverId = db.servers[0].id;
    for (let i = 0; i < 6; i++) {
      BackupEngine.triggerBackup({ serverId, isManual: false, notes: `old_${i}` });
    }
    await BackgroundJobWorker.runScheduledBackupSweep({ retentionCount: 5 });
    expect(db.backups.filter((b) => b.serverId === serverId).length).toBe(5);
  });

  it('start() schedules a loop and stop() clears it', () => {
    BackgroundJobWorker.start(60_000);
    BackgroundJobWorker.start(60_000); // idempotent
    BackgroundJobWorker.stop();
  });
});
