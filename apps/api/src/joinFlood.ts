import { AuditLogger } from '@mc-admin/audit';
import { detectJoinFlood, JoinFloodMonitor } from '@mc-admin/analytics';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { db } from '@mc-admin/db';
import { dispatchAlert } from './alerts';

function createMonitor(): JoinFloodMonitor {
  /** Default: 20 joins in 60s triggers a flood alert (override via env for tests). */
  const windowMs = Number(process.env.JOIN_FLOOD_WINDOW_MS || 60_000);
  const threshold = Number(process.env.JOIN_FLOOD_THRESHOLD || 20);
  return new JoinFloodMonitor({ windowMs, threshold });
}

let monitor = createMonitor();

/** Reset monitor (and re-read env thresholds) — used by tests. */
export function resetJoinFloodMonitor(): void {
  monitor = createMonitor();
}

/**
 * Record a join against the flood monitor. When a flood (or bot pattern) is
 * detected, emit an audit log + Discord alert (best-effort / honest stub).
 */
export async function notePlayerJoin(input: {
  xuid: string;
  gamertag: string;
  serverId?: string;
}): Promise<ReturnType<typeof detectJoinFlood>> {
  const result = monitor.record(input.xuid);

  if (!result.flood) {
    return result;
  }

  const windowMs = Number(process.env.JOIN_FLOOD_WINDOW_MS || 60_000);
  const serverName = input.serverId
    ? db.servers.find((s) => s.id === input.serverId)?.name
    : undefined;

  AuditLogger.record({
    actorId: 'system_security',
    actorName: 'join-flood-monitor',
    action: 'JOIN_FLOOD_DETECTED',
    entityType: 'BedrockServer',
    entityId: input.serverId || 'unknown',
    metadata: {
      gamertag: input.gamertag,
      xuid: input.xuid,
      count: result.count,
      uniqueXuids: result.uniqueXuids,
      suspiciousBotPattern: result.suspiciousBotPattern
    }
  });

  await dispatchAlert(
    NotificationDispatcher.formatJoinFloodEmbed({
      serverName,
      count: result.count,
      uniqueXuids: result.uniqueXuids,
      suspiciousBotPattern: result.suspiciousBotPattern,
      windowMs,
      sampleGamertag: input.gamertag
    })
  );

  return result;
}
