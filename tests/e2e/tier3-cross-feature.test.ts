import { describe, it, expect, beforeEach } from 'vitest';
import { db, ServerStatus, ModerationType } from '@mc-admin/db';
import { BedrockServerController } from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';
import { BackgroundJobWorker } from '@mc-admin/worker';
import { DiscordBotService } from '@mc-admin/discord';

describe('Tier 3: Cross-Feature Combinations (Multi-Domain Integration Flows)', () => {
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

  it('Flow 1: Server Setup Pipeline -> Lifecycle Controls -> Safety Backup -> Webhook Audit Chain', async () => {
    const webhookUrl = 'https://discord.com/api/webhooks/ops-cross-test';

    // Step 1: Create custom template
    const template = TemplateEngine.createTemplate({
      name: 'Ultra Hardcore Survival',
      description: 'UHC preset configuration',
      bdsVersion: '1.20.80',
      defaultProperties: {
        'gamemode': 'survival',
        'difficulty': 'hard',
        'allow-cheats': 'false',
        'max-players': '15'
      }
    });

    // Step 2: Run server setup pipeline
    const { server, run } = await PipelineEngine.runServerSetupPipeline({
      serverName: 'UHC Season 5 Realm',
      templateId: template.id,
      webhookUrl,
      actorName: 'HeadAdmin'
    });

    expect(server.name).toBe('UHC Season 5 Realm');
    expect(server.gameMode).toBe('survival');
    expect(server.maxPlayers).toBe(15);
    expect(run.status).toBe('SUCCESS');

    // Step 3: Stop server for maintenance
    BedrockServerController.setServerStatus(server, ServerStatus.OFFLINE);
    expect(server.status).toBe(ServerStatus.OFFLINE);

    // Step 4: Trigger pre-maintenance manual backup
    const manualBackup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: 'Pre-maintenance snapshot'
    });
    expect(manualBackup.isManual).toBe(true);

    // Step 5: Dispatch Discord alert for server status change
    const statusPayload = NotificationDispatcher.formatServerStatusEmbed(
      server.name,
      server.status,
      server.host,
      server.port
    );
    await NotificationDispatcher.sendWebhook(webhookUrl, statusPayload);

    // Step 6: Verify full notification queue contains setup alert + status alert
    expect(NotificationDispatcher.sentMessages.length).toBe(2);
    expect(NotificationDispatcher.sentMessages[0].payload.username).toBe('Minecraft Ops Bot');

    // Step 7: Verify DB audit trail records
    expect(db.auditLogs.some((a) => a.entityId === server.id)).toBe(true);
    expect(db.backups.filter((b) => b.serverId === server.id).length).toBe(2); // Initial pipeline backup + manual backup
  });

  it('Flow 2: Moderation Incident -> Safety Snapshot -> Search & Player History -> Bot Discord Alert', async () => {
    const webhookUrl = 'https://discord.com/api/webhooks/mod-alerts';
    const playerGamertag = 'ToxicPlayer99';

    // Step 1: Issue progressive moderation actions
    ModerationService.createAction({
      gamertag: playerGamertag,
      playerXuid: 'xuid_999888',
      actionType: ModerationType.WARN,
      reason: 'Profanity in main chat',
      issuerId: 'usr_mod_1',
      issuerName: 'ModAlex'
    });

    ModerationService.createAction({
      gamertag: playerGamertag,
      playerXuid: 'xuid_999888',
      actionType: ModerationType.MUTE,
      reason: 'Continued harassment after warning',
      issuerId: 'usr_mod_1',
      issuerName: 'ModAlex',
      durationMinutes: 120
    });

    ModerationService.createAction({
      gamertag: playerGamertag,
      playerXuid: 'xuid_999888',
      actionType: ModerationType.BAN,
      reason: 'Major griefing and severe harassment',
      issuerId: 'usr_admin_1',
      issuerName: 'AdminSteve'
    });

    // Step 2: Trigger emergency backup snapshot before taking server action
    const server = db.servers[0];
    const safetySnapshot = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: `Emergency safety snapshot prior to banning ${playerGamertag}`
    });
    expect(safetySnapshot.id).toBeDefined();

    // Step 3: Search player & inspect history
    const searchResults = ModerationService.searchPlayers('ToxicPlayer');
    expect(searchResults).toContain(playerGamertag);

    const history = ModerationService.getHistoryForPlayer(playerGamertag);
    expect(history.length).toBe(3);
    expect(history[0].actionType).toBe(ModerationType.WARN);
    expect(history[2].actionType).toBe(ModerationType.BAN);

    // Step 4: Dispatch staff notification via Discord Bot Service
    await DiscordBotService.dispatchAlert(
      webhookUrl,
      'Staff Moderation Alert: Player Banned',
      `Player **${playerGamertag}** has been banned by AdminSteve. Emergency snapshot ${safetySnapshot.filename} created.`
    );

    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].payload.embeds?.[0].description).toContain(playerGamertag);
  });

  it('Flow 3: Worker Nightly Automated Backup Sweep -> Multi-Server Retention Pruning', async () => {
    // Clear and seed clean state
    db.servers = [];
    db.backups = [];
    db.seedDefaults();

    // Seed 2 servers
    const server1 = db.servers[0]; // srv_bedrock_1
    const server2 = {
      id: 'srv_bedrock_2',
      name: 'Creative Build Realm',
      version: '1.20.80',
      host: '127.0.0.1',
      port: 19134,
      serverPath: '/var/minecraft/creative',
      status: ServerStatus.ONLINE,
      maxPlayers: 20,
      gameMode: 'creative',
      difficulty: 'peaceful',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.servers.push(server2);

    // Pre-populate each server with 6 existing backup snapshots
    for (let i = 0; i < 6; i++) {
      BackupEngine.triggerBackup({ serverId: server1.id, isManual: false });
      BackupEngine.triggerBackup({ serverId: server2.id, isManual: false });
    }

    expect(BackupEngine.getBackupsForServer(server1.id).length).toBe(6);
    expect(BackupEngine.getBackupsForServer(server2.id).length).toBe(6);

    // Execute background worker sweep (creates 7th backup and applies retention count of 5)
    await BackgroundJobWorker.runScheduledBackupSweep();

    // Verify retention pruning enforced max 5 backups per server
    const server1Backups = BackupEngine.getBackupsForServer(server1.id);
    const server2Backups = BackupEngine.getBackupsForServer(server2.id);

    expect(server1Backups.length).toBe(5);
    expect(server2Backups.length).toBe(5);
    expect(db.backups.length).toBe(10);
  });
});
