import { db, ServerStatus } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { dispatchAlert } from './alerts';

const CRASH_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CrashRecordResult {
  ok: boolean;
  crashCount24h?: number;
  reason?: string;
}

/**
 * Record a server crash from the REST crash endpoint or an agent CRASH frame.
 * Updates status/counters, writes an audit event, and best-effort Discord alerts.
 */
export async function recordServerCrash(
  serverId: string,
  reason: string | undefined,
  actor: { actorId: string; actorName: string } = {
    actorId: 'system_agent',
    actorName: 'agent'
  }
): Promise<CrashRecordResult> {
  const server = db.servers.find((s) => s.id === serverId && !s.deletedAt);
  if (!server) {
    return { ok: false };
  }

  const now = new Date();
  if (server.lastCrashAt && now.getTime() - new Date(server.lastCrashAt).getTime() > CRASH_WINDOW_MS) {
    server.crashCount24h = 0;
  }
  server.crashCount24h = (server.crashCount24h ?? 0) + 1;
  server.lastCrashAt = now;
  server.status = ServerStatus.ERROR;
  server.updatedAt = now;

  AuditLogger.record({
    actorId: actor.actorId,
    actorName: actor.actorName,
    action: 'SERVER_CRASH_DETECTED',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: { reason, crashCount24h: server.crashCount24h }
  });

  await dispatchAlert(
    NotificationDispatcher.formatCrashEmbed(server.name, reason, server.crashCount24h)
  );

  return { ok: true, crashCount24h: server.crashCount24h, reason };
}
