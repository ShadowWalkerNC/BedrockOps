import { describe, it, expect, beforeEach } from 'vitest';
import { db, BackupStatus } from '@mc-admin/db';
import { BackupEngine } from './index';

describe('BackupEngine Package', () => {
  beforeEach(() => {
    db.backups = [];
  });

  it('triggers a manual backup record successfully', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: true,
      notes: 'Pre-update safety snapshot'
    });

    expect(backup.id).toBeDefined();
    expect(backup.status).toBe(BackupStatus.COMPLETED);
    expect(backup.isManual).toBe(true);
    expect(backup.notes).toBe('Pre-update safety snapshot');
    expect(db.backups.length).toBe(1);
  });

  it('restores a valid backup snapshot', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: false
    });

    const result = BackupEngine.restoreBackup(backup.id);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Successfully restored');
  });

  it('enforces retention policy by removing old backups exceeding max count', () => {
    for (let i = 0; i < 7; i++) {
      BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: false });
    }

    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(7);
    const removedCount = BackupEngine.applyRetentionPolicy('srv_1', 5);
    expect(removedCount).toBe(2);
    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(5);
  });
});
