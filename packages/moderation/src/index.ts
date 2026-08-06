import { db, ModerationAction, ModerationType } from '@mc-admin/db';

export interface CreateModerationInput {
  gamertag: string;
  playerXuid?: string;
  actionType: ModerationType;
  reason: string;
  issuerId: string;
  issuerName: string;
  durationMinutes?: number;
}

export class ModerationService {
  public static createAction(input: CreateModerationInput): ModerationAction {
    const actionRecord: ModerationAction = {
      id: `mod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      (m) => m.gamertag.toLowerCase() === lowerGamertag
    );
  }

  public static searchPlayers(query: string): string[] {
    const q = query.toLowerCase();
    const matches = new Set<string>();
    for (const record of db.moderationActions) {
      if (record.gamertag.toLowerCase().includes(q)) {
        matches.add(record.gamertag);
      }
    }
    return Array.from(matches);
  }
}
