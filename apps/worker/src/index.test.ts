import { describe, it, expect, beforeEach } from 'vitest';
import { BackgroundJobWorker } from './index';
import { db } from '@mc-admin/db';

describe('BackgroundJobWorker App', () => {
  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.seedDefaults();
  });

  it('runs scheduled backup sweep across registered servers', async () => {
    await BackgroundJobWorker.runScheduledBackupSweep();
    expect(db.backups.length).toBe(db.servers.length);
    expect(db.backups[0].notes).toContain('Automated nightly cron backup sweep');
  });
});
