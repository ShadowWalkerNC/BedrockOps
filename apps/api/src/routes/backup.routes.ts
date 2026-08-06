import { Router, Response } from 'express';
import { z } from 'zod';
import { db, BackupStatus, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { BackupEngine } from '@mc-admin/backups';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const backupRouter: Router = Router();

backupRouter.use(authenticateJwt);

// GET /api/v1/backups - List backup records
backupRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ backups: db.backups });
});

// POST /api/v1/backups - Trigger manual backup
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

  const backupRecord = BackupEngine.triggerBackup({ serverId, isManual, notes });

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'BACKUP_TRIGGER',
    entityType: 'BackupRecord',
    entityId: backupRecord.id,
    metadata: { serverId, filename: backupRecord.filename }
  });

  return res.status(201).json({ backup: backupRecord });
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
