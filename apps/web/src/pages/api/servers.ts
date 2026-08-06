import type { NextApiRequest, NextApiResponse } from 'next';
import { db, BedrockServer, ServerStatus } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { TemplateEngine } from '@mc-admin/templates';
import { BackupEngine } from '@mc-admin/backups';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ servers: db.servers });
  }

  if (req.method === 'POST') {
    const { name, host, port, rconPort, maxPlayers, gameMode, difficulty, templateId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Server name is required' });
    }

    const server: BedrockServer = {
      id: `srv_${Date.now()}`,
      name,
      version: '1.20.80',
      host: host || '127.0.0.1',
      port: Number(port) || 19132,
      rconPort: Number(rconPort) || 19133,
      rconPassword: 'secret_rcon_pass',
      serverPath: `/var/minecraft/${name.toLowerCase().replace(/\s+/g, '-')}`,
      status: ServerStatus.ONLINE,
      maxPlayers: Number(maxPlayers) || 10,
      gameMode: gameMode || 'survival',
      difficulty: difficulty || 'hard',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (templateId) {
      try {
        TemplateEngine.applyTemplateToServer(templateId, server);
      } catch (e: any) {
        console.warn('Template apply warning:', e.message);
      }
    }

    db.servers.push(server);

    // Trigger initial safety backup
    BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: false,
      notes: 'Automated initial server registration snapshot'
    });

    // Log audit trail
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'admin',
      action: 'SERVER_REGISTER',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { name, host, port, templateId }
    });

    return res.status(201).json({ success: true, server });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
