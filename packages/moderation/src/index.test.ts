import { describe, it, expect, beforeEach } from 'vitest';
import { db, ModerationType } from '@mc-admin/db';
import {
  ModerationService,
  PlayerLogParser,
  PlayerTracker,
  XboxIdentityService,
  AllowlistManager,
  AllowlistService,
  GDPR_REDACTED
} from './index';

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

  it('soft-deletes and anonymizes player infractions for GDPR', () => {
    ModerationService.createAction({
      gamertag: 'GdprPlayer',
      playerXuid: '2535400000000001',
      actionType: ModerationType.BAN,
      reason: 'Cheating',
      issuerId: 'u1',
      issuerName: 'm1'
    });
    ModerationService.createAction({
      gamertag: 'GdprPlayer',
      playerXuid: '2535400000000001',
      actionType: ModerationType.WARN,
      reason: 'Toxicity',
      issuerId: 'u1',
      issuerName: 'm1'
    });

    const result = ModerationService.anonymizePlayer('GdprPlayer');
    expect(result.updated).toBe(2);
    expect(result.redactedAs).toBe(GDPR_REDACTED);

    expect(ModerationService.getHistoryForPlayer('GdprPlayer').length).toBe(0);
    expect(ModerationService.searchPlayers('Gdpr')).not.toContain('GdprPlayer');

    const redacted = db.moderationActions.filter((m) => m.gamertag === GDPR_REDACTED);
    expect(redacted.length).toBe(2);
    expect(redacted.every((m) => m.active === false && !!m.deletedAt)).toBe(true);
    expect(redacted.every((m) => m.playerXuid === undefined)).toBe(true);
  });

  it('deactivates a single action without full anonymization', () => {
    const record = ModerationService.createAction({
      gamertag: 'TempMute',
      actionType: ModerationType.MUTE,
      reason: 'Mic spam',
      issuerId: 'u1',
      issuerName: 'm1',
      durationMinutes: 30
    });

    ModerationService.deactivateAction(record.id);
    expect(record.active).toBe(false);
    expect(record.deletedAt).toBeUndefined();
    expect(ModerationService.listActive().find((a) => a.id === record.id)).toBeUndefined();
  });
});

describe('PlayerLogParser & PlayerTracker', () => {
  it('parses join and disconnect lines', () => {
    const join = PlayerLogParser.parseJoinLog(
      '[2026-08-06 04:55:00:123 INFO] Player connected: SteveCraft, xuid: 2535412345678901'
    );
    expect(join).toEqual({ gamertag: 'SteveCraft', xuid: '2535412345678901' });

    const leave = PlayerLogParser.parseDisconnectLog(
      '[2026-08-06 04:55:00:123 INFO] Player disconnected: AlexTheGreat, xuid: 2535498765432109'
    );
    expect(leave).toEqual({ gamertag: 'AlexTheGreat', xuid: '2535498765432109' });
  });

  it('tracks join counts by XUID', () => {
    const tracker = new PlayerTracker();
    tracker.recordJoin({ gamertag: 'Steve', xuid: '1', serverId: 'srv_1' });
    tracker.recordJoin({ gamertag: 'Steve', xuid: '1', serverId: 'srv_1' });
    const player = tracker.findByXuid('1');
    expect(player?.joinCount).toBe(2);
    expect(tracker.list('srv_1').length).toBe(1);
  });
});

describe('XboxIdentityService', () => {
  it('resolves deterministic stub XUIDs without API key', async () => {
    const xbox = new XboxIdentityService();
    const res = await xbox.resolveGamertag('SteveCraft');
    expect(res.success).toBe(true);
    expect(res.stub).toBe(true);
    expect(res.xuid).toMatch(/^25354\d{11}$/);

    const reverse = await xbox.resolveXuid(res.xuid);
    expect(reverse.gamertag).toBe('SteveCraft');
  });

  it('honors custom mappings', async () => {
    const xbox = new XboxIdentityService();
    xbox.registerMapping('CustomGamer', '2535499999999999');
    const res = await xbox.resolveGamertag('CustomGamer');
    expect(res.xuid).toBe('2535499999999999');
  });

  it('dispatches and accepts friend bot invites', async () => {
    const xbox = new XboxIdentityService(undefined, 'BedrockOps Onboarding Bot');
    const invite = await xbox.dispatchFriendInvite('SwitchGamer99');
    expect(invite.status).toBe('PENDING');
    expect(invite.botGamertag).toBe('BedrockOps Onboarding Bot');
    expect(invite.stub).toBe(true);

    const accepted = xbox.acceptFriendInvite(invite.id);
    expect(accepted?.status).toBe('ACCEPTED');
    expect(xbox.getInviteHistory({ status: 'ACCEPTED' }).length).toBe(1);
  });
});

describe('AllowlistManager', () => {
  it('sanitizes, serializes, and builds an atomic write plan', () => {
    const plan = AllowlistService.prepareSync('srv_1', '/var/minecraft/srv', [
      { name: ' AlexCraft ', xuid: '25354111' },
      { name: 'SteveCraft', xuid: '25354222', ignoresPlayerLimit: true }
    ]);

    expect(plan.success).toBe(true);
    expect(plan.entriesCount).toBe(2);
    expect(plan.targetPath).toBe('/var/minecraft/srv/allowlist.json');
    expect(plan.tempPath).toContain('.tmp');
    expect(plan.reloadCommand).toBe('allowlist reload');

    const parsed = AllowlistManager.parse(plan.contents);
    expect(parsed[0].ignoresPlayerLimit).toBe(false);
    expect(parsed[1].ignoresPlayerLimit).toBe(true);
    expect(AllowlistManager.hasEntry(parsed, 'alexcraft')).toBe(true);
    expect(AllowlistManager.hasEntry(parsed, '25354222')).toBe(true);
  });
});
