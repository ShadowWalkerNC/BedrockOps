import { db, BackupRecord, BackupStatus } from '@mc-admin/db';

export interface CreateBackupInput {
  serverId: string;
  isManual: boolean;
  notes?: string;
}

export class BackupEngine {
  public static triggerBackup(input: CreateBackupInput): BackupRecord {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${input.serverId}_${timestamp}.zip`;
    const storagePath = `/backups/${input.serverId}/${filename}`;

    const record: BackupRecord = {
      id: `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      serverId: input.serverId,
      filename,
      fileSizeBytes: Math.floor(Math.random() * 50000000) + 1000000, // Simulated size
      status: BackupStatus.COMPLETED,
      isManual: input.isManual,
      notes: input.notes,
      storagePath,
      createdAt: new Date()
    };

    db.backups.push(record);
    return record;
  }

  public static getBackupsForServer(serverId: string): BackupRecord[] {
    return db.backups.filter((b) => b.serverId === serverId);
  }

  public static restoreBackup(backupId: string): { success: boolean; message: string } {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      return { success: false, message: `Backup ID ${backupId} not found` };
    }
    if (backup.status !== BackupStatus.COMPLETED) {
      return { success: false, message: `Backup ID ${backupId} is not in COMPLETED state` };
    }

    return {
      success: true,
      message: `Successfully restored server from backup snapshot ${backup.filename}`
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
