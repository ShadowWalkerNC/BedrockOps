import type { NextApiRequest, NextApiResponse } from 'next';
import { db, ModerationType } from '@mc-admin/db';
import { ModerationService } from '@mc-admin/moderation';
import { AuditLogger } from '@mc-admin/audit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { query } = req.query;
    if (query && typeof query === 'string') {
      const results = ModerationService.getHistoryForPlayer(query);
      return res.status(200).json({ history: results });
    }
    return res.status(200).json({ moderations: db.moderationActions });
  }

  if (req.method === 'POST') {
    const { gamertag, playerXuid, actionType, reason, durationMinutes } = req.body;

    if (!gamertag || !reason) {
      return res.status(400).json({ error: 'Gamertag and reason are required' });
    }

    const record = ModerationService.createAction({
      gamertag,
      playerXuid,
      actionType: actionType || ModerationType.WARN,
      reason,
      issuerId: 'usr_admin_1',
      issuerName: 'admin',
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined
    });

    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'admin',
      action: `PLAYER_${record.actionType}`,
      entityType: 'Player',
      entityId: gamertag,
      metadata: { reason, actionId: record.id }
    });

    return res.status(201).json({ success: true, record });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
