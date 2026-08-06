import { db, BackupRecord, BackupStatus } from '@mc-admin/db';

export interface CreateBackupInput {
  serverId: string;
  isManual: boolean;
  notes?: string;
}

export interface RestoreBackupResult {
  success: boolean;
  stub?: boolean;
  message: string;
}

const STUB_NOTE = '[STUB: backup engine pending agent/filesystem integration]';

export class BackupEngine {
  public static triggerBackup(input: CreateBackupInput): BackupRecord {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${input.serverId}_${timestamp}.zip`;
    const storagePath = `/backups/${input.serverId}/${filename}`;

    const record: BackupRecord = {
      id: `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      serverId: input.serverId,
      filename,
      fileSizeBytes: 0,
      status: BackupStatus.PENDING,
      isManual: input.isManual,
      notes: input.notes ? `${input.notes} ${STUB_NOTE}` : STUB_NOTE,
      storagePath,
      createdAt: new Date()
    };

    db.backups.push(record);
    return record;
  }

  /** Finalize a backup after agent/worker completes archive I/O. */
  public static completeBackup(backupId: string, fileSizeBytes: number): BackupRecord {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      throw new Error(`Backup ID ${backupId} not found`);
    }
    backup.status = BackupStatus.COMPLETED;
    backup.fileSizeBytes = fileSizeBytes;
    return backup;
  }

  public static getBackupsForServer(serverId: string): BackupRecord[] {
    return db.backups.filter((b) => b.serverId === serverId);
  }

  public static restoreBackup(backupId: string): RestoreBackupResult {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      return { success: false, message: `Backup ID ${backupId} not found` };
    }
    if (backup.status !== BackupStatus.COMPLETED) {
      return {
        success: false,
        stub: true,
        message: `Backup ${backupId} is not completed (status: ${backup.status}). Restore unavailable until archive is finalized.`
      };
    }

    // TODO: Wire agent filesystem restore in Phase 2
    return {
      success: false,
      stub: true,
      message: `Restore is not yet implemented. TODO: agent filesystem integration for ${backup.filename}.`
    };
  }

  public static applyRetentionPolicy(serverId: string, maxRetentionCount = 5): number {
    const serverBackups = this.getBackupsForServer(serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (serverBackups.length > maxRetentionCount) {
      const toDelete = serverBackups.slice(maxRetentionCount);
      const deleteIds = new Set(toDelete.map((b) => b.id));
      db.backups = db.backups.filter((b) => !deleteIds.has(b.id));
      return toDelete.length;
    }
    return 0;
  }
}
