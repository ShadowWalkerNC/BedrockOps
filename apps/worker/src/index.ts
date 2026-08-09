import { db, HostProviderType } from '@mc-admin/db';
import { BackupEngine, R2PresignClient } from '@mc-admin/backups';
import { HostProviderFactory } from '@mc-admin/bedrock';

export interface SweepResult {
  serverId: string;
  backupId: string;
  filename: string;
  status: string;
  stub?: boolean;
  message?: string;
}

export class BackgroundJobWorker {
  private static loopHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Nightly-style backup sweep: prepare a streaming backup job per server, attempt
   * host execution via HostProvider (honest stub when no agent tunnel is bound /
   * agent offline), then apply retention. Never pretends a host backup succeeded.
   */
  public static async runScheduledBackupSweep(opts?: {
    retentionCount?: number;
  }): Promise<SweepResult[]> {
    const retentionCount = opts?.retentionCount ?? Number(process.env.BACKUP_RETENTION_COUNT || 5);
    console.log('[Background Worker] Starting scheduled backup sweep for all registered Bedrock servers...');

    const results: SweepResult[] = [];
    const activeServers = db.servers.filter((s) => !s.deletedAt);

    for (const server of activeServers) {
      const job = await BackupEngine.prepareStreamingBackup(
        {
          serverId: server.id,
          isManual: false,
          notes: 'Automated nightly cron backup sweep'
        },
        R2PresignClient.fromEnv()
      );

      const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);
      let stub = true;
      let message = '[STUB] No host agent tunnel — backup record created; host archive not executed.';

      try {
        const result = await provider.triggerBackup(server, {
          backupId: job.record.id,
          presignedUploadUrl: job.presignedUploadUrl,
          isManual: false,
          isHoldCheckpoint: true
        });

        if (result.success && result.fileSizeBytes !== undefined) {
          BackupEngine.completeBackup(job.record.id, {
            fileSizeBytes: result.fileSizeBytes,
            sha256: result.sha256,
            storageUrl: job.presignStub ? undefined : `r2://${job.objectKey}`,
            verified: !!result.sha256
          });
          stub = !!result.stub;
          message = result.stub
            ? '[STUB] Host reported stub backup completion.'
            : `Backup completed (${result.fileSizeBytes} bytes).`;
        } else {
          BackupEngine.failBackup(
            job.record.id,
            result.error || '[STUB] Backup was not executed on the host agent.'
          );
          stub = result.stub ?? true;
          message = result.error || message;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        BackupEngine.failBackup(job.record.id, errMsg);
        message = errMsg;
      }

      BackupEngine.applyRetentionPolicy(server.id, retentionCount);

      console.log(
        `[Background Worker] Queued backup ${job.record.filename} (status: ${job.record.status}) for server ${server.name}`
      );

      results.push({
        serverId: server.id,
        backupId: job.record.id,
        filename: job.record.filename,
        status: job.record.status,
        stub,
        message
      });
    }

    return results;
  }

  /** Start a periodic sweep loop. Idempotent — calling twice keeps the first timer. */
  public static start(intervalMs: number = Number(process.env.BACKUP_SWEEP_INTERVAL_MS || 3_600_000)): void {
    if (this.loopHandle) {
      return;
    }
    console.log(`[Background Worker] Scheduling backup sweep every ${intervalMs}ms`);
    // Kick once immediately, then on the interval.
    void this.runScheduledBackupSweep().catch((err) => {
      console.error('[Background Worker] Initial sweep failed:', err);
    });
    this.loopHandle = setInterval(() => {
      void this.runScheduledBackupSweep().catch((err) => {
        console.error('[Background Worker] Sweep failed:', err);
      });
    }, intervalMs);
    // Allow the process to exit naturally in tests when the handle is the only timer.
    if (typeof this.loopHandle.unref === 'function') {
      this.loopHandle.unref();
    }
  }

  public static stop(): void {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }
}

if (require.main === module) {
  console.log('[Background Worker] Started worker process loop.');
  BackgroundJobWorker.start();
}
