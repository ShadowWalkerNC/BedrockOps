import { db } from '@mc-admin/db';
import { BackupEngine } from '@mc-admin/backups';

export class BackgroundJobWorker {
  public static async runScheduledBackupSweep() {
    console.log('[Background Worker] Starting scheduled backup sweep for all registered Bedrock servers...');
    for (const server of db.servers) {
      const backup = BackupEngine.triggerBackup({
        serverId: server.id,
        isManual: false,
        notes: 'Automated nightly cron backup sweep'
      });
      BackupEngine.applyRetentionPolicy(server.id, 5);
      console.log(`[Background Worker] Completed automated backup ${backup.filename} for server ${server.name}`);
    }
  }
}

if (require.main === module) {
  console.log('[Background Worker] Started worker process loop.');
}
