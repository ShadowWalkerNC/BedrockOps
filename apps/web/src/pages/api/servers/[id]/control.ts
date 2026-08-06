import type { NextApiRequest, NextApiResponse } from 'next';
import { db, ServerStatus } from '@mc-admin/db';
import { BedrockServerController } from '@mc-admin/bedrock';
import { AuditLogger } from '@mc-admin/audit';
import { NotificationDispatcher } from '@mc-admin/notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { action, webhookUrl } = req.body; // 'start' | 'stop' | 'restart'

  const server = db.servers.find((s) => s.id === id);
  if (!server) {
    return res.status(404).json({ error: `Server ${id} not found` });
  }

  let nextStatus: ServerStatus = ServerStatus.ONLINE;
  if (action === 'stop') {
    nextStatus = ServerStatus.OFFLINE;
  } else if (action === 'start' || action === 'restart') {
    nextStatus = ServerStatus.ONLINE;
  }

  BedrockServerController.setServerStatus(server, nextStatus);

  AuditLogger.record({
    actorId: 'usr_admin_1',
    actorName: 'admin',
    action: `SERVER_${action.toUpperCase()}`,
    entityType: 'BedrockServer',
    entityId: server.id
  });

  if (webhookUrl) {
    const payload = NotificationDispatcher.formatServerStatusEmbed(server.name, server.status, server.host, server.port);
    await NotificationDispatcher.sendWebhook(webhookUrl, payload);
  }

  return res.status(200).json({ success: true, server, action });
}
