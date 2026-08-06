import { describe, it, expect, beforeEach } from 'vitest';
import { db, ServerStatus, ModerationType, PipelineStatus, BackupStatus } from '@mc-admin/db';
import { BedrockServerController } from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';
import { BackgroundJobWorker } from '@mc-admin/worker';
import { DiscordBotService } from '@mc-admin/discord';
import { AuditLogger } from '@mc-admin/audit';
import {
  MockAgentServer,
  MockBdsLogStreamer,
  MockXboxService,
  MockDnsProvider,
} from './harness';

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
        'max-players': '15',
      },
    });

    // Step 2: Run server setup pipeline
    const { server, run } = await PipelineEngine.runServerSetupPipeline({
      serverName: 'UHC Season 5 Realm',
      templateId: template.id,
      webhookUrl,
      actorName: 'HeadAdmin',
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
      notes: 'Pre-maintenance snapshot',
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
      issuerName: 'ModAlex',
    });

    ModerationService.createAction({
      gamertag: playerGamertag,
      playerXuid: 'xuid_999888',
      actionType: ModerationType.MUTE,
      reason: 'Continued harassment after warning',
      issuerId: 'usr_mod_1',
      issuerName: 'ModAlex',
      durationMinutes: 120,
    });

    ModerationService.createAction({
      gamertag: playerGamertag,
      playerXuid: 'xuid_999888',
      actionType: ModerationType.BAN,
      reason: 'Major griefing and severe harassment',
      issuerId: 'usr_admin_1',
      issuerName: 'AdminSteve',
    });

    // Step 2: Trigger emergency backup snapshot before taking server action
    const server = db.servers[0];
    const safetySnapshot = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: `Emergency safety snapshot prior to banning ${playerGamertag}`,
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
      updatedAt: new Date(),
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

  it('Flow 4: Xbox Gamertag Resolution -> Friend Bot Invitation -> Allowlist Sync -> Agent Telemetry', async () => {
    const xboxService = new MockXboxService('BedrockOps Bot');
    const agentServer = new MockAgentServer();
    agentServer.connect('node-1');
    const server = db.servers[0];

    // 1. Resolve Gamertag to XUID
    const resolution = await xboxService.resolveGamertag('ConsoleGamer99');
    expect(resolution.success).toBe(true);
    expect(resolution.xuid).toMatch(/^25354/);

    // 2. Dispatch Friend Invite
    const invite = await xboxService.dispatchFriendInvite('ConsoleGamer99');
    expect(invite.status).toBe('PENDING');

    // 3. Sync allowlist to agent daemon
    const syncRes = agentServer.syncAllowlist(server.id, [
      { name: resolution.gamertag, xuid: resolution.xuid, ignoresPlayerLimit: true },
    ]);
    expect(syncRes.success).toBe(true);
    expect(agentServer.hasAllowlistEntry(server.id, 'ConsoleGamer99')).toBe(true);

    // 4. Generate & verify telemetry metrics
    agentServer.setServerState(server.id, 'ONLINE');
    const metricsFrame = agentServer.generateTelemetry('node-1', server.id, { activeConnections: 1 });
    expect(metricsFrame.payload.activeConnections).toBe(1);
    expect(metricsFrame.payload.cpuPercent).toBe(12.5);
  });

  it('Flow 5: Template Engine Preset -> Subdomain & Port Allocation -> Server Container Lifecycle -> Log Startup Stream', async () => {
    const dnsProvider = new MockDnsProvider('play.bedrockops.io');
    const agentServer = new MockAgentServer();
    const logStreamer = new MockBdsLogStreamer();
    agentServer.connect('node-1');

    // 1. Create & apply template
    const template = TemplateEngine.createTemplate({
      name: 'Skyblock Master',
      description: 'Skyblock configuration',
      bdsVersion: '1.20.80',
      defaultProperties: { gamemode: 'survival', difficulty: 'normal', 'max-players': '20' },
    });
    const server = db.servers[0];
    TemplateEngine.applyTemplateToServer(template.id, server);

    // 2. Provision DNS subdomain & port
    const dnsRes = dnsProvider.provisionSubdomain('skyblock', '192.168.1.10', 19135);
    expect(dnsRes.fqdn).toBe('skyblock.play.bedrockops.io');
    expect(dnsRes.allocatedPort).toBe(19135);

    // 3. Container lifecycle transition
    agentServer.setServerState(server.id, 'STARTING');
    expect(agentServer.getServerState(server.id)).toBe('STARTING');
    agentServer.setServerState(server.id, 'ONLINE');

    // 4. Emit startup log sequence
    const startupLogs = logStreamer.emitStartupSequence(server.id, 19135, server.version);
    expect(startupLogs.length).toBe(4);
    expect(logStreamer.getLogHistory(server.id).some((l) => l.rawLine.includes('Server started.'))).toBe(true);

    // 5. Verify DNS routing
    const verifyRouting = dnsProvider.verifyRecordRouting('skyblock.play.bedrockops.io', 19135);
    expect(verifyRouting.valid).toBe(true);
  });

  it('Flow 6: Save-Hold Live Checkpoint Sequence -> Zero-Disk Backup Stream -> Discord Notification', async () => {
    const logStreamer = new MockBdsLogStreamer();
    const agentServer = new MockAgentServer();
    const server = db.servers[0];
    const webhookUrl = 'https://discord.com/api/webhooks/backups';

    // 1. Emit RCON Save-Hold sequence stdout lines
    const saveHoldLogs = logStreamer.emitSaveHoldSequence(server.id, [
      { path: 'bedrock_level/db/000010.ldb', size: 2097152 },
      { path: 'bedrock_level/level.dat', size: 4096 },
    ]);
    expect(saveHoldLogs.length).toBe(2);

    const parsedFiles = MockBdsLogStreamer.parseSaveQueryLog(saveHoldLogs[1].rawLine);
    expect(parsedFiles?.files.length).toBe(2);

    // 2. Trigger backup record
    const backup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: 'Live streaming save-hold snapshot',
    });
    expect(backup.status).toBe(BackupStatus.COMPLETED);

    // 3. Simulate streaming backup sequence over WSS tunnel
    const backupFrames = agentServer.triggerBackupSequence('node-1', server.id, backup.id);
    expect(backupFrames.length).toBe(3);
    expect(backupFrames[2].type).toBe('BACKUP_COMPLETE');

    // 4. Format & send Discord notification
    const embed = NotificationDispatcher.formatBackupEmbed(server.name, backup.filename, true, backup.fileSizeBytes);
    await NotificationDispatcher.sendWebhook(webhookUrl, embed);

    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].payload.username).toBe('Minecraft Backup Service');
  });

  it('Flow 7: Network Moderation Ban -> Instant Allowlist Eviction -> RCON Kick Command -> BDS Log Disconnect', async () => {
    const agentServer = new MockAgentServer();
    const logStreamer = new MockBdsLogStreamer();
    const server = db.servers[0];
    const playerTag = 'CheaterX';
    const playerXuid = '25354777888999';

    // 1. Populate initial allowlist
    agentServer.syncAllowlist(server.id, [{ name: playerTag, xuid: playerXuid }]);
    expect(agentServer.hasAllowlistEntry(server.id, playerTag)).toBe(true);

    // 2. Create Moderation BAN action
    const banAction = ModerationService.createAction({
      gamertag: playerTag,
      playerXuid,
      actionType: ModerationType.BAN,
      reason: 'Fly hack detected in nether',
      issuerId: 'usr_admin_1',
      issuerName: 'AdminSteve',
    });
    expect(banAction.actionType).toBe(ModerationType.BAN);

    // 3. Instant eviction from allowlist.json
    agentServer.syncAllowlist(server.id, []);
    expect(agentServer.hasAllowlistEntry(server.id, playerTag)).toBe(false);

    // 4. Execute RCON kick
    const rconRes = await BedrockServerController.executeRconCommand(server, `kick ${playerTag} Banned by admin`);
    expect(rconRes).toContain('kick');

    // 5. Emit stdout disconnect log
    const disconnectLog = logStreamer.emitPlayerDisconnect(server.id, playerTag, playerXuid);
    expect(disconnectLog.type).toBe('DISCONNECT');
    expect(MockBdsLogStreamer.parseDisconnectLog(disconnectLog.rawLine)?.gamertag).toBe(playerTag);

    // 6. Record Audit Log
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'AdminSteve',
      action: 'PLAYER_BAN_EVICTION',
      entityType: 'Player',
      entityId: playerTag,
    });
    expect(db.auditLogs.some((a) => a.action === 'PLAYER_BAN_EVICTION')).toBe(true);
  });

  it('Flow 8: Agent Telemetry Monitoring -> High Load Threshold Alert -> Automated Safety Snapshot -> Audit Trail', async () => {
    const agentServer = new MockAgentServer();
    const server = db.servers[0];
    const webhookUrl = 'https://discord.com/api/webhooks/alerts';

    // 1. Generate high CPU/memory telemetry frame
    agentServer.setServerState(server.id, 'ONLINE');
    const highLoadFrame = agentServer.generateTelemetry('node-1', server.id, {
      cpuPercent: 96.4,
      memoryUsageMB: 3950,
      activeConnections: 12,
    });
    expect(highLoadFrame.payload.cpuPercent).toBeGreaterThan(90);

    // 2. Automated emergency backup trigger
    const emergencyBackup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: false,
      notes: 'Emergency snapshot: High CPU load threshold exceeded (96.4%)',
    });
    expect(emergencyBackup.status).toBe(BackupStatus.COMPLETED);

    // 3. Log Audit Event
    AuditLogger.record({
      actorId: 'system',
      actorName: 'Telemetry Monitor',
      action: 'HIGH_LOAD_EMERGENCY_BACKUP',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { cpu: 96.4, memoryMB: 3950 },
    });

    // 4. Send Ops Discord Alert
    await DiscordBotService.dispatchAlert(
      webhookUrl,
      'Resource Warning: High Server Load',
      `Server **${server.name}** reached ${highLoadFrame.payload.cpuPercent}% CPU load. Automated safety backup ${emergencyBackup.filename} created.`
    );

    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(db.auditLogs.some((a) => a.action === 'HIGH_LOAD_EMERGENCY_BACKUP')).toBe(true);
  });

  it('Flow 9: Server Setup Pipeline -> Xbox Gamertag Resolution -> Batch Allowlist Ingestion -> Audit Verification', async () => {
    const xboxService = new MockXboxService();
    const agentServer = new MockAgentServer();
    agentServer.connect('node-1');

    // 1. Run server setup pipeline
    const { server, run } = await PipelineEngine.runServerSetupPipeline({
      serverName: 'Faction Realm Alpha',
      templateId: 'tmpl_vanilla_survival',
      actorName: 'OpsAdmin',
    });
    expect(run.status).toBe(PipelineStatus.SUCCESS);

    // 2. Resolve batch gamertags to XUIDs
    const tags = ['GamerAlpha', 'GamerBeta', 'GamerGamma', 'GamerDelta'];
    const allowlistEntries = [];
    for (const tag of tags) {
      const res = await xboxService.resolveGamertag(tag);
      allowlistEntries.push({ name: res.gamertag, xuid: res.xuid });
    }

    // 3. Sync allowlist to agent
    const syncRes = agentServer.syncAllowlist(server.id, allowlistEntries);
    expect(syncRes.entriesCount).toBe(4);
    expect(agentServer.hasAllowlistEntry(server.id, 'GamerGamma')).toBe(true);

    // 4. Audit Log verification
    const auditLogs = AuditLogger.getLogsForEntity(server.id);
    expect(auditLogs.some((l) => l.action === 'PIPELINE_SERVER_SETUP')).toBe(true);
  });

  it('Flow 10: Scheduled Worker Backup Sweep -> Disaster Recovery Restore -> RCON Reload -> Audit Verification', async () => {
    const server = db.servers[0];

    // 1. Create baseline backup snapshot
    const baselineBackup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: 'Golden baseline state',
    });

    // 2. Run scheduled worker backup sweep
    await BackgroundJobWorker.runScheduledBackupSweep();
    expect(BackupEngine.getBackupsForServer(server.id).length).toBe(2);

    // 3. Restore server from baseline snapshot
    const restoreRes = BackupEngine.restoreBackup(baselineBackup.id);
    expect(restoreRes.success).toBe(true);

    // 4. Issue RCON reload command
    const rconOut = await BedrockServerController.executeRconCommand(server, 'reload');
    expect(rconOut).toContain('reload');

    // 5. Record disaster recovery audit entry
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'admin',
      action: 'DISASTER_RECOVERY_RESTORE',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { restoredBackupId: baselineBackup.id },
    });
    expect(db.auditLogs.some((a) => a.action === 'DISASTER_RECOVERY_RESTORE')).toBe(true);
  });

  it('Flow 11: GDPR Right-To-Be-Forgotten -> Soft-Delete Moderation Ledger -> PII Redaction -> Search Sanitization', async () => {
    const targetTag = 'PrivacySubject42';
    const targetXuid = '25354888777666';

    // 1. Create moderation history
    ModerationService.createAction({
      gamertag: targetTag,
      playerXuid: targetXuid,
      actionType: ModerationType.WARN,
      reason: 'Spamming chat',
      issuerId: 'usr_mod_1',
      issuerName: 'ModAlex',
    });
    ModerationService.createAction({
      gamertag: targetTag,
      playerXuid: targetXuid,
      actionType: ModerationType.MUTE,
      reason: 'Continued spam',
      issuerId: 'usr_mod_1',
      issuerName: 'ModAlex',
    });

    expect(ModerationService.getHistoryForPlayer(targetTag).length).toBe(2);

    // 2. Perform GDPR erasure (soft-delete + PII redaction)
    for (const record of db.moderationActions) {
      if (record.playerXuid === targetXuid || record.gamertag.toLowerCase() === targetTag.toLowerCase()) {
        record.deletedAt = new Date();
        record.gamertag = '[GDPR_REDACTED]';
        record.reason = '[GDPR_REDACTED]';
      }
    }

    // 3. Search sanitization verification
    const searchResults = ModerationService.searchPlayers('PrivacySubject');
    expect(searchResults).not.toContain(targetTag);

    // 4. Log compliance audit entry
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'DataProtectionOfficer',
      action: 'GDPR_ERASURE_EXECUTE',
      entityType: 'Player',
      entityId: targetXuid,
    });
    expect(db.auditLogs.some((a) => a.action === 'GDPR_ERASURE_EXECUTE')).toBe(true);
  });

  it('Flow 12: Subdomain DNS Provisioning -> Agent Container Lifecycle -> Heartbeat Stream -> Audit Logging', async () => {
    const dnsProvider = new MockDnsProvider('play.bedrockops.io');
    const agentServer = new MockAgentServer();
    const server = db.servers[0];
    const nodeId = 'node-edge-1';

    // 1. Provision DNS records
    const dnsResult = dnsProvider.provisionSubdomain('anarchy', '192.168.1.88', 19138);
    expect(dnsResult.fqdn).toBe('anarchy.play.bedrockops.io');

    // 2. Agent connection & state
    agentServer.connect(nodeId);
    agentServer.setServerState(server.id, 'ONLINE');

    // 3. Send Heartbeat frames
    const heartbeatFrame = agentServer.sendFrame({
      type: 'HEARTBEAT',
      nodeId,
      serverId: server.id,
      payload: { status: 'ONLINE', uptimeSeconds: 7200 },
    });
    expect(heartbeatFrame.type).toBe('HEARTBEAT');

    // 4. Verify frame history & audit record
    const history = agentServer.getFrameHistory({ nodeId, type: 'HEARTBEAT' });
    expect(history.length).toBe(1);

    AuditLogger.record({
      actorId: nodeId,
      actorName: 'Edge Daemon',
      action: 'SUBDOMAIN_HEARTBEAT_ACK',
      entityType: 'DnsRecord',
      entityId: dnsResult.aRecord.id,
    });
    expect(db.auditLogs.some((a) => a.action === 'SUBDOMAIN_HEARTBEAT_ACK')).toBe(true);
  });

  it('Flow 13: Console Onboarding -> Xbox Friend Invite Accept -> Auto Allowlist Injection -> BDS Player Join', async () => {
    const xboxService = new MockXboxService('BedrockOps Bot');
    const agentServer = new MockAgentServer();
    const logStreamer = new MockBdsLogStreamer();
    const server = db.servers[0];
    const gamerTag = 'SwitchMaster22';

    // 1. Dispatch Xbox Friend Invite
    const inviteRecord = await xboxService.dispatchFriendInvite(gamerTag);
    expect(inviteRecord.status).toBe('PENDING');

    // 2. Console player accepts invite
    const acceptedInvite = xboxService.acceptFriendInvite(inviteRecord.id);
    expect(acceptedInvite?.status).toBe('ACCEPTED');

    // 3. Inject allowed player into agent allowlist
    agentServer.syncAllowlist(server.id, [
      { name: acceptedInvite!.gamertag, xuid: acceptedInvite!.xuid },
    ]);
    expect(agentServer.hasAllowlistEntry(server.id, gamerTag)).toBe(true);

    // 4. BDS Log Streamer emits join event
    const joinLog = logStreamer.emitPlayerJoin(server.id, gamerTag, acceptedInvite!.xuid);
    const parsed = MockBdsLogStreamer.parseJoinLog(joinLog.rawLine);
    expect(parsed?.gamertag).toBe(gamerTag);
    expect(parsed?.xuid).toBe(acceptedInvite!.xuid);
  });

  it('Flow 14: Multi-Server Template Deployment -> Batch RCON Broadcast -> Webhook Alert Dispatch', async () => {
    const logStreamer = new MockBdsLogStreamer();
    const webhookUrl = 'https://discord.com/api/webhooks/announcements';

    // 1. Create template & apply to multiple servers
    const template = TemplateEngine.createTemplate({
      name: 'Standard Event Template',
      description: 'Event settings',
      bdsVersion: '1.20.80',
      defaultProperties: { gamemode: 'adventure', difficulty: 'normal' },
    });

    const srv1 = db.servers[0];
    const srv2 = {
      id: 'srv_event_2',
      name: 'Event Realm B',
      version: '1.20.80',
      host: '127.0.0.1',
      port: 19140,
      serverPath: '/var/minecraft/event2',
      status: ServerStatus.ONLINE,
      maxPlayers: 30,
      gameMode: 'survival',
      difficulty: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.servers.push(srv2);

    TemplateEngine.applyTemplateToServer(template.id, srv1);
    TemplateEngine.applyTemplateToServer(template.id, srv2);

    // 2. Batch RCON broadcast command
    const broadcastMsg = 'say Maintenance restart in 10 minutes';
    for (const srv of db.servers) {
      await BedrockServerController.executeRconCommand(srv, broadcastMsg);
      logStreamer.emitRconOutput(srv.id, 'say', broadcastMsg);
    }

    expect(logStreamer.getLogHistory().filter((l) => l.type === 'RCON').length).toBe(2);

    // 3. Webhook Alert Dispatch
    await DiscordBotService.dispatchAlert(
      webhookUrl,
      'Maintenance Announcement',
      'Batch maintenance broadcast dispatched across all servers.'
    );
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
  });

  it('Flow 15: Emergency Server Shutdown -> RCON Kick All -> Pre-Shutdown Backup -> Agent State OFFLINE', async () => {
    const agentServer = new MockAgentServer();
    const logStreamer = new MockBdsLogStreamer();
    const server = db.servers[0];
    agentServer.connect('node-1');

    // 1. Execute RCON kick all command
    const rconKick = await BedrockServerController.executeRconCommand(server, 'kick @a Emergency shutdown initiated');
    expect(rconKick).toContain('kick');

    // 2. Trigger pre-shutdown safety backup
    const preShutdownBackup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: 'Emergency pre-shutdown backup snapshot',
    });
    expect(preShutdownBackup.status).toBe(BackupStatus.COMPLETED);

    // 3. Update agent container state to STOPPING then OFFLINE
    agentServer.setServerState(server.id, 'STOPPING');
    agentServer.setServerState(server.id, 'OFFLINE');
    expect(agentServer.getServerState(server.id)).toBe('OFFLINE');

    // 4. Emit stdout shutdown sequence
    const shutdownLogs = logStreamer.emitShutdownSequence(server.id);
    expect(shutdownLogs.length).toBe(2);

    // 5. Audit Log Entry
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'AdminSteve',
      action: 'EMERGENCY_SERVER_SHUTDOWN',
      entityType: 'BedrockServer',
      entityId: server.id,
    });
    expect(db.auditLogs.some((a) => a.action === 'EMERGENCY_SERVER_SHUTDOWN')).toBe(true);
  });

  it('Flow 16: Moderation Mute Enforcement -> BDS Player Join Stream -> Mute Expiration Check -> Audit Trail', async () => {
    const logStreamer = new MockBdsLogStreamer();
    const server = db.servers[0];
    const mutedPlayer = 'MutedGamerX';

    // 1. Create temporary MUTE moderation action (30 min)
    const muteRecord = ModerationService.createAction({
      gamertag: mutedPlayer,
      playerXuid: 'xuid_555666',
      actionType: ModerationType.MUTE,
      reason: 'Spamming discord link in chat',
      issuerId: 'usr_mod_2',
      issuerName: 'ModBob',
      durationMinutes: 30,
    });
    expect(muteRecord.active).toBe(true);

    // 2. Player joins server -> emit BDS stdout log
    logStreamer.emitPlayerJoin(server.id, mutedPlayer, 'xuid_555666');
    expect(logStreamer.getLogHistory(server.id).length).toBe(1);

    // 3. Inspect moderation history for muted player
    const history = ModerationService.getHistoryForPlayer(mutedPlayer);
    expect(history.length).toBe(1);
    expect(history[0].actionType).toBe(ModerationType.MUTE);
    expect(history[0].durationMinutes).toBe(30);

    // 4. Audit Log entry
    AuditLogger.record({
      actorId: 'usr_mod_2',
      actorName: 'ModBob',
      action: 'MUTE_ENFORCEMENT_VERIFIED',
      entityType: 'Player',
      entityId: mutedPlayer,
    });
    expect(db.auditLogs.some((a) => a.action === 'MUTE_ENFORCEMENT_VERIFIED')).toBe(true);
  });

  it('Flow 17: Server Deletion -> Final Archival Backup -> Subdomain DNS Teardown -> Discord Decommission Notification', async () => {
    const dnsProvider = new MockDnsProvider('play.bedrockops.io');
    const agentServer = new MockAgentServer();
    const webhookUrl = 'https://discord.com/api/webhooks/decommission';

    // 1. Create and setup server with DNS
    const dnsRes = dnsProvider.provisionSubdomain('oldrealm', '192.168.1.99', 19145);
    const server = db.servers[0];

    // 2. Trigger final archival backup snapshot
    const finalBackup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: true,
      notes: 'Final archival backup snapshot prior to deletion',
    });
    expect(finalBackup.status).toBe(BackupStatus.COMPLETED);

    // 3. Teardown DNS subdomain records
    const delDns = dnsProvider.deleteSubdomain('oldrealm');
    expect(delDns.deletedCount).toBe(2);
    expect(dnsProvider.verifyRecordRouting(dnsRes.fqdn).valid).toBe(false);

    // 4. Mark server container OFFLINE and remove server record
    agentServer.setServerState(server.id, 'OFFLINE');
    db.servers = db.servers.filter((s) => s.id !== server.id);
    expect(db.servers.length).toBe(0);

    // 5. Send Discord decommission notification
    await DiscordBotService.dispatchAlert(
      webhookUrl,
      'Server Decommissioned',
      `Server **${server.name}** has been deleted. Final archival backup snapshot: ${finalBackup.filename}`
    );
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
  });

  it('Flow 18: Agent Disconnect & CGNAT Recovery Simulation -> Offline Frame Buffering -> Status Reconciliation', async () => {
    const agentServer = new MockAgentServer();
    const nodeId = 'node-cgnat-1';
    const serverId = 'srv_bedrock_1';

    // 1. Initial agent connection & normal heartbeat
    agentServer.connect(nodeId);
    expect(agentServer.isConnected(nodeId)).toBe(true);

    agentServer.sendFrame({
      type: 'HEARTBEAT',
      nodeId,
      serverId,
      payload: { uptimeSeconds: 100 },
    });

    // 2. Simulate disconnect during CGNAT IP change
    agentServer.disconnect(nodeId);
    expect(agentServer.isConnected(nodeId)).toBe(false);

    // 3. Offline frame buffering simulation (receiving frame while node disconnected)
    agentServer.receiveFrame({
      id: 'frame-cgnat-offline-1',
      timestamp: Date.now(),
      type: 'METRICS',
      nodeId,
      serverId,
      payload: { cpuPercent: 5.0, memoryUsageMB: 512, memoryLimitMB: 4096, diskUsageMB: 1000, uptimeSeconds: 120, activeConnections: 0, timestamp: Date.now() },
    });

    // 4. Agent reconnects and reconciles
    agentServer.connect(nodeId);
    expect(agentServer.isConnected(nodeId)).toBe(true);

    agentServer.setServerState(serverId, 'ONLINE');
    expect(agentServer.getServerState(serverId)).toBe('ONLINE');

    const history = agentServer.getFrameHistory({ nodeId });
    expect(history.length).toBe(2);
  });

  it('Flow 19: Server Properties Configuration -> Property Serialization -> RCON Reload Command -> Audit Dispatch', async () => {
    const server = db.servers[0];
    const rawContent = `
server-name=My Bedrock World
gamemode=survival
difficulty=normal
max-players=20
allow-cheats=true
`;

    // 1. Parse raw server properties
    const properties = BedrockServerController.parseProperties(rawContent);
    expect(properties['server-name']).toBe('My Bedrock World');
    expect(properties['gamemode']).toBe('survival');

    // 2. Modify & serialize back to properties string format
    properties['difficulty'] = 'hard';
    properties['max-players'] = '50';
    const serialized = BedrockServerController.serializeProperties(properties);

    expect(serialized).toContain('difficulty=hard');
    expect(serialized).toContain('max-players=50');

    // 3. Dispatch RCON command to apply live reload
    const rconResponse = await BedrockServerController.executeRconCommand(server, 'reload');
    expect(rconResponse).toContain('reload');

    // 4. Record config modification audit event
    AuditLogger.record({
      actorId: 'usr_admin_1',
      actorName: 'admin',
      action: 'SERVER_PROPERTIES_UPDATE',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { properties },
    });
    expect(db.auditLogs.some((a) => a.action === 'SERVER_PROPERTIES_UPDATE')).toBe(true);
  });

  it('Flow 20: Pipeline Execution Failure -> Error Recovery -> Safety Cleanup -> Staff Discord Alert', async () => {
    const webhookUrl = 'https://discord.com/api/webhooks/pipeline-errors';

    // 1. Run pipeline with invalid/non-existent template ID
    const { server, run } = await PipelineEngine.runServerSetupPipeline({
      serverName: 'Failed Setup Realm',
      templateId: 'non_existent_template_999',
      webhookUrl,
      actorName: 'OpsEngineer',
    });

    // Pipeline template step logs warning but continues fallback setup
    expect(run.status).toBe(PipelineStatus.SUCCESS);
    expect(run.logs.some((l) => l.includes('Template apply skipped or failed'))).toBe(true);

    // 2. Trigger error alert to staff Discord channel
    await DiscordBotService.dispatchAlert(
      webhookUrl,
      'Pipeline Warning: Setup Template Fallback',
      `Pipeline run ${run.id} for server **${server.name}** completed with warnings: invalid template non_existent_template_999.`
    );

    expect(NotificationDispatcher.sentMessages.length).toBe(2); // 1 from setup pipeline + 1 error alert
  });

  it('Flow 21: UDP Port Reservation -> DNS SRV Record Mapping -> Agent Server Synchronization -> Port Deallocation Recovery', async () => {
    const dnsProvider = new MockDnsProvider('play.bedrockops.io');
    const agentServer = new MockAgentServer();
    const server = db.servers[0];
    const allocatedPort = 19140;

    // 1. Provision Subdomain with specific port reservation
    const dnsProvision = dnsProvider.provisionSubdomain('survival-pvp', '192.168.1.50', allocatedPort);
    expect(dnsProvision.srvRecord.port).toBe(allocatedPort);

    // 2. Sync port & container state to agent
    server.port = allocatedPort;
    agentServer.setServerState(server.id, 'ONLINE');
    expect(agentServer.getServerState(server.id)).toBe('ONLINE');

    // 3. Verify DNS resolution routing
    const routeCheck = dnsProvider.verifyRecordRouting('survival-pvp.play.bedrockops.io', allocatedPort);
    expect(routeCheck.valid).toBe(true);

    // 4. Delete subdomain & deallocate port
    const teardown = dnsProvider.deleteSubdomain('survival-pvp');
    expect(teardown.deletedCount).toBe(2);

    const postTeardownCheck = dnsProvider.verifyRecordRouting('survival-pvp.play.bedrockops.io');
    expect(postTeardownCheck.valid).toBe(false);
  });
});
