import { describe, it, expect, beforeEach } from 'vitest';
import { db, ModerationType } from '@mc-admin/db';
import { ModerationService } from './index';

describe('ModerationService Package', () => {
  beforeEach(() => {
    db.moderationActions = [];
  });

  it('creates a moderation record for a player', () => {
    const record = ModerationService.createAction({
      gamertag: 'GriefMaster99',
      actionType: ModerationType.BAN,
      reason: 'Griefing spawn building',
      issuerId: 'usr_mod1',
      issuerName: 'StaffAdmin',
      durationMinutes: 1440
    });

    expect(record.id).toBeDefined();
    expect(record.gamertag).toBe('GriefMaster99');
    expect(record.actionType).toBe(ModerationType.BAN);
    expect(db.moderationActions.length).toBe(1);
  });

  it('retrieves moderation history for a player', () => {
    ModerationService.createAction({
      gamertag: 'PlayerOne',
      actionType: ModerationType.WARN,
      reason: 'Spamming chat',
      issuerId: 'usr_mod1',
      issuerName: 'StaffAdmin'
    });

    ModerationService.createAction({
      gamertag: 'PlayerOne',
      actionType: ModerationType.MUTE,
      reason: 'Repeated chat spamming',
      issuerId: 'usr_mod1',
      issuerName: 'StaffAdmin'
    });

    const history = ModerationService.getHistoryForPlayer('playerone');
    expect(history.length).toBe(2);
  });
});
