import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@mc-admin/db';
import { BackupEngine } from '@mc-admin/backups';
import { AuditLogger } from '@mc-admin/audit';
import { NotificationDispatcher } from '@mc-admin/notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ backups: db.backups });
  }

  if (req.method === 'POST') {
    const { action, serverId, backupId, webhookUrl, notes } = req.body;

    if (action === 'trigger') {
      const backup = BackupEngine.triggerBackup({
        serverId: serverId || 'srv_main_1',
        isManual: true,
        notes: notes || 'Manual safety snapshot via Dashboard UI'
      });

      AuditLogger.record({
        actorId: 'usr_admin_1',
        actorName: 'admin',
        action: 'BACKUP_MANUAL_TRIGGER',
        entityType: 'BackupRecord',
        entityId: backup.id,
        metadata: { serverId: backup.serverId }
      });

      if (webhookUrl) {
        const server = db.servers.find((s) => s.id === backup.serverId);
        const payload = NotificationDispatcher.formatBackupEmbed(
          server ? server.name : backup.serverId,
          backup.filename,
          true,
          backup.fileSizeBytes
        );
        await NotificationDispatcher.sendWebhook(webhookUrl, payload);
      }

      return res.status(201).json({ success: true, backup });
    }

    if (action === 'restore') {
      const result = BackupEngine.restoreBackup(backupId);
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      AuditLogger.record({
        actorId: 'usr_admin_1',
        actorName: 'admin',
        action: 'BACKUP_RESTORE',
        entityType: 'BackupRecord',
        entityId: backupId
      });

      return res.status(200).json({ success: true, message: result.message });
    }

    return res.status(400).json({ error: 'Invalid backup action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
