import { db as defaultDb, MemoryDatabase } from '@mc-admin/db';

/**
 * R (Wave C) — Operational analytics rollups computed from the in-memory store.
 * Read-only and side-effect free so it is safe to call on any request.
 */
export interface OperationalOverview {
  servers: { total: number; online: number; offline: number; byStatus: Record<string, number> };
  agents: { total: number; online: number };
  backups: { total: number; completed: number; failed: number; pending: number; successRatePct: number };
  moderation: { activeTotal: number; byType: Record<string, number> };
  audit: { total: number; topActions: { action: string; count: number }[] };
  generatedAt: string;
}

export class OperationalMetrics {
  public static overview(database: MemoryDatabase = defaultDb): OperationalOverview {
    const activeServers = database.servers.filter((s) => !s.deletedAt);
    const serversByStatus: Record<string, number> = {};
    for (const s of activeServers) {
      serversByStatus[s.status] = (serversByStatus[s.status] || 0) + 1;
    }

    const completed = database.backups.filter((b) => b.status === 'COMPLETED').length;
    const failed = database.backups.filter((b) => b.status === 'FAILED').length;
    const pending = database.backups.filter((b) => b.status === 'PENDING' || b.status === 'RUNNING').length;
    const finished = completed + failed;
    const successRatePct = finished === 0 ? 100 : Math.round((completed / finished) * 100);

    const activeModeration = database.moderationActions.filter((m) => !m.deletedAt && m.active);
    const moderationByType: Record<string, number> = {};
    for (const m of activeModeration) {
      moderationByType[m.actionType] = (moderationByType[m.actionType] || 0) + 1;
    }

    const actionCounts: Record<string, number> = {};
    for (const a of database.auditLogs) {
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    }
    const topActions = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      servers: {
        total: activeServers.length,
        online: serversByStatus['ONLINE'] || 0,
        offline: serversByStatus['OFFLINE'] || 0,
        byStatus: serversByStatus
      },
      agents: {
        total: database.agentNodes.length,
        online: database.agentNodes.filter((n) => n.status === 'ONLINE').length
      },
      backups: { total: database.backups.length, completed, failed, pending, successRatePct },
      moderation: { activeTotal: activeModeration.length, byType: moderationByType },
      audit: { total: database.auditLogs.length, topActions },
      generatedAt: new Date().toISOString()
    };
  }
}

/**
 * Wave C security — sliding-window rate limiter for destructive actions.
 * In-memory and per-key (typically `${userId}:${action}`).
 */
export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  public check(key: string, now: number = Date.now()): RateDecision {
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) || []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      const oldest = recent[0];
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + this.windowMs - now) };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterMs: 0 };
  }

  public reset(key?: string): void {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }
}

/**
 * Wave C security — join-flood / bot-pattern detection over a window.
 * A high join count from few unique XUIDs is a strong bot signal.
 */
export interface JoinEvent {
  xuid: string;
  at: number;
}

export interface JoinFloodResult {
  flood: boolean;
  suspiciousBotPattern: boolean;
  count: number;
  uniqueXuids: number;
}

export function detectJoinFlood(
  events: JoinEvent[],
  opts: { windowMs: number; threshold: number; now?: number }
): JoinFloodResult {
  const now = opts.now ?? Date.now();
  const windowStart = now - opts.windowMs;
  const inWindow = events.filter((e) => e.at > windowStart && e.at <= now);
  const uniqueXuids = new Set(inWindow.map((e) => e.xuid)).size;
  const flood = inWindow.length >= opts.threshold;
  // Many joins but very few identities → likely a reconnect/bot storm.
  const suspiciousBotPattern = flood && uniqueXuids > 0 && inWindow.length / uniqueXuids >= 3;
  return { flood, suspiciousBotPattern, count: inWindow.length, uniqueXuids };
}
