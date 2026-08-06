import { describe, it, expect, beforeEach } from 'vitest';
import { db, BackupStatus, ModerationType, PipelineStatus } from '@mc-admin/db';
import { BedrockServerController } from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';

describe('Tier 2: Boundary & Corner Cases (R1-R5)', () => {
  beforeEach(() => {
    db.servers = [];
    db.backups = [];
    db.moderationActions = [];
    db.templates = [];
    db.pipelines = [];
    db.pipelineRuns = [];
    db.auditLogs = [];
    NotificationDispatcher.sentMessages = [];
    db.seedDefaults();
  });

  describe('R1 Lifecycle Boundary Cases', () => {
    it('handles empty server.properties input gracefully', () => {
      const parsed = BedrockServerController.parseProperties('');
      expect(Object.keys(parsed).length).toBe(0);
    });

    it('parses server.properties containing multiple equals signs in values', () => {
      const raw = `server-name=My = Ultimate = Realm\nmotd=Welcome=All`;
      const parsed = BedrockServerController.parseProperties(raw);
      expect(parsed['server-name']).toBe('My = Ultimate = Realm');
      expect(parsed['motd']).toBe('Welcome=All');
    });

    it('trims whitespace around property keys and values', () => {
      const raw = `  gamemode   =   survival   \n   difficulty   =   hard   `;
      const parsed = BedrockServerController.parseProperties(raw);
      expect(parsed['gamemode']).toBe('survival');
      expect(parsed['difficulty']).toBe('hard');
    });

    it('serializes empty property object to empty string', () => {
      const serialized = BedrockServerController.serializeProperties({});
      expect(serialized).toBe('');
    });
  });

  describe('R2 Backup Safety Boundary Cases', () => {
    it('returns failure when attempting to restore non-existent backup ID', () => {
      const result = BackupEngine.restoreBackup('bkp_non_existent');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('returns failure when restoring backup not in COMPLETED state', () => {
      const record = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
      record.status = BackupStatus.FAILED;

      const result = BackupEngine.restoreBackup(record.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not in COMPLETED state');
    });

    it('returns 0 pruned count when backup count is within retention limit', () => {
      const serverId = 'srv_1';
      BackupEngine.triggerBackup({ serverId, isManual: false });
      BackupEngine.triggerBackup({ serverId, isManual: false });

      const pruned = BackupEngine.applyRetentionPolicy(serverId, 5);
      expect(pruned).toBe(0);
      expect(BackupEngine.getBackupsForServer(serverId).length).toBe(2);
    });

    it('returns 0 pruned count when applying retention to server with no backups', () => {
      const pruned = BackupEngine.applyRetentionPolicy('srv_empty', 5);
      expect(pruned).toBe(0);
    });
  });

  describe('R3 Moderation Boundary Cases', () => {
    it('returns empty array when querying history for player with no records', () => {
      const history = ModerationService.getHistoryForPlayer('UnknownPlayer999');
      expect(history).toEqual([]);
    });

    it('returns all unique player gamertags when searching with empty query', () => {
      ModerationService.createAction({
        gamertag: 'PlayerOne',
        actionType: ModerationType.WARN,
        reason: 'Rule 1',
        issuerId: 'mod_1',
        issuerName: 'Mod'
      });
      ModerationService.createAction({
        gamertag: 'PlayerTwo',
        actionType: ModerationType.MUTE,
        reason: 'Rule 2',
        issuerId: 'mod_1',
        issuerName: 'Mod'
      });

      const allPlayers = ModerationService.searchPlayers('');
      expect(allPlayers.length).toBe(2);
      expect(allPlayers).toContain('PlayerOne');
      expect(allPlayers).toContain('PlayerTwo');
    });

    it('returns empty array when search query matches no players', () => {
      ModerationService.createAction({
        gamertag: 'PlayerOne',
        actionType: ModerationType.WARN,
        reason: 'Rule 1',
        issuerId: 'mod_1',
        issuerName: 'Mod'
      });

      const results = ModerationService.searchPlayers('NonExistentSubstring123');
      expect(results).toEqual([]);
    });

    it('handles moderation creation with optional fields omitted', () => {
      const action = ModerationService.createAction({
        gamertag: 'MinimalPlayer',
        actionType: ModerationType.NOTE,
        reason: 'Staff observation',
        issuerId: 'usr_mod_1',
        issuerName: 'ModSteve'
      });

      expect(action.playerXuid).toBeUndefined();
      expect(action.durationMinutes).toBeUndefined();
      expect(action.active).toBe(true);
    });
  });

  describe('R4 Discord Notifications Boundary Cases', () => {
    it('formats backup embed with N/A when fileSizeBytes is omitted', () => {
      const payload = NotificationDispatcher.formatBackupEmbed('Realm', 'backup.zip', true);
      expect(payload.embeds?.[0].fields?.[1].name).toBe('Size');
      expect(payload.embeds?.[0].fields?.[1].value).toBe('N/A');
    });

    it('formats server status embed cleanly for custom status string', () => {
      const payload = NotificationDispatcher.formatServerStatusEmbed('Realm', 'MAINTENANCE', '10.0.0.1', 19132);
      expect(payload.embeds?.[0].description).toContain('MAINTENANCE');
      expect(payload.embeds?.[0].color).toBe(0xef4444); // Non-online maps to red
    });
  });

  describe('R5 Templates & Pipelines Boundary Cases', () => {
    it('throws explicit error when applying non-existent template ID', () => {
      const server = db.servers[0];
      expect(() => {
        TemplateEngine.applyTemplateToServer('tmpl_missing_999', server);
      }).toThrow('Template ID tmpl_missing_999 not found');
    });

    it('defaults max-players to 10 when template property contains invalid non-numeric string', () => {
      const template = TemplateEngine.createTemplate({
        name: 'Invalid Max Players Template',
        description: 'Test template with bad max-players',
        bdsVersion: '1.20.80',
        defaultProperties: {
          'max-players': 'invalid_number'
        }
      });

      const server = db.servers[0];
      TemplateEngine.applyTemplateToServer(template.id, server);
      expect(server.maxPlayers).toBe(10);
    });

    it('catches template application error in pipeline and logs warning without failing run', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Pipeline Boundary Server',
        templateId: 'invalid_template_id',
        actorName: 'SystemAdmin'
      });

      expect(result.run.status).toBe(PipelineStatus.SUCCESS);
      expect(result.run.logs.some((l) => l.includes('Template apply skipped or failed'))).toBe(true);
    });
  });
});
