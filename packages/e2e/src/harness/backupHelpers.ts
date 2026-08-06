import { BackupEngine, CreateBackupInput } from '@mc-admin/backups';

/** Test helper: trigger backup then finalize as COMPLETED (simulates agent/worker completion). */
export function triggerAndCompleteBackup(
  input: CreateBackupInput,
  fileSizeBytes = 10_485_760
) {
  const backup = BackupEngine.triggerBackup(input);
  BackupEngine.completeBackup(backup.id, fileSizeBytes);
  return backup;
}
