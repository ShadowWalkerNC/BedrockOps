import { describe, it, expect, beforeEach } from 'vitest';
import { db, ServerStatus, BackupStatus, ModerationType, PipelineStatus } from '@mc-admin/db';
import { BedrockServerController } from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';
import { AuditLogger } from '@mc-admin/audit';
import { DiscordBotService } from '@mc-admin/discord';

describe('Tier 1: Feature Coverage (R1-R5 Primary Behaviors)', () => {
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

  describe('R1: Bedrock Server Lifecycle & Administration', () => {
    it('updates server state through lifecycle transitions', () => {
      const server = db.servers[0];
      expect(server.status).toBe(ServerStatus.ONLINE);

      BedrockServerController.setServerStatus(server, ServerStatus.STOPPING);
      expect(server.status).toBe(ServerStatus.STOPPING);

      BedrockServerController.setServerStatus(server, ServerStatus.OFFLINE);
      expect(server.status).toBe(ServerStatus.OFFLINE);

      BedrockServerController.setServerStatus(server, ServerStatus.STARTING);
      expect(server.status).toBe(ServerStatus.STARTING);

      BedrockServerController.setServerStatus(server, ServerStatus.ONLINE);
      expect(server.status).toBe(ServerStatus.ONLINE);
    });

    it('parses raw server.properties string into typed properties object', () => {
      const rawProperties = `
# Minecraft Bedrock Server Properties
server-name=Test Realm
gamemode=survival
difficulty=hard
allow-cheats=false
max-players=12
online-mode=true
enable-rcon=true
rcon.password=secret123
rcon.port=19133
`;
      const parsed = BedrockServerController.parseProperties(rawProperties);
      expect(parsed['server-name']).toBe('Test Realm');
      expect(parsed['gamemode']).toBe('survival');
      expect(parsed['difficulty']).toBe('hard');
      expect(parsed['allow-cheats']).toBe('false');
      expect(parsed['max-players']).toBe('12');
      expect(parsed['enable-rcon']).toBe('true');
      expect(parsed['rcon.password']).toBe('secret123');
      expect(parsed['rcon.port']).toBe('19133');
    });

    it('serializes typed property object into key-value formatted string', () => {
      const props = {
        'server-name': 'Serialized Realm',
        'gamemode': 'creative',
        'difficulty': 'easy'
      };
      const serialized = BedrockServerController.serializeProperties(props);
      expect(serialized).toContain('server-name=Serialized Realm');
      expect(serialized).toContain('gamemode=creative');
      expect(serialized).toContain('difficulty=easy');
    });

    it('executes RCON via real protocol and returns honest error when unreachable', async () => {
      const server = db.servers[0];
      const response = await BedrockServerController.executeRconCommand(server, 'list');
      expect(response).toContain('[RCON ERROR]');
      expect(response).toContain('list');
      expect(response).toContain(server.name);
    });

    it('emits audit log events for server lifecycle actions', () => {
      const server = db.servers[0];
      const auditEntry = AuditLogger.record({
        actorId: 'usr_admin_1',
        actorName: 'admin',
        action: 'SERVER_START',
        entityType: 'BedrockServer',
        entityId: server.id,
        metadata: { reason: 'Maintenance complete' }
      });

      expect(auditEntry.id).toBeDefined();
      expect(auditEntry.action).toBe('SERVER_START');
      expect(db.auditLogs.length).toBe(1);
    });
  });

  describe('R2: Backup Safety & Retention Engine', () => {
    it('creates manual and automated backup snapshot records', () => {
      const serverId = 'srv_bedrock_1';
      const manualBackup = BackupEngine.triggerBackup({
        serverId,
        isManual: true,
        notes: 'Pre-update manual backup'
      });

      expect(manualBackup.id).toBeDefined();
      expect(manualBackup.serverId).toBe(serverId);
      expect(manualBackup.isManual).toBe(true);
      expect(manualBackup.status).toBe(BackupStatus.PENDING);
      expect(manualBackup.filename).toMatch(/^backup_srv_bedrock_1_.*\.tar\.gz$/);
      expect(manualBackup.storagePath).toContain(serverId);

      const autoBackup = BackupEngine.triggerBackup({
        serverId,
        isManual: false,
        notes: 'Nightly automated snapshot'
      });
      expect(autoBackup.isManual).toBe(false);
      expect(db.backups.length).toBe(2);
    });

    it('retrieves backup snapshots for specific server', () => {
      const serverId = 'srv_bedrock_1';
      BackupEngine.triggerBackup({ serverId, isManual: true });
      BackupEngine.triggerBackup({ serverId: 'srv_other', isManual: false });

      const serverBackups = BackupEngine.getBackupsForServer(serverId);
      expect(serverBackups.length).toBe(1);
      expect(serverBackups[0].serverId).toBe(serverId);
    });

    it('validates and executes backup snapshot restore', async () => {
      const serverId = 'srv_bedrock_1';
      const backup = BackupEngine.triggerBackup({ serverId, isManual: true });
      BackupEngine.completeBackup(backup.id, 1024);

      const restoreResult = await BackupEngine.executeRestore(
        backup.id,
        async () => ({
          success: true,
          filesExtracted: 1,
          output: `Successfully restored server from ${backup.filename}`
        }),
        undefined,
        { downloadUrlOverride: 'http://127.0.0.1:9/archive.tar.gz' }
      );
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.message).toContain('Successfully restored server');
      expect(restoreResult.message).toContain(backup.filename);
    });

    it('enforces retention policies by pruning older backup snapshots', () => {
      const serverId = 'srv_bedrock_1';
      for (let i = 0; i < 8; i++) {
        BackupEngine.triggerBackup({ serverId, isManual: false });
      }

      expect(BackupEngine.getBackupsForServer(serverId).length).toBe(8);
      const prunedCount = BackupEngine.applyRetentionPolicy(serverId, 5);
      expect(prunedCount).toBe(3);
      expect(BackupEngine.getBackupsForServer(serverId).length).toBe(5);
    });
  });

  describe('R3: Moderation & Player Operations', () => {
    it('creates moderation action records for WARN, MUTE, KICK, BAN, and NOTE', () => {
      const actions = [
        ModerationType.WARN,
        ModerationType.MUTE,
        ModerationType.KICK,
        ModerationType.BAN,
        ModerationType.NOTE
      ];

      actions.forEach((actionType) => {
        const record = ModerationService.createAction({
          gamertag: 'SteveCraft',
          playerXuid: 'xuid_123456789',
          actionType,
          reason: `Testing ${actionType} action`,
          issuerId: 'usr_mod_1',
          issuerName: 'ModSteve',
          durationMinutes: actionType === ModerationType.MUTE ? 60 : undefined
        });

        expect(record.id).toBeDefined();
        expect(record.actionType).toBe(actionType);
        expect(record.active).toBe(true);
      });

      expect(db.moderationActions.length).toBe(5);
    });

    it('retrieves player moderation history by gamertag case-insensitively', () => {
      ModerationService.createAction({
        gamertag: 'AlexTheGreat',
        actionType: ModerationType.WARN,
        reason: 'Spamming chat',
        issuerId: 'usr_mod_1',
        issuerName: 'Mod1'
      });

      const historyLower = ModerationService.getHistoryForPlayer('alexthegreat');
      const historyUpper = ModerationService.getHistoryForPlayer('ALEXTHEGREAT');

      expect(historyLower.length).toBe(1);
      expect(historyUpper.length).toBe(1);
      expect(historyLower[0].gamertag).toBe('AlexTheGreat');
    });

    it('searches players by substring query matching gamertags', () => {
      ModerationService.createAction({
        gamertag: 'DragonSlayer99',
        actionType: ModerationType.WARN,
        reason: 'Swearing',
        issuerId: 'usr_mod_1',
        issuerName: 'Mod1'
      });
      ModerationService.createAction({
        gamertag: 'DragonMaster',
        actionType: ModerationType.NOTE,
        reason: 'Suspected alt account',
        issuerId: 'usr_mod_1',
        issuerName: 'Mod1'
      });
      ModerationService.createAction({
        gamertag: 'BuildMaster',
        actionType: ModerationType.NOTE,
        reason: 'Good builder',
        issuerId: 'usr_mod_1',
        issuerName: 'Mod1'
      });

      const searchResults = ModerationService.searchPlayers('dragon');
      expect(searchResults.length).toBe(2);
      expect(searchResults).toContain('DragonSlayer99');
      expect(searchResults).toContain('DragonMaster');
    });
  });

  describe('R4: Notifications & Discord Operations', () => {
    it('formats server status Discord embed with color coding', () => {
      const onlinePayload = NotificationDispatcher.formatServerStatusEmbed(
        'Main Realm',
        'ONLINE',
        '127.0.0.1',
        19132
      );
      expect(onlinePayload.username).toBe('Minecraft Ops Bot');
      expect(onlinePayload.embeds?.[0].color).toBe(0x22c55e); // Green
      expect(onlinePayload.embeds?.[0].title).toContain('Main Realm');

      const offlinePayload = NotificationDispatcher.formatServerStatusEmbed(
        'Main Realm',
        'OFFLINE',
        '127.0.0.1',
        19132
      );
      expect(offlinePayload.embeds?.[0].color).toBe(0xef4444); // Red
    });

    it('formats backup notification Discord embed for success and failure', () => {
      const successPayload = NotificationDispatcher.formatBackupEmbed(
        'Survival Server',
        'backup_123.zip',
        true,
        10485760 // 10 MB
      );
      expect(successPayload.embeds?.[0].color).toBe(0x3b82f6); // Blue
      expect(successPayload.embeds?.[0].fields?.[1].value).toBe('10.00 MB');

      const failurePayload = NotificationDispatcher.formatBackupEmbed(
        'Survival Server',
        'backup_123.zip',
        false
      );
      expect(failurePayload.embeds?.[0].color).toBe(0xef4444); // Red
    });

    it('dispatches Discord webhooks and stores payload in queue', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/123/abc';
      const payload = NotificationDispatcher.formatServerStatusEmbed(
        'Main Server',
        'ONLINE',
        'localhost',
        19132
      );

      const dispatched = await NotificationDispatcher.sendWebhook(webhookUrl, payload);
      expect(dispatched).toBe(true);
      expect(NotificationDispatcher.sentMessages.length).toBe(1);
      expect(NotificationDispatcher.sentMessages[0].webhookUrl).toBe(webhookUrl);
      expect(NotificationDispatcher.sentMessages[0].payload).toEqual(payload);
    });

    it('dispatches bot alerts via DiscordBotService', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/bot-alert';
      const result = await DiscordBotService.dispatchAlert(
        webhookUrl,
        'Emergency Alert',
        'Server node experiencing high disk usage'
      );

      expect(result).toBe(true);
      expect(NotificationDispatcher.sentMessages.length).toBe(1);
      expect(NotificationDispatcher.sentMessages[0].payload.username).toBe('Minecraft Ops Alert');
    });
  });

  describe('R5: Server Templates & Automation Pipelines', () => {
    it('creates server templates and applies them to Bedrock servers', () => {
      const template = TemplateEngine.createTemplate({
        name: 'Skyblock Preset',
        description: 'Hardcore skyblock server configuration',
        bdsVersion: '1.20.81',
        defaultProperties: {
          'gamemode': 'survival',
          'difficulty': 'hard',
          'max-players': '20'
        },
        addonPacks: ['skyblock-core-v1.mcpack']
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Skyblock Preset');
      expect(db.templates.some((t) => t.id === template.id)).toBe(true);

      const server = db.servers[0];
      const updatedServer = TemplateEngine.applyTemplateToServer(template.id, server);

      expect(updatedServer.version).toBe('1.20.81');
      expect(updatedServer.gameMode).toBe('survival');
      expect(updatedServer.difficulty).toBe('hard');
      expect(updatedServer.maxPlayers).toBe(20);
    });

    it('executes multi-step server setup pipeline end-to-end', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Factions Realm',
        templateId: 'tmpl_vanilla_survival',
        webhookUrl: 'https://discord.com/api/webhooks/factions-setup',
        actorName: 'LeadAdmin'
      });

      expect(result.server).toBeDefined();
      expect(result.server.name).toBe('Factions Realm');
      expect(result.server.status).toBe(ServerStatus.ONLINE);

      expect(result.run).toBeDefined();
      expect(result.run.status).toBe(PipelineStatus.SUCCESS);
      expect(result.run.logs.length).toBeGreaterThanOrEqual(5);

      // Verify side effects
      expect(db.servers.some((s) => s.id === result.server.id)).toBe(true);
      expect(db.backups.some((b) => b.serverId === result.server.id)).toBe(true);
      expect(db.auditLogs.some((a) => a.action === 'PIPELINE_SERVER_SETUP')).toBe(true);
      expect(NotificationDispatcher.sentMessages.length).toBe(1);
    });
  });
});
