import { db, ModerationAction, ModerationType } from '@mc-admin/db';
import {
  AllowlistEntry,
  AllowlistManager,
  AllowlistSyncResult,
  GDPR_REDACTED,
  PlayerLogParser,
  PlayerTracker,
  XboxIdentityService,
  playerTracker
} from './players';

export * from './players';

export interface CreateModerationInput {
  gamertag: string;
  playerXuid?: string;
  actionType: ModerationType;
  reason: string;
  issuerId: string;
  issuerName: string;
  durationMinutes?: number;
  serverId?: string;
}

export interface AnonymizeResult {
  updated: number;
  gamertag: string;
  redactedAs: string;
}

/**
 * R4.2 — Persistent infraction ledger with GDPR soft-delete / anonymization.
 */
export class ModerationService {
  public static createAction(input: CreateModerationInput): ModerationAction {
    const actionRecord: ModerationAction = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      serverId: input.serverId,
      gamertag: input.gamertag,
      playerXuid: input.playerXuid,
      actionType: input.actionType,
      reason: input.reason,
      issuerId: input.issuerId,
      issuerName: input.issuerName,
      durationMinutes: input.durationMinutes,
      active: true,
      createdAt: new Date()
    };

    db.moderationActions.push(actionRecord);
    return actionRecord;
  }

  public static getHistoryForPlayer(gamertag: string): ModerationAction[] {
    const lowerGamertag = gamertag.toLowerCase();
    return db.moderationActions.filter(
      (m) => m.gamertag.toLowerCase() === lowerGamertag && !m.deletedAt
    );
  }

  public static getHistoryForXuid(xuid: string): ModerationAction[] {
    return db.moderationActions.filter(
      (m) => m.playerXuid === xuid && !m.deletedAt
    );
  }

  public static searchPlayers(query: string): string[] {
    const q = query.toLowerCase();
    const matches = new Set<string>();
    for (const record of db.moderationActions) {
      if (record.deletedAt) continue;
      if (record.gamertag.toLowerCase().includes(q)) {
        matches.add(record.gamertag);
      }
    }
    return Array.from(matches);
  }

  /** Mark a single action inactive without destroying audit history. */
  public static deactivateAction(actionId: string): ModerationAction | undefined {
    const record = db.moderationActions.find((m) => m.id === actionId);
    if (!record) return undefined;
    record.active = false;
    return record;
  }

  /** Soft-delete a single action (hidden from default listings). */
  public static softDeleteAction(actionId: string): ModerationAction | undefined {
    const record = db.moderationActions.find((m) => m.id === actionId);
    if (!record) return undefined;
    record.active = false;
    record.deletedAt = new Date();
    return record;
  }

  /**
   * GDPR anonymization: redact gamertag/XUID across matching ledger rows
   * and soft-delete them so they no longer appear in player search.
   */
  public static anonymizePlayer(gamertagOrXuid: string): AnonymizeResult {
    const q = gamertagOrXuid.toLowerCase();
    let updated = 0;

    for (const record of db.moderationActions) {
      const matchesGamertag = record.gamertag.toLowerCase() === q;
      const matchesXuid = record.playerXuid === gamertagOrXuid;
      if (!matchesGamertag && !matchesXuid) continue;

      record.active = false;
      record.deletedAt = record.deletedAt ?? new Date();
      record.gamertag = GDPR_REDACTED;
      record.reason = GDPR_REDACTED;
      delete record.playerXuid;
      updated += 1;
    }

    playerTracker.removeByGamertagOrXuid(gamertagOrXuid);

    return { updated, gamertag: gamertagOrXuid, redactedAs: GDPR_REDACTED };
  }

  public static listActive(serverId?: string): ModerationAction[] {
    return db.moderationActions.filter((m) => {
      if (m.deletedAt || !m.active) return false;
      if (serverId && m.serverId !== serverId) return false;
      return true;
    });
  }
}

/**
 * Orchestrates allowlist sanitize → atomic write plan for agent execution.
 */
export class AllowlistService {
  public static prepareSync(
    serverId: string,
    serverPath: string,
    entries: AllowlistEntry[]
  ): AllowlistSyncResult {
    return AllowlistManager.buildAtomicWritePlan(serverId, serverPath, entries);
  }

  public static fromPlayerTracker(
    tracker: PlayerTracker,
    serverId?: string
  ): AllowlistEntry[] {
    return tracker.list(serverId).map((p) => ({
      name: p.gamertag,
      xuid: p.xuid,
      ignoresPlayerLimit: false
    }));
  }
}

export { PlayerLogParser, PlayerTracker, XboxIdentityService, AllowlistManager, playerTracker };
export type {
  AllowlistEntry,
  AllowlistSyncResult,
  FriendInviteRecord,
  FriendInviteStatus,
  GamertagResolution,
  PlayerIdentity,
  ParsedJoinEvent,
  ParsedDisconnectEvent
} from './players';
