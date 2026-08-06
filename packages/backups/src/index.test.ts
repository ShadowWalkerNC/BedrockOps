import { describe, it, expect, beforeEach } from 'vitest';
import { db, BackupStatus } from '@mc-admin/db';
import { BackupEngine } from './index';

describe('BackupEngine Package', () => {
  beforeEach(() => {
    db.backups = [];
  });

  it('triggers a manual backup record as PENDING stub', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: true,
      notes: 'Pre-update safety snapshot'
    });

    expect(backup.id).toBeDefined();
    expect(backup.status).toBe(BackupStatus.PENDING);
    expect(backup.isManual).toBe(true);
    expect(backup.notes).toContain('Pre-update safety snapshot');
    expect(backup.notes).toContain('[STUB');
    expect(backup.fileSizeBytes).toBe(0);
    expect(db.backups.length).toBe(1);
  });

  it('completes a backup after agent/worker finalization', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: false
    });

    BackupEngine.completeBackup(backup.id, 5_000_000);
    expect(backup.status).toBe(BackupStatus.COMPLETED);
    expect(backup.fileSizeBytes).toBe(5_000_000);
  });

  it('restore returns stub until filesystem integration is wired', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: false
    });
    BackupEngine.completeBackup(backup.id, 1024);

    const result = BackupEngine.restoreBackup(backup.id);
    expect(result.success).toBe(false);
    expect(result.stub).toBe(true);
    expect(result.message).toContain('not yet implemented');
  });

  it('enforces retention policy by removing old backups exceeding max count', () => {
    for (let i = 0; i < 7; i++) {
      const b = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: false });
      BackupEngine.completeBackup(b.id, 1024);
    }

    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(7);
    const removedCount = BackupEngine.applyRetentionPolicy('srv_1', 5);
    expect(removedCount).toBe(2);
    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(5);
  });
});
