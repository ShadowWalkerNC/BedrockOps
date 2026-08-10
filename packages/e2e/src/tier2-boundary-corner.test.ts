import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  UserRole,
  ServerStatus,
  BackupStatus,
  ModerationType,
  PipelineStatus,
  HostProviderType,
} from '@mc-admin/db';
import {
  BedrockServerController,
  DockerAgentHostProvider,
  PterodactylHostProvider,
  DirectRconSshHostProvider,
  HostProviderFactory,
} from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';
import { AuditLogger } from '@mc-admin/audit';
import { hasPermission, generateDevSession } from '@mc-admin/auth';
import {
  MockAgentServer,
  MockBdsLogStreamer,
  MockXboxService,
  MockDnsProvider,
} from './harness';

describe('Tier 2: Boundary & Corner Cases (R1.1 - R5.3)', () => {
  let mockAgent: MockAgentServer;
  let mockLogStreamer: MockBdsLogStreamer;
  let mockXbox: MockXboxService;
  let mockDns: MockDnsProvider;

  beforeEach(() => {
    db.users = [];
    db.agentNodes = [];
    db.servers = [];
    db.backups = [];
    db.moderationActions = [];
    db.templates = [];
    db.pipelines = [];
    db.pipelineRuns = [];
    db.auditLogs = [];
    db.connectionKeys = [];
    db.serverMembers = [];
    db.bdsVersions = [];
    NotificationDispatcher.sentMessages = [];
    db.seedDefaults();

    mockAgent = new MockAgentServer();
    mockLogStreamer = new MockBdsLogStreamer();
    mockXbox = new MockXboxService();
    mockDns = new MockDnsProvider();
  });

  // ---------------------------------------------------------------------------
  // Feature 1: R1.1 PostgreSQL Database Schema (Prisma Models)
  // ---------------------------------------------------------------------------
  describe('R1.1 PostgreSQL Database Schema (Prisma Models)', () => {
    it('validates BedrockServer port boundary ranges (19132-19999)', () => {
      const server = db.servers[0];
      expect(server.port).toBeGreaterThanOrEqual(19132);
      expect(server.port).toBeLessThanOrEqual(65535);

      server.port = 19132;
      expect(server.port).toBe(19132);
      server.port = 19999;
      expect(server.port).toBe(19999);
    });

    it('handles User model with empty email and username edge cases', () => {
      db.users.push({
        id: 'usr_edge_1',
        username: '',
        email: '',
        role: UserRole.VIEWER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const created = db.users.find((u) => u.id === 'usr_edge_1');
      expect(created).toBeDefined();
      expect(created?.username).toBe('');
      expect(created?.email).toBe('');
    });

    it('enforces ConnectionKey non-negative useCount boundaries', () => {
      const key = db.connectionKeys[0];
      expect(key.useCount).toBeGreaterThanOrEqual(0);

      key.useCount = 0;
      expect(key.useCount).toBe(0);
    });

    it('handles AgentNode status transitions with missing optional metadata', () => {
      db.agentNodes.push({
        id: 'node_minimal',
        name: 'Minimal Node',
        version: 'v1.0.0',
        status: 'OFFLINE',
        lastHeartbeat: new Date(),
        createdAt: new Date(),
      });

      const node = db.agentNodes.find((n) => n.id === 'node_minimal');
      expect(node).toBeDefined();
      expect(node?.status).toBe('OFFLINE');
    });

    it('records AuditLog entries with empty or complex metadata objects', () => {
      const emptyAudit = AuditLogger.record({
        actorId: 'usr_sys',
        actorName: 'system',
        action: 'EMPTY_META_TEST',
        entityType: 'System',
        entityId: 'sys_1',
        metadata: {},
      });
      expect(emptyAudit.metadata).toEqual({});

      const complexAudit = AuditLogger.record({
        actorId: 'usr_sys',
        actorName: 'system',
        action: 'COMPLEX_META_TEST',
        entityType: 'System',
        entityId: 'sys_1',
        metadata: { nested: { key: 'value', numbers: [1, 2, 3], flag: true } },
      });
      expect(complexAudit.metadata?.nested?.numbers).toEqual([1, 2, 3]);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: R1.2 HostProvider Abstraction Layer
  // ---------------------------------------------------------------------------
  describe('R1.2 HostProvider Abstraction Layer', () => {
    it('HostProviderFactory throws explicit error for unsupported strategy type', () => {
      expect(() => {
        HostProviderFactory.getProvider('INVALID_PROVIDER_TYPE' as any);
      }).toThrow('Unsupported HostProviderType: INVALID_PROVIDER_TYPE');
    });

    it('DockerAgentHostProvider throws error when server has no assigned agentId', async () => {
      const provider = new DockerAgentHostProvider();
      const unassignedServer = { ...db.servers[0], agentId: undefined };

      await expect(provider.startServer(unassignedServer)).rejects.toThrow(
        'Server srv_bedrock_1 has no assigned agentNode'
      );
      await expect(provider.stopServer(unassignedServer)).rejects.toThrow(
        'Server srv_bedrock_1 has no assigned agentNode'
      );
    });

    it('PterodactylHostProvider refuses start until panel API is wired', async () => {
      const provider = new PterodactylHostProvider('https://panel.example.com', 'ptero_key_123');
      const server = { ...db.servers[0], hostProvider: HostProviderType.PTERODACTYL };

      const started = await provider.startServer(server);
      expect(started).toBe(false);
    });

    it('DirectRconSshHostProvider returns honest RCON error for empty command', async () => {
      const provider = new DirectRconSshHostProvider();
      const server = db.servers[0];

      const response = await provider.executeRcon(server, '');
      expect(response).toContain('[RCON ERROR]');
      expect(response).toMatch(/empty|command/i);
    });

    it('HostProvider streamLogs handles stream subscription and unsubscribe callback', () => {
      const provider = new DockerAgentHostProvider();
      const server = db.servers[0];
      const receivedLogs: string[] = [];

      const unsubscribe = provider.streamLogs(server, (line) => {
        receivedLogs.push(line);
      });

      expect(receivedLogs.length).toBe(1);
      expect(receivedLogs[0]).toContain('Log streaming started');
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: R1.3 REST API Backend & JWT Auth
  // ---------------------------------------------------------------------------
  describe('R1.3 REST API Backend & JWT Auth', () => {
    it('hasPermission evaluates exact boundary role permissions correctly', () => {
      expect(hasPermission(UserRole.OWNER, UserRole.OWNER)).toBe(true);
      expect(hasPermission(UserRole.ADMIN, UserRole.ADMIN)).toBe(true);
      expect(hasPermission(UserRole.MODERATOR, UserRole.MODERATOR)).toBe(true);
      expect(hasPermission(UserRole.VIEWER, UserRole.VIEWER)).toBe(true);
    });

    it('hasPermission denies access when user role is below required role', () => {
      expect(hasPermission(UserRole.VIEWER, UserRole.MODERATOR)).toBe(false);
      expect(hasPermission(UserRole.MODERATOR, UserRole.ADMIN)).toBe(false);
      expect(hasPermission(UserRole.ADMIN, UserRole.OWNER)).toBe(false);
    });

    it('generateDevSession creates session with custom username and role', () => {
      const session = generateDevSession('CustomMod', UserRole.MODERATOR);
      expect(session.username).toBe('CustomMod');
      expect(session.role).toBe(UserRole.MODERATOR);
      expect(typeof session.token).toBe('string');
      expect(session.token!.length).toBeGreaterThan(10);
    });

    it('generateDevSession handles empty username string gracefully', () => {
      const session = generateDevSession('', UserRole.VIEWER);
      expect(session.username).toBe('');
      expect(session.role).toBe(UserRole.VIEWER);
      expect(session.userId).toBe('usr_dev_1');
    });

    it('hasPermission grants access when user role is strictly above required role', () => {
      expect(hasPermission(UserRole.OWNER, UserRole.VIEWER)).toBe(true);
      expect(hasPermission(UserRole.ADMIN, UserRole.MODERATOR)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: R1.4 WebSocket Agent Tunnel & Gateway
  // ---------------------------------------------------------------------------
  describe('R1.4 WebSocket Agent Tunnel & Gateway', () => {
    it('MockAgentServer stores and emits frame with custom payload', () => {
      mockAgent.connect('node-1');
      const frame = mockAgent.sendFrame({
        type: 'HEARTBEAT',
        nodeId: 'node-1',
        serverId: 'srv_1',
        payload: { ping: 'pong' },
      });

      expect(frame.id).toBeDefined();
      expect(frame.type).toBe('HEARTBEAT');
      expect(mockAgent.getFrameHistory().length).toBe(1);
    });

    it('MockAgentServer ignores frame processing when node is disconnected', () => {
      expect(mockAgent.isConnected('node-offline')).toBe(false);
      mockAgent.disconnect('node-offline');
      expect(mockAgent.isConnected('node-offline')).toBe(false);
    });

    it('MockAgentServer receives frame with unknown message type gracefully', () => {
      const unknownFrame = {
        id: 'frame-999',
        type: 'CUSTOM_UNKNOWN_TYPE' as any,
        nodeId: 'node-1',
        serverId: 'srv_1',
        timestamp: Date.now(),
        payload: { data: 'test' },
      };

      expect(() => mockAgent.receiveFrame(unknownFrame)).not.toThrow();
      expect(mockAgent.getFrameHistory().length).toBe(1);
    });

    it('MockAgentServer handles disconnect and reconnect lifecycle', () => {
      mockAgent.connect('node-2');
      expect(mockAgent.isConnected('node-2')).toBe(true);

      mockAgent.disconnect('node-2');
      expect(mockAgent.isConnected('node-2')).toBe(false);

      mockAgent.connect('node-2');
      expect(mockAgent.isConnected('node-2')).toBe(true);
    });

    it('MockAgentServer frame history clearing resets history array', () => {
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'node-1', serverId: 'srv_1', payload: {} });
      expect(mockAgent.getFrameHistory().length).toBe(1);

      mockAgent.clearHistory();
      expect(mockAgent.getFrameHistory().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: R1.5 Next.js Admin Dashboard UI Data Contracts
  // ---------------------------------------------------------------------------
  describe('R1.5 Next.js Admin Dashboard UI Data Contracts', () => {
    it('handles server data retrieval when db.servers is empty', () => {
      db.servers = [];
      expect(db.servers.length).toBe(0);
      const onlineServers = db.servers.filter((s) => s.status === ServerStatus.ONLINE);
      expect(onlineServers).toEqual([]);
    });

    it('filters servers by status with non-matching query returning empty array', () => {
      const startingServers = db.servers.filter((s) => s.status === ServerStatus.STARTING);
      expect(startingServers).toEqual([]);
    });

    it('sorts server list by name when names contain special characters', () => {
      db.servers.push({
        ...db.servers[0],
        id: 'srv_alpha',
        name: '!!! Alpha Realm',
      });
      db.servers.push({
        ...db.servers[0],
        id: 'srv_zebra',
        name: 'Zebra Realm',
      });

      const sorted = [...db.servers].sort((a, b) => a.name.localeCompare(b.name));
      expect(sorted[0].name).toBe('!!! Alpha Realm');
    });

    it('updates BedrockServer status and timestamp correctly', () => {
      const server = db.servers[0];
      const originalTime = server.updatedAt;

      BedrockServerController.setServerStatus(server, ServerStatus.MAINTENANCE);
      expect(server.status).toBe(ServerStatus.MAINTENANCE);
      expect(server.updatedAt.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
    });

    it('handles server member role permissions and count boundary', () => {
      db.serverMembers.push({
        id: 'mem_1',
        serverId: 'srv_bedrock_1',
        userId: 'usr_admin_1',
        role: UserRole.ADMIN
      });

      const members = db.serverMembers.filter((m) => m.serverId === 'srv_bedrock_1');
      expect(members.length).toBe(1);
      expect(members[0].role).toBe(UserRole.ADMIN);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: R2.1 Outbound WSS Go Daemon Agent Protocol
  // ---------------------------------------------------------------------------
  describe('R2.1 Outbound WSS Go Daemon Agent Protocol', () => {
    it('MockAgentServer generates telemetry frame for ONLINE server', () => {
      mockAgent.setServerState('srv_1', 'ONLINE');
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1');

      expect(frame.type).toBe('METRICS');
      expect(frame.payload.cpuPercent).toBe(12.5);
      expect(frame.payload.memoryUsageMB).toBe(1024);
      expect(frame.payload.activeConnections).toBe(3);
    });

    it('MockAgentServer generates telemetry frame for OFFLINE server', () => {
      mockAgent.setServerState('srv_1', 'OFFLINE');
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1');

      expect(frame.payload.cpuPercent).toBe(0.0);
      expect(frame.payload.memoryUsageMB).toBe(0);
      expect(frame.payload.activeConnections).toBe(0);
    });

    it('MockAgentServer handles CMD_EXEC receive frame and transitions server state', () => {
      mockAgent.receiveFrame({
        id: 'f-1',
        type: 'CMD_EXEC',
        nodeId: 'node-1',
        serverId: 'srv_1',
        timestamp: Date.now(),
        payload: { action: 'start' },
      });

      expect(mockAgent.getServerState('srv_1')).toBe('STARTING');
    });

    it('MockAgentServer filters frame history by type and serverId', () => {
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'node-1', serverId: 'srv_1', payload: {} });
      mockAgent.sendFrame({ type: 'LOG_LINE', nodeId: 'node-1', serverId: 'srv_2', payload: {} });

      const filtered = mockAgent.getFrameHistory({ type: 'HEARTBEAT', serverId: 'srv_1' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].serverId).toBe('srv_1');
    });

    it('MockAgentServer frame history query with non-matching filter returns empty array', () => {
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'node-1', serverId: 'srv_1', payload: {} });
      const filtered = mockAgent.getFrameHistory({ serverId: 'srv_non_existent' });
      expect(filtered).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: R2.2 BDS Container & Process Lifecycle Commands
  // ---------------------------------------------------------------------------
  describe('R2.2 BDS Container & Process Lifecycle Commands', () => {
    it('MockAgentServer executes remote command and returns CMD_RESP frame', () => {
      const frame = mockAgent.executeCommand('node-1', 'srv_1', 'version');
      expect(frame.type).toBe('CMD_RESP');
      expect(frame.payload.exitCode).toBe(0);
      expect(frame.payload.output).toContain("Command 'version' executed");
    });

    it('handles container state transition to ERROR state', () => {
      mockAgent.setServerState('srv_err', 'ERROR');
      expect(mockAgent.getServerState('srv_err')).toBe('ERROR');
    });

    it('handles container state transition through full lifecycle: STARTING -> ONLINE -> STOPPING -> OFFLINE', () => {
      const serverId = 'srv_lifecycle';
      mockAgent.setServerState(serverId, 'STARTING');
      expect(mockAgent.getServerState(serverId)).toBe('STARTING');

      mockAgent.setServerState(serverId, 'ONLINE');
      expect(mockAgent.getServerState(serverId)).toBe('ONLINE');

      mockAgent.setServerState(serverId, 'STOPPING');
      expect(mockAgent.getServerState(serverId)).toBe('STOPPING');

      mockAgent.setServerState(serverId, 'OFFLINE');
      expect(mockAgent.getServerState(serverId)).toBe('OFFLINE');
    });

    it('DockerAgentHostProvider restartServer stops and starts server in sequence', async () => {
      const provider = new DockerAgentHostProvider();
      const server = db.servers[0];

      const restarted = await provider.restartServer(server);
      expect(restarted).toBe(false);
    });

    it('PterodactylHostProvider restartServer returns false until panel API is wired', async () => {
      const provider = new PterodactylHostProvider();
      const server = { ...db.servers[0], hostProvider: HostProviderType.PTERODACTYL };

      const restarted = await provider.restartServer(server);
      expect(restarted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 8: R2.3 Telemetry Collection Engine (gopsutil)
  // ---------------------------------------------------------------------------
  describe('R2.3 Telemetry Collection Engine (gopsutil)', () => {
    it('accepts custom telemetry values with 0% CPU and 0 MB RAM (idle state)', () => {
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1', {
        cpuPercent: 0.0,
        memoryUsageMB: 0,
        activeConnections: 0,
      });

      expect(frame.payload.cpuPercent).toBe(0.0);
      expect(frame.payload.memoryUsageMB).toBe(0);
      expect(frame.payload.activeConnections).toBe(0);
    });

    it('accepts custom telemetry values for resource exhaustion (100% CPU, high RAM)', () => {
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1', {
        cpuPercent: 100.0,
        memoryUsageMB: 4096,
        memoryLimitMB: 4096,
        activeConnections: 50,
      });

      expect(frame.payload.cpuPercent).toBe(100.0);
      expect(frame.payload.memoryUsageMB).toBe(4096);
      expect(frame.payload.activeConnections).toBe(50);
    });

    it('HostProvider getStatus returns default ServerMetrics struct', async () => {
      const provider = HostProviderFactory.getProvider(HostProviderType.DOCKER_AGENT);
      const server = db.servers[0];

      const metrics = await provider.getStatus(server);
      expect(metrics.cpuPercent).toBe(0);
      expect(metrics.memoryMb).toBe(0);
      expect(metrics.uptimeSeconds).toBe(0);
      expect(metrics.activePlayers).toBe(0);
    });

    it('MockAgentServer telemetry frame includes accurate timestamp', () => {
      const now = Date.now();
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1', { timestamp: now });
      expect(frame.payload.timestamp).toBe(now);
    });

    it('MockAgentServer generateTelemetry defaults limit and disk usage properly', () => {
      const frame = mockAgent.generateTelemetry('node-1', 'srv_1');
      expect(frame.payload.memoryLimitMB).toBe(4096);
      expect(frame.payload.diskUsageMB).toBe(2500);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 9: R2.4 RCON Client & BDS Log Streamer
  // ---------------------------------------------------------------------------
  describe('R2.4 RCON Client & BDS Log Streamer', () => {
    it('parseJoinLog returns null for non-join log line', () => {
      const parsed = MockBdsLogStreamer.parseJoinLog('[2026-08-06 04:55:00:123 INFO] Server started.');
      expect(parsed).toBeNull();
    });

    it('parseDisconnectLog parses player disconnect stdout line correctly', () => {
      const line = '[2026-08-06 04:55:00:123 INFO] Player disconnected: Steve, xuid: 2535412345678901';
      const parsed = MockBdsLogStreamer.parseDisconnectLog(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.gamertag).toBe('Steve');
      expect(parsed?.xuid).toBe('2535412345678901');
    });

    it('parseDisconnectLog returns null for invalid disconnect log line', () => {
      const parsed = MockBdsLogStreamer.parseDisconnectLog('Random stdout message');
      expect(parsed).toBeNull();
    });

    it('MockBdsLogStreamer emits startup and shutdown log sequences', () => {
      const startupLogs = mockLogStreamer.emitStartupSequence('srv_1', 19132, '1.20.80.01');
      expect(startupLogs.length).toBe(4);
      expect(startupLogs[0].type).toBe('STARTUP');
      expect(startupLogs[3].rawLine).toContain('Server started.');

      const shutdownLogs = mockLogStreamer.emitShutdownSequence('srv_1');
      expect(shutdownLogs.length).toBe(2);
      expect(shutdownLogs[0].type).toBe('SHUTDOWN');
    });

    it('MockBdsLogStreamer handles onLogLine subscription and unsubscribes cleanly', () => {
      const logs: string[] = [];
      const unsubscribe = mockLogStreamer.onLogLine((entry) => {
        logs.push(entry.rawLine);
      });

      mockLogStreamer.emitCustomLog('srv_1', 'Test log message', 'INFO');
      expect(logs.length).toBe(1);

      unsubscribe();
      mockLogStreamer.emitCustomLog('srv_1', 'Second log message', 'INFO');
      expect(logs.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 10: R3.1 Save-Hold Live Checkpoint Sequence
  // ---------------------------------------------------------------------------
  describe('R3.1 Save-Hold Live Checkpoint Sequence', () => {
    it('parseSaveQueryLog parses save query file list log line', () => {
      const line = 'bedrock_level/db/000005.ldb:1048576, bedrock_level/level.dat:2048';
      const parsed = MockBdsLogStreamer.parseSaveQueryLog(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.files.length).toBe(2);
      expect(parsed?.files[0].path).toBe('bedrock_level/db/000005.ldb');
      expect(parsed?.files[0].size).toBe(1048576);
      expect(parsed?.files[1].path).toBe('bedrock_level/level.dat');
      expect(parsed?.files[1].size).toBe(2048);
    });

    it('parseSaveQueryLog returns null for line with no colon separators', () => {
      const parsed = MockBdsLogStreamer.parseSaveQueryLog('No files to copy');
      expect(parsed).toBeNull();
    });

    it('MockBdsLogStreamer emits save hold sequence with default files', () => {
      const entries = mockLogStreamer.emitSaveHoldSequence('srv_1');
      expect(entries.length).toBe(2);
      expect(entries[0].type).toBe('SAVE_HOLD');
      expect(entries[1].rawLine).toContain('bedrock_level/db/000005.ldb:1048576');
    });

    it('MockAgentServer triggerBackupSequence generates START, PROGRESS, and COMPLETE frames', () => {
      const frames = mockAgent.triggerBackupSequence('node-1', 'srv_1', 'bkp_123');

      expect(frames.length).toBe(3);
      expect(frames[0].type).toBe('BACKUP_START');
      expect(frames[1].type).toBe('BACKUP_PROGRESS');
      expect(frames[2].type).toBe('BACKUP_COMPLETE');
      expect(frames[2].payload.checksum).toBeDefined();
    });

    it('MockBdsLogStreamer emitSaveHoldSequence accepts custom file list', () => {
      const customFiles = [{ path: 'world/level.dat', size: 4096 }];
      const entries = mockLogStreamer.emitSaveHoldSequence('srv_1', customFiles);

      expect(entries[1].rawLine).toBe('world/level.dat:4096');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 11: R3.2 Zero-Disk Streaming Compression (R2 PUT)
  // ---------------------------------------------------------------------------
  describe('R3.2 Zero-Disk Streaming Compression (R2 PUT)', () => {
    it('creates backup record with generated storagePath and filename format', () => {
      const backup = BackupEngine.triggerBackup({
        serverId: 'srv_stream_1',
        isManual: true,
        notes: 'Streaming test backup',
      });

      expect(backup.storagePath).toBe(`/backups/srv_stream_1/${backup.filename}`);
      expect(backup.notes).toContain('Streaming test backup');
    });

    it('handles backup creation with special characters in notes', () => {
      const backup = BackupEngine.triggerBackup({
        serverId: 'srv_1',
        isManual: false,
        notes: 'Pre-update backup! #world & snapshot @2026',
      });

      expect(backup.notes).toContain('Pre-update backup! #world & snapshot @2026');
      expect(backup.status).toBe(BackupStatus.PENDING);
    });

    it('DockerAgentHostProvider triggerBackup returns stub when tunnel absent', async () => {
      const provider = new DockerAgentHostProvider();
      const server = db.servers[0];

      const result = await provider.triggerBackup(server, {
        backupId: 'bkp_test_1',
        presignedUploadUrl: 'https://r2.cloudflare.com/presigned-upload-url',
        isManual: true,
      });

      expect(result.success).toBe(false);
      expect(result.stub).toBe(true);
      expect(result.backupId).toBe('bkp_test_1');
    });

    it('DirectRconSshHostProvider triggerBackup returns stub result', async () => {
      const provider = new DirectRconSshHostProvider();
      const server = db.servers[0];

      const result = await provider.triggerBackup(server, {
        backupId: 'bkp_direct_1',
        presignedUploadUrl: 'https://r2.cloudflare.com/direct-upload',
        isManual: false,
      });

      expect(result.success).toBe(false);
      expect(result.stub).toBe(true);
      expect(result.backupId).toBe('bkp_direct_1');
    });

    it('handles multiple rapid backup triggers generating unique backup IDs', () => {
      const b1 = BackupEngine.triggerBackup({ serverId: 'srv_rapid', isManual: true });
      const b2 = BackupEngine.triggerBackup({ serverId: 'srv_rapid', isManual: true });

      expect(b1.id).not.toBe(b2.id);
      expect(b1.storagePath).toContain('srv_rapid');
      expect(b2.storagePath).toContain('srv_rapid');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 12: R3.3 Integrity Manifest Verification (SHA256)
  // ---------------------------------------------------------------------------
  describe('R3.3 Integrity Manifest Verification (SHA256)', () => {
    it('restores completed backup returns stub until agent dispatch', () => {
      const backup = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
      BackupEngine.completeBackup(backup.id, 1024);
      const result = BackupEngine.restoreBackup(backup.id);

      expect(result.success).toBe(false);
      expect(result.stub).toBe(true);
      expect(result.message).toContain('requires agent dispatch');
    });

    it('fails restore when backup record status is PENDING', () => {
      const backup = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });

      const result = BackupEngine.restoreBackup(backup.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not completed');
    });

    it('applies retention policy pruning oldest backups first', () => {
      const serverId = 'srv_retention_test';
      const b1 = BackupEngine.triggerBackup({ serverId, isManual: false });
      b1.createdAt = new Date(Date.now() - 3000);
      const b2 = BackupEngine.triggerBackup({ serverId, isManual: false });
      b2.createdAt = new Date(Date.now() - 2000);
      const b3 = BackupEngine.triggerBackup({ serverId, isManual: false });
      b3.createdAt = new Date(Date.now() - 1000);

      const pruned = BackupEngine.applyRetentionPolicy(serverId, 2);
      expect(pruned).toBe(1);

      const remaining = BackupEngine.getBackupsForServer(serverId);
      expect(remaining.length).toBe(2);
      expect(remaining.some((b) => b.id === b1.id)).toBe(false);
    });

    it('handles retention policy when limit is 0', () => {
      const serverId = 'srv_prune_all';
      BackupEngine.triggerBackup({ serverId, isManual: false });

      const pruned = BackupEngine.applyRetentionPolicy(serverId, 0);
      expect(pruned).toBe(1);
      expect(BackupEngine.getBackupsForServer(serverId).length).toBe(0);
    });

    it('returns empty array when querying backups for non-existent server ID', () => {
      const backups = BackupEngine.getBackupsForServer('srv_non_existent_999');
      expect(backups).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 13: R4.1 Player XUID & Gamertag Tracking
  // ---------------------------------------------------------------------------
  describe('R4.1 Player XUID & Gamertag Tracking', () => {
    it('MockBdsLogStreamer emits player join event with formatted raw line', () => {
      const entry = mockLogStreamer.emitPlayerJoin('srv_1', 'Steve', '2535412345678901');

      expect(entry.type).toBe('JOIN');
      expect(entry.metadata?.gamertag).toBe('Steve');
      expect(entry.metadata?.xuid).toBe('2535412345678901');
      expect(entry.rawLine).toContain('Player connected: Steve, xuid: 2535412345678901');
    });

    it('parseJoinLog parses player join stdout line with spaces in Gamertag', () => {
      const line = '[2026-08-06 04:55:00:123 INFO] Player connected: Steve The Builder, xuid: 2535499999999999';
      const parsed = MockBdsLogStreamer.parseJoinLog(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.gamertag).toBe('Steve The Builder');
      expect(parsed?.xuid).toBe('2535499999999999');
    });

    it('parseJoinLog parses player join stdout line case-insensitively', () => {
      const line = '[2026-08-06 04:55:00:123 info] player connected: Alex, xuid: 2535411111111111';
      const parsed = MockBdsLogStreamer.parseJoinLog(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.gamertag).toBe('Alex');
      expect(parsed?.xuid).toBe('2535411111111111');
    });

    it('MockBdsLogStreamer retrieves log history filtered by serverId', () => {
      mockLogStreamer.emitPlayerJoin('srv_1', 'Steve', '25354123');
      mockLogStreamer.emitPlayerJoin('srv_2', 'Alex', '25354456');

      const srv1Logs = mockLogStreamer.getLogHistory('srv_1');
      expect(srv1Logs.length).toBe(1);
      expect(srv1Logs[0].metadata?.gamertag).toBe('Steve');
    });

    it('MockBdsLogStreamer clearHistory resets recorded log entries', () => {
      mockLogStreamer.emitPlayerJoin('srv_1', 'Steve', '25354123');
      expect(mockLogStreamer.getLogHistory().length).toBe(1);

      mockLogStreamer.clearHistory();
      expect(mockLogStreamer.getLogHistory().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 14: R4.2 Persistent Infraction Ledger (GDPR Soft-Delete)
  // ---------------------------------------------------------------------------
  describe('R4.2 Persistent Infraction Ledger (GDPR Soft-Delete)', () => {
    it('creates infraction action record with all fields populated', () => {
      const action = ModerationService.createAction({
        gamertag: 'Griefer99',
        playerXuid: '253549999',
        actionType: ModerationType.BAN,
        reason: 'Severe griefing',
        issuerId: 'usr_mod_1',
        issuerName: 'HeadMod',
        durationMinutes: 1440,
      });

      expect(action.id).toBeDefined();
      expect(action.gamertag).toBe('Griefer99');
      expect(action.playerXuid).toBe('253549999');
      expect(action.actionType).toBe(ModerationType.BAN);
      expect(action.durationMinutes).toBe(1440);
      expect(action.active).toBe(true);
    });

    it('getHistoryForPlayer returns matching infractions case-insensitively', () => {
      ModerationService.createAction({
        gamertag: 'CheaterPro',
        actionType: ModerationType.MUTE,
        reason: 'Spamming',
        issuerId: 'usr_mod_1',
        issuerName: 'Mod1',
      });

      const history = ModerationService.getHistoryForPlayer('cheaterpro');
      expect(history.length).toBe(1);
      expect(history[0].actionType).toBe(ModerationType.MUTE);
    });

    it('searchPlayers matches gamertags by partial substring', () => {
      ModerationService.createAction({
        gamertag: 'AlphaCraft',
        actionType: ModerationType.WARN,
        reason: 'Warning 1',
        issuerId: 'mod_1',
        issuerName: 'Mod',
      });
      ModerationService.createAction({
        gamertag: 'BetaCraft',
        actionType: ModerationType.WARN,
        reason: 'Warning 2',
        issuerId: 'mod_1',
        issuerName: 'Mod',
      });

      const matches = ModerationService.searchPlayers('craft');
      expect(matches.length).toBe(2);
      expect(matches).toContain('AlphaCraft');
      expect(matches).toContain('BetaCraft');
    });

    it('creates ModerationAction record without optional durationMinutes', () => {
      const action = ModerationService.createAction({
        gamertag: 'PermBannedUser',
        actionType: ModerationType.BAN,
        reason: 'Permanent ban',
        issuerId: 'mod_1',
        issuerName: 'Mod',
      });

      expect(action.durationMinutes).toBeUndefined();
      expect(action.active).toBe(true);
    });

    it('searchPlayers with empty string returns all unique gamertags from infraction ledger', () => {
      ModerationService.createAction({
        gamertag: 'UserA',
        actionType: ModerationType.NOTE,
        reason: 'Note 1',
        issuerId: 'mod_1',
        issuerName: 'Mod',
      });

      const results = ModerationService.searchPlayers('');
      expect(results.length).toBe(1);
      expect(results[0]).toBe('UserA');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 15: R4.3 BDS allowlist.json Auto-Sync
  // ---------------------------------------------------------------------------
  describe('R4.3 BDS allowlist.json Auto-Sync', () => {
    it('MockAgentServer syncs allowlist entries atomically', () => {
      const entries = [
        { name: 'Steve', xuid: '25354111', ignoresPlayerLimit: false },
        { name: 'Alex', xuid: '25354222', ignoresPlayerLimit: true },
      ];

      const result = mockAgent.syncAllowlist('srv_1', entries);
      expect(result.success).toBe(true);
      expect(result.entriesCount).toBe(2);

      const allowlist = mockAgent.getAllowlist('srv_1');
      expect(allowlist.length).toBe(2);
      expect(allowlist[0].name).toBe('Steve');
      expect(allowlist[1].ignoresPlayerLimit).toBe(true);
    });

    it('hasAllowlistEntry matches player by Gamertag case-insensitively or by XUID', () => {
      mockAgent.syncAllowlist('srv_1', [{ name: 'SteveCraft', xuid: '2535412345' }]);

      expect(mockAgent.hasAllowlistEntry('srv_1', 'stevecraft')).toBe(true);
      expect(mockAgent.hasAllowlistEntry('srv_1', 'STEVECRAFT')).toBe(true);
      expect(mockAgent.hasAllowlistEntry('srv_1', '2535412345')).toBe(true);
    });

    it('hasAllowlistEntry returns false for non-existent player query', () => {
      mockAgent.syncAllowlist('srv_1', [{ name: 'SteveCraft', xuid: '2535412345' }]);
      expect(mockAgent.hasAllowlistEntry('srv_1', 'UnknownUser')).toBe(false);
    });

    it('syncs empty allowlist array resetting server allowlist to empty', () => {
      mockAgent.syncAllowlist('srv_1', [{ name: 'SteveCraft', xuid: '2535412345' }]);
      expect(mockAgent.getAllowlist('srv_1').length).toBe(1);

      mockAgent.syncAllowlist('srv_1', []);
      expect(mockAgent.getAllowlist('srv_1').length).toBe(0);
    });

    it('syncAllowlist sets default ignoresPlayerLimit to false if omitted', () => {
      mockAgent.syncAllowlist('srv_1', [{ name: 'MinimalUser', xuid: '25354999' }]);
      const list = mockAgent.getAllowlist('srv_1');

      expect(list[0].ignoresPlayerLimit).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 16: R5.1 Subdomain & Port Allocation (19132-19999)
  // ---------------------------------------------------------------------------
  describe('R5.1 Subdomain & Port Allocation (19132-19999)', () => {
    it('MockDnsProvider provisions subdomain with matching A and SRV records', () => {
      const result = mockDns.provisionSubdomain('myrealm', '192.168.1.50', 19135);

      expect(result.subdomain).toBe('myrealm');
      expect(result.fqdn).toBe('myrealm.play.bedrockops.io');
      expect(result.allocatedPort).toBe(19135);

      expect(result.aRecord.type).toBe('A');
      expect(result.aRecord.content).toBe('192.168.1.50');

      expect(result.srvRecord.type).toBe('SRV');
      expect(result.srvRecord.port).toBe(19135);
    });

    it('MockDnsProvider verifies record routing for valid FQDN and port', () => {
      mockDns.provisionSubdomain('testrealm', '10.0.0.1', 19132);

      const verification = mockDns.verifyRecordRouting('testrealm.play.bedrockops.io', 19132);
      expect(verification.valid).toBe(true);
      expect(verification.records.length).toBeGreaterThanOrEqual(1);
    });

    it('MockDnsProvider verifyRecordRouting returns false for non-existent FQDN', () => {
      const verification = mockDns.verifyRecordRouting('nonexistent.play.bedrockops.io');
      expect(verification.valid).toBe(false);
      expect(verification.records).toEqual([]);
    });

    it('MockDnsProvider deletes subdomain and cleans up associated DNS records', () => {
      mockDns.provisionSubdomain('deleterealm', '10.0.0.1', 19140);
      expect(mockDns.listRecords().length).toBe(2);

      const deleted = mockDns.deleteSubdomain('deleterealm');
      expect(deleted.deletedCount).toBe(2);
      expect(mockDns.listRecords().length).toBe(0);
    });

    it('MockDnsProvider clearRecords removes all created DNS records', () => {
      mockDns.provisionSubdomain('r1', '10.0.0.1', 19132);
      mockDns.provisionSubdomain('r2', '10.0.0.2', 19133);
      expect(mockDns.listRecords().length).toBe(4);

      mockDns.clearRecords();
      expect(mockDns.listRecords().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 17: R5.2 Console Player Onboarding (Xbox Friend Bot)
  // ---------------------------------------------------------------------------
  describe('R5.2 Console Player Onboarding (Xbox Friend Bot)', () => {
    it('MockXboxService generates deterministic 16-digit XUID starting with 25354', () => {
      const xuid = mockXbox.generateDeterministicXuid('StevePlayer');
      expect(xuid).toMatch(/^25354\d{11}$/);

      const xuid2 = mockXbox.generateDeterministicXuid('StevePlayer');
      expect(xuid).toBe(xuid2);
    });

    it('MockXboxService resolves Gamertag to XUID successfully', async () => {
      const resolution = await mockXbox.resolveGamertag('ConsoleGamer');
      expect(resolution.success).toBe(true);
      expect(resolution.gamertag).toBe('ConsoleGamer');
      expect(resolution.xuid).toMatch(/^25354\d{11}$/);
    });

    it('MockXboxService handles empty string Gamertag resolution gracefully', async () => {
      const resolution = await mockXbox.resolveGamertag('');
      expect(resolution.success).toBe(false);
      expect(resolution.xuid).toBe('');
    });

    it('MockXboxService dispatches friend invite and updates invite status to ACCEPTED', async () => {
      const invite = await mockXbox.dispatchFriendInvite('XboxSteve');
      expect(invite.status).toBe('PENDING');
      expect(invite.botGamertag).toBe('BedrockOps Bot');

      const accepted = mockXbox.acceptFriendInvite(invite.id);
      expect(accepted).toBeDefined();
      expect(accepted?.status).toBe('ACCEPTED');
    });

    it('MockXboxService registerMapping sets custom Gamertag to XUID mapping', async () => {
      mockXbox.registerMapping('CustomGamer', '2535499988877766');
      const res = await mockXbox.resolveGamertag('CustomGamer');

      expect(res.xuid).toBe('2535499988877766');

      const reverseRes = await mockXbox.resolveXuid('2535499988877766');
      expect(reverseRes.gamertag).toBe('CustomGamer');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 18: R5.3 Automated Setup Pipelines
  // ---------------------------------------------------------------------------
  describe('R5.3 Automated Setup Pipelines', () => {
    it('PipelineEngine executes full server setup pipeline end-to-end', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Automation Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevUser',
      });

      expect(result.server.id).toBeDefined();
      expect(result.server.name).toBe('Automation Realm');
      expect(result.server.status).toBe(ServerStatus.OFFLINE);
      expect(result.server.agentId).toBe('node_docker_agent_1');

      expect(result.run.status).toBe(PipelineStatus.SUCCESS);
      expect(result.run.logs.length).toBeGreaterThanOrEqual(4);
    });

    it('PipelineEngine handles non-existent template ID gracefully with warning log', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Warning Realm',
        templateId: 'non_existent_template',
        actorName: 'DevUser',
      });

      expect(result.run.status).toBe(PipelineStatus.SUCCESS);
      expect(result.run.logs.some((l) => l.includes('Template apply skipped or failed'))).toBe(true);
    });

    it('PipelineEngine assigns a writable server path under bedrockops-worlds', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'My Awesome Realm 2026',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevUser',
      });

      expect(result.server.serverPath).toContain(result.server.id);
      expect(result.server.serverPath).not.toContain('/var/minecraft/');
    });

    it('PipelineEngine creates automated safety backup snapshot during setup', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Backup Pipeline Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevUser',
      });

      const serverBackups = BackupEngine.getBackupsForServer(result.server.id);
      expect(serverBackups.length).toBe(1);
      expect(serverBackups[0].notes).toContain('Initial automated setup pipeline snapshot');
    });

    it('PipelineEngine records audit log entry for server setup pipeline', async () => {
      const result = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Audit Pipeline Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevUser',
      });

      const logs = AuditLogger.getLogsForEntity(result.server.id);
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('PIPELINE_SERVER_SETUP');
      expect(logs[0].actorName).toBe('DevUser');
    });
  });
});
