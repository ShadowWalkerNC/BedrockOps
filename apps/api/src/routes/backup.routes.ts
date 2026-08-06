import { Router, Response } from 'express';
import { z } from 'zod';
import { db, BackupStatus, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import {
  BackupEngine,
  ManifestVerifier,
  R2PresignClient
} from '@mc-admin/backups';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const backupRouter: Router = Router();

backupRouter.use(authenticateJwt);

// GET /api/v1/backups - List backup records
backupRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ backups: db.backups });
});

// POST /api/v1/backups - Trigger streaming backup (save-hold + agent upload)
const backupTriggerSchema = z.object({
  serverId: z.string().min(1),
  isManual: z.boolean().optional().default(true),
  notes: z.string().optional()
});

backupRouter.post('/', requireRole(UserRole.MODERATOR), async (req: AuthenticatedRequest, res: Response) => {
  const parse = backupTriggerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const { serverId, isManual, notes } = parse.data;
  const server = db.servers.find(s => s.id === serverId && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  const job = await BackupEngine.prepareStreamingBackup(
    { serverId, isManual, notes },
    R2PresignClient.fromEnv()
  );

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'BACKUP_TRIGGER',
    entityType: 'BackupRecord',
    entityId: job.record.id,
    metadata: {
      serverId,
      filename: job.record.filename,
      objectKey: job.objectKey,
      presignStub: job.presignStub,
      saveHoldCommands: job.saveHoldCommands
    }
  });

  const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);

  try {
    const result = await provider.triggerBackup(server, {
      backupId: job.record.id,
      // Empty string when R2 is not configured — agent archives locally and reports honest stub/error if upload required
      presignedUploadUrl: job.presignedUploadUrl,
      isManual,
      isHoldCheckpoint: true
    });

    if (result.success && result.fileSizeBytes !== undefined) {
      const sha256 = result.sha256;
      const manifest = sha256
        ? ManifestVerifier.buildManifest({
            backupId: job.record.id,
            serverId,
            files: [],
            archiveSha256: sha256,
            fileSizeBytes: result.fileSizeBytes,
            isHoldCheckpoint: true
          })
        : undefined;

      BackupEngine.completeBackup(job.record.id, {
        fileSizeBytes: result.fileSizeBytes,
        sha256,
        manifest,
        storageUrl: job.presignStub ? undefined : `r2://${job.objectKey}`,
        verified: !!manifest
      });
    } else if (result.stub || !result.success) {
      BackupEngine.failBackup(
        job.record.id,
        result.error || '[STUB] Backup was not executed on the host agent.'
      );
      return res.status(503).json({
        success: false,
        stub: true,
        backup: job.record,
        message: result.error || 'Backup agent did not complete the archive',
        presignStub: job.presignStub,
        saveHoldCommands: job.saveHoldCommands
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    BackupEngine.failBackup(job.record.id, message);
    return res.status(503).json({
      success: false,
      backup: job.record,
      message,
      presignStub: job.presignStub
    });
  }

  return res.status(201).json({
    success: true,
    backup: job.record,
    objectKey: job.objectKey,
    presignStub: job.presignStub,
    saveHoldCommands: job.saveHoldCommands
  });
});

// POST /api/v1/backups/:id/restore - Restore backup
backupRouter.post('/:id/restore', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  const backup = db.backups.find(b => b.id === req.params.id);
  if (!backup) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Backup record not found' });
  }

  const server = db.servers.find(s => s.id === backup.serverId);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Target server not found' });
  }

  const result = BackupEngine.restoreBackup(backup.id);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'BACKUP_RESTORE',
    entityType: 'BackupRecord',
    entityId: backup.id,
    metadata: { serverId: server.id, success: result.success, stub: result.stub }
  });

  if (!result.success) {
    return res.status(501).json({ error: 'NOT_IMPLEMENTED', ...result, backup, server });
  }

  return res.json({ ...result, backup, server });
});

// POST /api/v1/backups/:id/verify - Re-check stored manifest integrity metadata
backupRouter.post('/:id/verify', requireRole(UserRole.MODERATOR), (req: AuthenticatedRequest, res: Response) => {
  const backup = db.backups.find(b => b.id === req.params.id);
  if (!backup) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Backup record not found' });
  }
  if (backup.status !== BackupStatus.COMPLETED || !backup.sha256 || !backup.manifest) {
    return res.status(409).json({
      error: 'NOT_VERIFIABLE',
      message: 'Backup must be COMPLETED with sha256 + manifest metadata'
    });
  }

  const verified = ManifestVerifier.verify(backup.manifest as any, {
    archiveSha256: backup.sha256,
    fileSizeBytes: backup.fileSizeBytes
  });
  backup.verified = verified.ok;

  return res.json({ backup, verification: verified });
});
