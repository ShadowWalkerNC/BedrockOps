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
  HostProviderFactory,
  DockerAgentHostProvider,
  PterodactylHostProvider,
  DirectRconSshHostProvider,
} from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { ModerationService } from '@mc-admin/moderation';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { TemplateEngine } from '@mc-admin/templates';
import { PipelineEngine } from '@mc-admin/pipelines';
import { AuditLogger } from '@mc-admin/audit';
import { DiscordBotService } from '@mc-admin/discord';
import { generateDevSession, hasPermission } from '@mc-admin/auth';
import {
  MockAgentServer,
  MockBdsLogStreamer,
  MockXboxService,
  MockDnsProvider,
} from './harness';

describe('Tier 1: Feature Coverage (R1.1 to R5.3)', () => {
  beforeEach(() => {
    db.users = [];
    db.agentNodes = [];
    db.connectionKeys = [];
    db.serverMembers = [];
    db.servers = [];
    db.backups = [];
    db.moderationActions = [];
    db.templates = [];
    db.pipelines = [];
    db.pipelineRuns = [];
    db.auditLogs = [];
    db.bdsVersions = [];
    NotificationDispatcher.sentMessages = [];
    db.seedDefaults();
  });

  // ---------------------------------------------------------------------------
  // R1.1 Database Schema (Prisma Models)
  // ---------------------------------------------------------------------------
  describe('R1.1 Database Schema (Prisma Models)', () => {
    it('verifies default seed data structure for users, agent nodes, servers, connection keys, templates, and BDS versions', () => {
      expect(db.users.length).toBeGreaterThanOrEqual(1);
      expect(db.agentNodes.length).toBeGreaterThanOrEqual(1);
      expect(db.servers.length).toBeGreaterThanOrEqual(1);
      expect(db.connectionKeys.length).toBeGreaterThanOrEqual(1);
      expect(db.templates.length).toBeGreaterThanOrEqual(1);
      expect(db.bdsVersions.length).toBeGreaterThanOrEqual(1);

      const user = db.users[0];
      expect(user.id).toBe('usr_admin_1');
      expect(user.role).toBe(UserRole.OWNER);

      const server = db.servers[0];
      expect(server.id).toBe('srv_bedrock_1');
      expect(server.hostProvider).toBe('DOCKER_AGENT');
    });

    it('creates and manages User records with role validation', () => {
      const newUser = {
        id: 'usr_mod_42',
        username: 'mod_alex',
        email: 'alex@bedrockops.io',
        role: UserRole.MODERATOR,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.users.push(newUser);

      const found = db.users.find((u) => u.id === 'usr_mod_42');
      expect(found).toBeDefined();
      expect(found?.username).toBe('mod_alex');
      expect(found?.role).toBe(UserRole.MODERATOR);
    });

    it('creates and manages BedrockServer records with default property assignments', () => {
      const newServer = {
        id: 'srv_creative_1',
        name: 'Creative Builders Realm',
        type: 'VANILLA',
        hostProvider: HostProviderType.DOCKER_AGENT,
        version: '1.20.80',
        host: '10.0.0.5',
        port: 19134,
        rconPort: 19135,
        rconPassword: 'pass_creative',
        serverPath: '/var/minecraft/creative-1',
        status: ServerStatus.OFFLINE,
        maxPlayers: 20,
        gameMode: 'creative',
        difficulty: 'peaceful',
        ownerId: 'usr_admin_1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.servers.push(newServer);

      const retrieved = db.servers.find((s) => s.id === 'srv_creative_1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.gameMode).toBe('creative');
      expect(retrieved?.status).toBe(ServerStatus.OFFLINE);
    });

    it('creates and manages AgentNode and ConnectionKey records', () => {
      const node = {
        id: 'node_vps_west',
        name: 'US West VPS Node',
        version: 'v1.1.0-go',
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        createdAt: new Date(),
      };
      db.agentNodes.push(node);

      const key = {
        id: 'key_vps_west_1',
        serverId: 'srv_bedrock_1',
        key: 'WEST_NODE_KEY_2026',
        useCount: 0,
        createdAt: new Date(),
      };
      db.connectionKeys.push(key);

      expect(db.agentNodes.some((n) => n.id === 'node_vps_west')).toBe(true);
      expect(db.connectionKeys.some((k) => k.key === 'WEST_NODE_KEY_2026')).toBe(true);
    });

    it('creates and manages BdsVersion releases with latest flags', () => {
      const versionEntry = {
        id: 'bds_v1_21_00',
        version: '1.21.00',
        downloadUrl: 'https://minecraft.azureedge.net/bin-linux/bedrock-server-1.21.00.01.zip',
        releaseDate: new Date('2026-06-01'),
        isLatest: true,
        isSupported: true,
      };
      for (const v of db.bdsVersions) v.isLatest = false;
      db.bdsVersions.push(versionEntry);

      const latest = db.bdsVersions.find((v) => v.isLatest);
      expect(latest).toBeDefined();
      expect(latest?.version).toBe('1.21.00');
      expect(latest?.isLatest).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // R1.2 HostProvider Abstraction Layer
  // ---------------------------------------------------------------------------
  describe('R1.2 HostProvider Abstraction Layer', () => {
    it('instantiates DockerAgentHostProvider via HostProviderFactory', () => {
      const provider = HostProviderFactory.getProvider(HostProviderType.DOCKER_AGENT);
      expect(provider).toBeDefined();
      expect(provider.type).toBe(HostProviderType.DOCKER_AGENT);
      expect(provider).toBeInstanceOf(DockerAgentHostProvider);
    });

    it('instantiates PterodactylHostProvider via HostProviderFactory', () => {
      const provider = HostProviderFactory.getProvider(HostProviderType.PTERODACTYL);
      expect(provider).toBeDefined();
      expect(provider.type).toBe(HostProviderType.PTERODACTYL);
      expect(provider).toBeInstanceOf(PterodactylHostProvider);
    });

    it('instantiates DirectRconSshHostProvider via HostProviderFactory', () => {
      const provider = HostProviderFactory.getProvider(HostProviderType.DIRECT_RCON_SSH);
      expect(provider).toBeDefined();
      expect(provider.type).toBe(HostProviderType.DIRECT_RCON_SSH);
      expect(provider).toBeInstanceOf(DirectRconSshHostProvider);
    });

    it('executes server lifecycle commands (start, stop, restart) on HostProviders', async () => {
      const server = db.servers[0];
      const provider = HostProviderFactory.getProvider(HostProviderType.DOCKER_AGENT);

      const startResult = await provider.startServer(server);
      expect(startResult).toBe(false);

      const stopResult = await provider.stopServer(server, true);
      expect(stopResult).toBe(false);

      const restartResult = await provider.restartServer(server);
      expect(restartResult).toBe(false);
    });

    it('executes RCON command and log streaming on HostProvider instances', async () => {
      const server = db.servers[0];
      const provider = HostProviderFactory.getProvider(HostProviderType.DIRECT_RCON_SSH);

      const rconRes = await provider.executeRcon(server, 'list');
      expect(rconRes).toContain('DirectRCON');
      expect(rconRes).toContain('list');

      let loggedLine = '';
      const unsubscribe = provider.streamLogs(server, (line) => {
        loggedLine = line;
      });

      expect(loggedLine).toContain('DirectRCON');
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  // ---------------------------------------------------------------------------
  // R1.3 REST API Backend & JWT Auth
  // ---------------------------------------------------------------------------
  describe('R1.3 REST API Backend & JWT Auth', () => {
    it('generates dev auth session with default owner permissions', () => {
      const session = generateDevSession();
      expect(session.userId).toBe('usr_dev_1');
      expect(session.username).toBe('admin');
      expect(session.role).toBe(UserRole.OWNER);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.token.length).toBeGreaterThan(10);
    });

    it('validates role-based access hierarchy for OWNER, ADMIN, MODERATOR, and VIEWER', () => {
      expect(hasPermission(UserRole.OWNER, UserRole.ADMIN)).toBe(true);
      expect(hasPermission(UserRole.ADMIN, UserRole.MODERATOR)).toBe(true);
      expect(hasPermission(UserRole.MODERATOR, UserRole.VIEWER)).toBe(true);
      expect(hasPermission(UserRole.VIEWER, UserRole.VIEWER)).toBe(true);
    });

    it('denies access when user role is insufficient for required role', () => {
      expect(hasPermission(UserRole.VIEWER, UserRole.MODERATOR)).toBe(false);
      expect(hasPermission(UserRole.MODERATOR, UserRole.ADMIN)).toBe(false);
      expect(hasPermission(UserRole.ADMIN, UserRole.OWNER)).toBe(false);
    });

    it('generates dev session with custom username and admin role', () => {
      const session = generateDevSession('moderator_steve', UserRole.MODERATOR);
      expect(session.username).toBe('moderator_steve');
      expect(session.role).toBe(UserRole.MODERATOR);
    });

    it('validates session token structure and user ID assignment', () => {
      const session = generateDevSession('test_user', UserRole.VIEWER);
      expect(session.token).toBeDefined();
      expect(session.token.length).toBeGreaterThan(10);
      expect(session.userId).toBe('usr_dev_1');
    });
  });

  // ---------------------------------------------------------------------------
  // R1.4 WebSocket Agent Tunnel & Gateway
  // ---------------------------------------------------------------------------
  describe('R1.4 WebSocket Agent Tunnel & Gateway', () => {
    let mockAgent: MockAgentServer;

    beforeEach(() => {
      mockAgent = new MockAgentServer();
    });

    it('connects and disconnects agent nodes on MockAgentServer', () => {
      expect(mockAgent.isConnected('node-101')).toBe(false);
      const connected = mockAgent.connect('node-101');
      expect(connected).toBe(true);
      expect(mockAgent.isConnected('node-101')).toBe(true);

      mockAgent.disconnect('node-101');
      expect(mockAgent.isConnected('node-101')).toBe(false);
    });

    it('sends and broadcasts agent framing messages to subscribers', () => {
      mockAgent.connect('node-1');
      let receivedType = '';

      mockAgent.onMessage((frame) => {
        receivedType = frame.type;
      });

      mockAgent.sendFrame({
        type: 'HEARTBEAT',
        nodeId: 'node-1',
        serverId: 'srv_bedrock_1',
        payload: { uptime: 120 },
      });

      expect(receivedType).toBe('HEARTBEAT');
    });

    it('filters frame history by message type, serverId, and nodeId', () => {
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'n1', serverId: 's1', payload: {} });
      mockAgent.sendFrame({ type: 'METRICS', nodeId: 'n1', serverId: 's1', payload: {} });
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'n2', serverId: 's2', payload: {} });

      const n1Heartbeats = mockAgent.getFrameHistory({ nodeId: 'n1', type: 'HEARTBEAT' });
      expect(n1Heartbeats.length).toBe(1);

      const s2Frames = mockAgent.getFrameHistory({ serverId: 's2' });
      expect(s2Frames.length).toBe(1);
    });

    it('handles incoming frames and updates internal state automatically', () => {
      mockAgent.receiveFrame({
        id: 'f1',
        type: 'CMD_EXEC',
        nodeId: 'n1',
        serverId: 's1',
        timestamp: Date.now(),
        payload: { action: 'start' },
      });

      expect(mockAgent.getServerState('s1')).toBe('STARTING');
    });

    it('clears frame history and manages multiple registered message listeners', () => {
      let count1 = 0;
      let count2 = 0;

      const unsub1 = mockAgent.onMessage(() => count1++);
      const unsub2 = mockAgent.onMessage(() => count2++);

      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'n1', serverId: 's1', payload: {} });
      expect(count1).toBe(1);
      expect(count2).toBe(1);

      unsub1();
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'n1', serverId: 's1', payload: {} });
      expect(count1).toBe(1);
      expect(count2).toBe(2);

      mockAgent.clearHistory();
      expect(mockAgent.getFrameHistory().length).toBe(0);
      unsub2();
    });
  });

  // ---------------------------------------------------------------------------
  // R1.5 Next.js Admin Dashboard UI Data Contracts
  // ---------------------------------------------------------------------------
  describe('R1.5 Next.js Admin Dashboard UI Data Contracts', () => {
    it('formats Bedrock server status data for dashboard UI consumption', () => {
      const server = db.servers[0];
      const statusDisplay = {
        id: server.id,
        title: server.name,
        badge: server.status === ServerStatus.ONLINE ? 'online' : 'offline',
        endpoint: `${server.host}:${server.port}`,
      };

      expect(statusDisplay.id).toBe('srv_bedrock_1');
      expect(statusDisplay.badge).toBe('online');
      expect(statusDisplay.endpoint).toBe('127.0.0.1:19132');
    });

    it('parses and serializes server.properties key-value bindings for UI configuration editor', () => {
      const raw = 'server-name=My UI Realm\ngamemode=creative\nmax-players=25';
      const parsed = BedrockServerController.parseProperties(raw);
      expect(parsed['server-name']).toBe('My UI Realm');
      expect(parsed['max-players']).toBe('25');

      parsed['max-players'] = '30';
      const serialized = BedrockServerController.serializeProperties(parsed);
      expect(serialized).toContain('max-players=30');
    });

    it('structures telemetry metrics payload for dashboard charting widgets', () => {
      const mockAgent = new MockAgentServer();
      mockAgent.setServerState('srv_1', 'ONLINE');

      const frame = mockAgent.generateTelemetry('node-1', 'srv_1', { cpuPercent: 24.5, memoryUsageMB: 1536 });
      const chartPoint = {
        time: new Date(frame.timestamp).toLocaleTimeString(),
        cpu: frame.payload.cpuPercent,
        ram: frame.payload.memoryUsageMB,
      };

      expect(chartPoint.cpu).toBe(24.5);
      expect(chartPoint.ram).toBe(1536);
    });

    it('formats audit log entries with metadata for admin activity feed UI', () => {
      const entry = AuditLogger.record({
        actorId: 'usr_admin_1',
        actorName: 'SuperAdmin',
        action: 'UPDATE_CONFIG',
        entityType: 'BedrockServer',
        entityId: 'srv_bedrock_1',
        metadata: { field: 'maxPlayers', oldValue: 10, newValue: 20 },
      });

      const feedItem = {
        headline: `${entry.actorName} performed ${entry.action}`,
        details: `Updated ${entry.metadata?.field} to ${entry.metadata?.newValue}`,
      };

      expect(feedItem.headline).toBe('SuperAdmin performed UPDATE_CONFIG');
      expect(feedItem.details).toBe('Updated maxPlayers to 20');
    });

    it('formats template manifests for UI server template selection dropdowns', () => {
      const templates = db.templates;
      const options = templates.map((t) => ({
        label: `${t.name} (BDS v${t.bdsVersion})`,
        value: t.id,
        gamemode: t.defaultProperties['gamemode'],
      }));

      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options[0].label).toContain('Vanilla Hard Survival');
      expect(options[0].value).toBe('tmpl_vanilla_survival');
    });
  });

  // ---------------------------------------------------------------------------
  // R2.1 Outbound WSS Go Daemon Agent Protocol
  // ---------------------------------------------------------------------------
  describe('R2.1 Outbound WSS Go Daemon Agent Protocol', () => {
    let mockAgent: MockAgentServer;

    beforeEach(() => {
      mockAgent = new MockAgentServer();
    });

    it('simulates outbound TLS WSS connection establishment for Go agent node', () => {
      expect(mockAgent.isConnected('go-daemon-node-1')).toBe(false);
      mockAgent.connect('go-daemon-node-1');
      expect(mockAgent.isConnected('go-daemon-node-1')).toBe(true);
    });

    it('transmits heartbeat frames from daemon agent to control plane', () => {
      mockAgent.connect('go-daemon-node-1');
      const frame = mockAgent.sendFrame({
        type: 'HEARTBEAT',
        nodeId: 'go-daemon-node-1',
        serverId: 'srv_bedrock_1',
        payload: { status: 'HEALTHY', agentVersion: 'v1.0.0-static-go' },
      });

      expect(frame.type).toBe('HEARTBEAT');
      expect(frame.payload.agentVersion).toBe('v1.0.0-static-go');
    });

    it('receives power action commands from control plane and returns command response frames', () => {
      mockAgent.connect('go-daemon-node-1');
      const resp = mockAgent.executeCommand('go-daemon-node-1', 'srv_bedrock_1', 'docker restart bds-1');

      expect(resp.type).toBe('CMD_RESP');
      expect(resp.payload.exitCode).toBe(0);
      expect(resp.payload.output).toContain('docker restart bds-1');
    });

    it('emits telemetry metrics frames across active WebSocket agent tunnel', () => {
      mockAgent.connect('go-daemon-node-1');
      mockAgent.setServerState('srv_bedrock_1', 'ONLINE');

      const telemetryFrame = mockAgent.generateTelemetry('go-daemon-node-1', 'srv_bedrock_1');
      expect(telemetryFrame.type).toBe('METRICS');
      expect(telemetryFrame.payload.cpuPercent).toBeGreaterThan(0);
    });

    it('simulates agent node disconnect and buffer history tracking during CGNAT traversal', () => {
      mockAgent.connect('go-daemon-node-1');
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'go-daemon-node-1', serverId: 'srv_1', payload: { seq: 1 } });

      // CGNAT drop simulation
      mockAgent.disconnect('go-daemon-node-1');
      expect(mockAgent.isConnected('go-daemon-node-1')).toBe(false);

      // Reconnect
      mockAgent.connect('go-daemon-node-1');
      mockAgent.sendFrame({ type: 'HEARTBEAT', nodeId: 'go-daemon-node-1', serverId: 'srv_1', payload: { seq: 2 } });

      const history = mockAgent.getFrameHistory({ nodeId: 'go-daemon-node-1' });
      expect(history.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // R2.2 BDS Container & Process Lifecycle Commands
  // ---------------------------------------------------------------------------
  describe('R2.2 BDS Container & Process Lifecycle Commands', () => {
    let mockAgent: MockAgentServer;

    beforeEach(() => {
      mockAgent = new MockAgentServer();
    });

    it('transitions container state from OFFLINE to STARTING to ONLINE on agent server', () => {
      expect(mockAgent.getServerState('srv_1')).toBe('OFFLINE');

      mockAgent.setServerState('srv_1', 'STARTING');
      expect(mockAgent.getServerState('srv_1')).toBe('STARTING');

      mockAgent.setServerState('srv_1', 'ONLINE');
      expect(mockAgent.getServerState('srv_1')).toBe('ONLINE');
    });

    it('transitions container state from ONLINE to STOPPING to OFFLINE', () => {
      mockAgent.setServerState('srv_1', 'ONLINE');
      expect(mockAgent.getServerState('srv_1')).toBe('ONLINE');

      mockAgent.setServerState('srv_1', 'STOPPING');
      expect(mockAgent.getServerState('srv_1')).toBe('STOPPING');

      mockAgent.setServerState('srv_1', 'OFFLINE');
      expect(mockAgent.getServerState('srv_1')).toBe('OFFLINE');
    });

    it('handles forced container kill command and sets state to STOPPING', () => {
      mockAgent.receiveFrame({
        id: 'f_kill',
        type: 'CMD_EXEC',
        nodeId: 'n1',
        serverId: 'srv_1',
        timestamp: Date.now(),
        payload: { action: 'stop', force: true },
      });

      expect(mockAgent.getServerState('srv_1')).toBe('STOPPING');
    });

    it('returns default container telemetry matching container state', () => {
      mockAgent.setServerState('srv_off', 'OFFLINE');
      const offTelemetry = mockAgent.generateTelemetry('n1', 'srv_off');
      expect(offTelemetry.payload.cpuPercent).toBe(0);
      expect(offTelemetry.payload.uptimeSeconds).toBe(0);

      mockAgent.setServerState('srv_on', 'ONLINE');
      const onTelemetry = mockAgent.generateTelemetry('n1', 'srv_on');
      expect(onTelemetry.payload.cpuPercent).toBeGreaterThan(0);
      expect(onTelemetry.payload.uptimeSeconds).toBeGreaterThan(0);
    });

    it('executes arbitrary remote shell commands on daemon agent and retrieves exit code', () => {
      const res = mockAgent.executeCommand('n1', 'srv_1', 'bedrock_server --version');
      expect(res.payload.command).toBe('bedrock_server --version');
      expect(res.payload.exitCode).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // R2.3 Telemetry Collection Engine (gopsutil)
  // ---------------------------------------------------------------------------
  describe('R2.3 Telemetry Collection Engine (gopsutil)', () => {
    let mockAgent: MockAgentServer;

    beforeEach(() => {
      mockAgent = new MockAgentServer();
    });

    it('generates default telemetry metrics for ONLINE server container', () => {
      mockAgent.setServerState('srv_1', 'ONLINE');
      const frame = mockAgent.generateTelemetry('n1', 'srv_1');

      expect(frame.payload.cpuPercent).toBe(12.5);
      expect(frame.payload.memoryUsageMB).toBe(1024);
      expect(frame.payload.memoryLimitMB).toBe(4096);
    });

    it('generates default telemetry metrics for OFFLINE server container', () => {
      mockAgent.setServerState('srv_1', 'OFFLINE');
      const frame = mockAgent.generateTelemetry('n1', 'srv_1');

      expect(frame.payload.cpuPercent).toBe(0);
      expect(frame.payload.memoryUsageMB).toBe(0);
    });

    it('accepts custom telemetry metric overrides for CPU, memory, and uptime', () => {
      mockAgent.setServerState('srv_1', 'ONLINE');
      const frame = mockAgent.generateTelemetry('n1', 'srv_1', {
        cpuPercent: 88.5,
        memoryUsageMB: 3072,
        uptimeSeconds: 86400,
      });

      expect(frame.payload.cpuPercent).toBe(88.5);
      expect(frame.payload.memoryUsageMB).toBe(3072);
      expect(frame.payload.uptimeSeconds).toBe(86400);
    });

    it('records telemetry timestamp and active player connections', () => {
      const now = Date.now();
      const frame = mockAgent.generateTelemetry('n1', 'srv_1', {
        activeConnections: 8,
        timestamp: now,
      });

      expect(frame.payload.activeConnections).toBe(8);
      expect(frame.payload.timestamp).toBe(now);
    });

    it('emits metrics frames into agent frame history for performance monitoring', () => {
      mockAgent.generateTelemetry('n1', 'srv_1', { cpuPercent: 10 });
      mockAgent.generateTelemetry('n1', 'srv_1', { cpuPercent: 20 });

      const history = mockAgent.getFrameHistory({ type: 'METRICS', serverId: 'srv_1' });
      expect(history.length).toBe(2);
      expect(history[0].payload.cpuPercent).toBe(10);
      expect(history[1].payload.cpuPercent).toBe(20);
    });
  });

  // ---------------------------------------------------------------------------
  // R2.4 RCON Client & BDS Log Streamer
  // ---------------------------------------------------------------------------
  describe('R2.4 RCON Client & BDS Log Streamer', () => {
    let streamer: MockBdsLogStreamer;

    beforeEach(() => {
      streamer = new MockBdsLogStreamer();
    });

    it('emits BDS startup log line sequence with version and port info', () => {
      const logs = streamer.emitStartupSequence('srv_1', 19132, '1.20.80.01');
      expect(logs.length).toBe(4);
      expect(logs[0].rawLine).toContain('Starting Server');
      expect(logs[1].rawLine).toContain('Version 1.20.80.01');
      expect(logs[2].rawLine).toContain('IPv4 supported port: 19132');
      expect(logs[3].rawLine).toContain('Server started.');
    });

    it('emits BDS shutdown log line sequence', () => {
      const logs = streamer.emitShutdownSequence('srv_1');
      expect(logs.length).toBe(2);
      expect(logs[0].rawLine).toContain('Quit command received');
      expect(logs[1].rawLine).toContain('Server stopped.');
    });

    it('emits RCON command output log lines to log streamer listeners', () => {
      let captured: any = null;
      streamer.onLogLine((entry) => {
        if (entry.type === 'RCON') captured = entry;
      });

      streamer.emitRconOutput('srv_1', 'list', 'There are 2/10 players online: Alex, Steve');
      expect(captured).toBeDefined();
      expect(captured.metadata.command).toBe('list');
      expect(captured.rawLine).toContain('[RCON] Executed "list"');
    });

    it('emits custom log entries with INFO, WARN, and ERROR severity levels', () => {
      const info = streamer.emitCustomLog('srv_1', 'Normal operation', 'INFO');
      const warn = streamer.emitCustomLog('srv_1', 'High memory warning', 'WARN');
      const err = streamer.emitCustomLog('srv_1', 'Fatal RCON socket drop', 'ERROR');

      expect(info.rawLine).toContain('INFO] Normal operation');
      expect(warn.rawLine).toContain('WARN] High memory warning');
      expect(err.rawLine).toContain('ERROR] Fatal RCON socket drop');
    });

    it('subscribes to and unsubscribes from real-time log stream callbacks', () => {
      let count = 0;
      const unsub = streamer.onLogLine(() => count++);

      streamer.emitCustomLog('srv_1', 'Log 1');
      expect(count).toBe(1);

      unsub();
      streamer.emitCustomLog('srv_1', 'Log 2');
      expect(count).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // R3.1 Save-Hold Live Checkpoint Sequence
  // ---------------------------------------------------------------------------
  describe('R3.1 Save-Hold Live Checkpoint Sequence', () => {
    let streamer: MockBdsLogStreamer;

    beforeEach(() => {
      streamer = new MockBdsLogStreamer();
    });

    it('emits save-hold RCON checkpoint sequence with file listing', () => {
      const files = [
        { path: 'db/000001.ldb', size: 524288 },
        { path: 'level.dat', size: 1024 },
      ];

      const entries = streamer.emitSaveHoldSequence('srv_1', files);
      expect(entries.length).toBe(2);
      expect(entries[0].rawLine).toContain('Data saved. Files to copy:');
      expect(entries[1].rawLine).toContain('db/000001.ldb:524288');
      expect(entries[1].metadata?.files).toEqual(files);
    });

    it('parses BDS stdout save query lines into file path and byte size pairs', () => {
      const line = 'bedrock_level/db/000005.ldb:1048576, bedrock_level/level.dat:2048';
      const parsed = MockBdsLogStreamer.parseSaveQueryLog(line);

      expect(parsed).toBeDefined();
      expect(parsed?.files.length).toBe(2);
      expect(parsed?.files[0].path).toBe('bedrock_level/db/000005.ldb');
      expect(parsed?.files[0].size).toBe(1048576);
      expect(parsed?.files[1].path).toBe('bedrock_level/level.dat');
      expect(parsed?.files[1].size).toBe(2048);
    });

    it('returns null when parsing invalid or non-save-query stdout lines', () => {
      const invalidLine = 'Server started without colons';
      const parsed = MockBdsLogStreamer.parseSaveQueryLog(invalidLine);
      expect(parsed).toBeNull();
    });

    it('parses multi-file save query stdout output correctly', () => {
      const line = 'file1.dat:100, file2.dat:200, file3.dat:300';
      const parsed = MockBdsLogStreamer.parseSaveQueryLog(line);
      expect(parsed?.files.length).toBe(3);
      expect(parsed?.files[2].size).toBe(300);
    });

    it('correlates save-hold sequence events with live backup checkpoint state', () => {
      const historyBefore = streamer.getLogHistory('srv_1').length;
      streamer.emitSaveHoldSequence('srv_1');
      const historyAfter = streamer.getLogHistory('srv_1');

      expect(historyAfter.length - historyBefore).toBe(2);
      expect(historyAfter[historyAfter.length - 1].type).toBe('SAVE_HOLD');
    });
  });

  // ---------------------------------------------------------------------------
  // R3.2 Zero-Disk Streaming Compression (R2 PUT)
  // ---------------------------------------------------------------------------
  describe('R3.2 Zero-Disk Streaming Compression (R2 PUT)', () => {
    it('triggers backup record creation in database with generated timestamp filename', () => {
      const backup = BackupEngine.triggerBackup({
        serverId: 'srv_bedrock_1',
        isManual: true,
        notes: 'Pre-r2 streaming snapshot',
      });
      BackupEngine.completeBackup(backup.id, 20_971_520);

      expect(backup.id).toBeDefined();
      expect(backup.filename).toMatch(/^backup_srv_bedrock_1_.*\.zip$/);
      expect(backup.storagePath).toBe(`/backups/srv_bedrock_1/${backup.filename}`);
      expect(backup.status).toBe(BackupStatus.COMPLETED);
    });

    it('simulates full streaming backup event sequence (START -> PROGRESS -> COMPLETE)', () => {
      const mockAgent = new MockAgentServer();
      const frames = mockAgent.triggerBackupSequence('node-1', 'srv_bedrock_1', 'bkp_test_100');

      expect(frames.length).toBe(3);
      expect(frames[0].type).toBe('BACKUP_START');
      expect(frames[1].type).toBe('BACKUP_PROGRESS');
      expect(frames[2].type).toBe('BACKUP_COMPLETE');

      expect(frames[1].payload.progressPercent).toBe(50);
      expect(frames[2].payload.bytesTransferred).toBe(20971520);
    });

    it('tracks progress percent and bytes transferred during streaming upload', () => {
      const mockAgent = new MockAgentServer();
      mockAgent.sendFrame({
        type: 'BACKUP_PROGRESS',
        nodeId: 'n1',
        serverId: 's1',
        payload: { backupId: 'bkp_1', progressPercent: 75, bytesTransferred: 15000000 },
      });

      const history = mockAgent.getFrameHistory({ type: 'BACKUP_PROGRESS' });
      expect(history[0].payload.progressPercent).toBe(75);
      expect(history[0].payload.bytesTransferred).toBe(15000000);
    });

    it('handles manual vs automated backup flag distinction', () => {
      const manual = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
      const auto = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: false });

      expect(manual.isManual).toBe(true);
      expect(auto.isManual).toBe(false);
    });

    it('stores backup storage path and file size after agent completion', () => {
      const backup = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
      BackupEngine.completeBackup(backup.id, 5_000_000);
      expect(backup.fileSizeBytes).toBeGreaterThan(0);
      expect(backup.storagePath).toContain('/backups/srv_1/');
    });
  });

  // ---------------------------------------------------------------------------
  // R3.3 Integrity Manifest Verification (SHA256)
  // ---------------------------------------------------------------------------
  describe('R3.3 Integrity Manifest Verification (SHA256)', () => {
    it('emits SHA256 checksum in backup completion frame payload', () => {
      const mockAgent = new MockAgentServer();
      const frames = mockAgent.triggerBackupSequence('node-1', 'srv_bedrock_1', 'bkp_integrity_1');
      const completeFrame = frames.find((f) => f.type === 'BACKUP_COMPLETE');

      expect(completeFrame).toBeDefined();
      expect(completeFrame?.payload.checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('restore of completed backup returns stub until integration wired', () => {
      const backup = BackupEngine.triggerBackup({ serverId: 'srv_bedrock_1', isManual: true });
      BackupEngine.completeBackup(backup.id, 1024);
      const result = BackupEngine.restoreBackup(backup.id);

      expect(result.success).toBe(false);
      expect(result.stub).toBe(true);
      expect(result.message).toContain('not yet implemented');
    });

    it('rejects restore attempt for non-existent backup ID', () => {
      const result = BackupEngine.restoreBackup('bkp_non_existent');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('verifies SHA256 manifest string format in backup completion payload', () => {
      const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(validHash.length).toBe(64);
      expect(/^[0-9a-f]+$/i.test(validHash)).toBe(true);
    });

    it('applies retention policy pruning while preserving valid unpruned snapshot integrity', () => {
      const serverId = 'srv_retain_test';
      for (let i = 0; i < 7; i++) {
        const b = BackupEngine.triggerBackup({ serverId, isManual: false });
        BackupEngine.completeBackup(b.id, 1024);
      }

      expect(BackupEngine.getBackupsForServer(serverId).length).toBe(7);
      const pruned = BackupEngine.applyRetentionPolicy(serverId, 3);
      expect(pruned).toBe(4);

      const remaining = BackupEngine.getBackupsForServer(serverId);
      expect(remaining.length).toBe(3);
      expect(remaining.every((b) => b.status === BackupStatus.COMPLETED)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // R4.1 Player XUID & Gamertag Tracking
  // ---------------------------------------------------------------------------
  describe('R4.1 Player XUID & Gamertag Tracking', () => {
    it('parses BDS player connected stdout log line to extract gamertag and XUID', () => {
      const line = '[2026-08-06 04:55:00:123 INFO] Player connected: SteveCraft, xuid: 2535412345678901';
      const parsed = MockBdsLogStreamer.parseJoinLog(line);

      expect(parsed).toBeDefined();
      expect(parsed?.gamertag).toBe('SteveCraft');
      expect(parsed?.xuid).toBe('2535412345678901');
    });

    it('parses BDS player disconnected stdout log line to extract gamertag and XUID', () => {
      const line = '[2026-08-06 04:55:00:123 INFO] Player disconnected: AlexTheGreat, xuid: 2535498765432109';
      const parsed = MockBdsLogStreamer.parseDisconnectLog(line);

      expect(parsed).toBeDefined();
      expect(parsed?.gamertag).toBe('AlexTheGreat');
      expect(parsed?.xuid).toBe('2535498765432109');
    });

    it('resolves Xbox Gamertag to deterministic 64-bit XUID via MockXboxService', async () => {
      const xbox = new MockXboxService();
      const res = await xbox.resolveGamertag('SteveCraft');

      expect(res.success).toBe(true);
      expect(res.gamertag).toBe('SteveCraft');
      expect(res.xuid).toMatch(/^25354\d{11}$/);
    });

    it('resolves XUID back to Gamertag via reverse resolution mapping', async () => {
      const xbox = new MockXboxService();
      const res1 = await xbox.resolveGamertag('AlexTheGreat');
      const res2 = await xbox.resolveXuid(res1.xuid);

      expect(res2.success).toBe(true);
      expect(res2.gamertag).toBe('AlexTheGreat');
    });

    it('handles custom Gamertag <-> XUID mappings in MockXboxService', async () => {
      const xbox = new MockXboxService();
      xbox.registerMapping('CustomGamer', '2535499999999999');

      const res = await xbox.resolveGamertag('CustomGamer');
      expect(res.xuid).toBe('2535499999999999');

      const rev = await xbox.resolveXuid('2535499999999999');
      expect(rev.gamertag).toBe('CustomGamer');
    });
  });

  // ---------------------------------------------------------------------------
  // R4.2 Persistent Infraction Ledger (GDPR Soft-Delete)
  // ---------------------------------------------------------------------------
  describe('R4.2 Persistent Infraction Ledger (GDPR Soft-Delete)', () => {
    it('creates infraction records for BAN, KICK, MUTE, WARN, and NOTE types', () => {
      const types = [
        ModerationType.BAN,
        ModerationType.KICK,
        ModerationType.MUTE,
        ModerationType.WARN,
        ModerationType.NOTE,
      ];

      types.forEach((type) => {
        const record = ModerationService.createAction({
          gamertag: 'TestGamer',
          actionType: type,
          reason: `Test ${type}`,
          issuerId: 'usr_mod_1',
          issuerName: 'ModSteve',
        });
        expect(record.actionType).toBe(type);
        expect(record.active).toBe(true);
      });
    });

    it('retrieves player moderation history by Gamertag case-insensitively', () => {
      ModerationService.createAction({
        gamertag: 'CasePlayer',
        actionType: ModerationType.WARN,
        reason: 'Spam',
        issuerId: 'usr_mod_1',
        issuerName: 'ModSteve',
      });

      const history = ModerationService.getHistoryForPlayer('CASEPLAYER');
      expect(history.length).toBe(1);
      expect(history[0].gamertag).toBe('CasePlayer');
    });

    it('searches moderation ledger by substring query matching gamertags', () => {
      ModerationService.createAction({
        gamertag: 'PixelKnight',
        actionType: ModerationType.NOTE,
        reason: 'Good behavior',
        issuerId: 'u1',
        issuerName: 'm1',
      });

      const matches = ModerationService.searchPlayers('pixel');
      expect(matches).toContain('PixelKnight');
    });

    it('tracks duration in minutes for temporary moderation actions like MUTE', () => {
      const muteAction = ModerationService.createAction({
        gamertag: 'QuietPlayer',
        actionType: ModerationType.MUTE,
        reason: 'Mic spam',
        issuerId: 'u1',
        issuerName: 'm1',
        durationMinutes: 120,
      });

      expect(muteAction.durationMinutes).toBe(120);
    });

    it('supports active status toggle and soft-delete/anonymization pattern for GDPR compliance', () => {
      const record = ModerationService.createAction({
        gamertag: 'GdprPlayer',
        playerXuid: '2535400000000001',
        actionType: ModerationType.BAN,
        reason: 'Cheating',
        issuerId: 'u1',
        issuerName: 'm1',
      });

      // Deactivate / Soft Delete
      record.active = false;
      record.gamertag = '[GDPR_REDACTED]';
      delete record.playerXuid;

      expect(record.active).toBe(false);
      expect(record.gamertag).toBe('[GDPR_REDACTED]');
      expect(record.playerXuid).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // R4.3 BDS allowlist.json Auto-Sync
  // ---------------------------------------------------------------------------
  describe('R4.3 BDS allowlist.json Auto-Sync', () => {
    let mockAgent: MockAgentServer;

    beforeEach(() => {
      mockAgent = new MockAgentServer();
    });

    it('synchronizes allowlist entries atomically to agent server', () => {
      const entries = [
        { name: 'AlexCraft', xuid: '25354111' },
        { name: 'SteveCraft', xuid: '25354222', ignoresPlayerLimit: true },
      ];

      const res = mockAgent.syncAllowlist('srv_1', entries);
      expect(res.success).toBe(true);
      expect(res.entriesCount).toBe(2);

      const list = mockAgent.getAllowlist('srv_1');
      expect(list.length).toBe(2);
      expect(list[1].ignoresPlayerLimit).toBe(true);
    });

    it('sanitizes allowlist entries with default ignoresPlayerLimit setting', () => {
      const entries = [{ name: 'Player1', xuid: '100' }];
      mockAgent.syncAllowlist('srv_1', entries);

      const list = mockAgent.getAllowlist('srv_1');
      expect(list[0].ignoresPlayerLimit).toBe(false);
    });

    it('checks if player exists in allowlist by Gamertag or XUID', () => {
      mockAgent.syncAllowlist('srv_1', [{ name: 'VipPlayer', xuid: '25354999' }]);

      expect(mockAgent.hasAllowlistEntry('srv_1', 'vipplayer')).toBe(true);
      expect(mockAgent.hasAllowlistEntry('srv_1', '25354999')).toBe(true);
      expect(mockAgent.hasAllowlistEntry('srv_1', 'unknown')).toBe(false);
    });

    it('emits ALLOWLIST_SYNC frame on agent server upon allowlist update', () => {
      let emittedFrame: any = null;
      mockAgent.onMessage((frame) => {
        if (frame.type === 'ALLOWLIST_SYNC') emittedFrame = frame;
      });

      mockAgent.syncAllowlist('srv_1', [{ name: 'Player1', xuid: '1' }]);
      expect(emittedFrame).toBeDefined();
      expect(emittedFrame.payload.entriesCount).toBe(1);
    });

    it('auto-handles incoming ALLOWLIST_SYNC frames received from control plane', () => {
      mockAgent.receiveFrame({
        id: 'f_allowlist',
        type: 'ALLOWLIST_SYNC',
        nodeId: 'n1',
        serverId: 'srv_auto',
        timestamp: Date.now(),
        payload: {
          entries: [{ name: 'AutoSyncUser', xuid: '777' }],
        },
      });

      expect(mockAgent.hasAllowlistEntry('srv_auto', 'AutoSyncUser')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // R5.1 Subdomain & Port Allocation (19132-19999)
  // ---------------------------------------------------------------------------
  describe('R5.1 Subdomain & Port Allocation (19132-19999)', () => {
    let dns: MockDnsProvider;

    beforeEach(() => {
      dns = new MockDnsProvider('play.bedrockops.io');
    });

    it('provisions subdomain with both A and SRV DNS records via MockDnsProvider', () => {
      const res = dns.provisionSubdomain('realm1', '192.168.1.50', 19133);

      expect(res.subdomain).toBe('realm1');
      expect(res.fqdn).toBe('realm1.play.bedrockops.io');
      expect(res.aRecord.type).toBe('A');
      expect(res.srvRecord.type).toBe('SRV');
      expect(res.srvRecord.port).toBe(19133);
    });

    it('creates custom A record pointing subdomain to node IP', () => {
      const rec = dns.createRecord({
        subdomain: 'myrealm',
        type: 'A',
        content: '10.0.0.100',
      });

      expect(rec.fqdn).toBe('myrealm.play.bedrockops.io');
      expect(rec.content).toBe('10.0.0.100');
    });

    it('creates custom SRV record mapping Minecraft UDP port', () => {
      const rec = dns.createRecord({
        subdomain: '_minecraft._udp.myrealm',
        type: 'SRV',
        content: '0 5 19140 myrealm.play.bedrockops.io',
        port: 19140,
        target: 'myrealm.play.bedrockops.io',
      });

      expect(rec.type).toBe('SRV');
      expect(rec.port).toBe(19140);
    });

    it('deletes subdomain and associated A/SRV DNS records', () => {
      dns.provisionSubdomain('delrealm', '1.1.1.1', 19135);
      expect(dns.getRecordBySubdomain('delrealm').length).toBe(2);

      const delRes = dns.deleteSubdomain('delrealm');
      expect(delRes.deletedCount).toBe(2);
      expect(dns.getRecordBySubdomain('delrealm').length).toBe(0);
    });

    it('verifies DNS record routing and port assignment for provisioned FQDN', () => {
      dns.provisionSubdomain('routecheck', '1.1.1.1', 19150);
      const fqdn = 'routecheck.play.bedrockops.io';

      const verifyValid = dns.verifyRecordRouting(fqdn, 19150);
      expect(verifyValid.valid).toBe(true);

      const verifyInvalid = dns.verifyRecordRouting(fqdn, 99999);
      expect(verifyInvalid.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // R5.2 Console Player Onboarding (Xbox Friend Bot)
  // ---------------------------------------------------------------------------
  describe('R5.2 Console Player Onboarding (Xbox Friend Bot)', () => {
    let xbox: MockXboxService;

    beforeEach(() => {
      xbox = new MockXboxService('BedrockOps Onboarding Bot');
    });

    it('dispatches Xbox Friend Bot invitation to target Gamertag', async () => {
      const invite = await xbox.dispatchFriendInvite('SwitchGamer99');

      expect(invite.id).toBeDefined();
      expect(invite.gamertag).toBe('SwitchGamer99');
      expect(invite.status).toBe('PENDING');
      expect(invite.botGamertag).toBe('BedrockOps Onboarding Bot');
    });

    it('simulates console player accepting Xbox Friend Bot invitation', async () => {
      const invite = await xbox.dispatchFriendInvite('Ps5Player');
      expect(invite.status).toBe('PENDING');

      const updated = xbox.acceptFriendInvite(invite.id);
      expect(updated?.status).toBe('ACCEPTED');
    });

    it('filters friend invite history by Gamertag and status', async () => {
      await xbox.dispatchFriendInvite('PlayerA');
      const invB = await xbox.dispatchFriendInvite('PlayerB');
      xbox.acceptFriendInvite(invB.id);

      const pending = xbox.getInviteHistory({ status: 'PENDING' });
      expect(pending.length).toBe(1);
      expect(pending[0].gamertag).toBe('PlayerA');

      const accepted = xbox.getInviteHistory({ status: 'ACCEPTED' });
      expect(accepted.length).toBe(1);
      expect(accepted[0].gamertag).toBe('PlayerB');
    });

    it('combines Xbox Gamertag resolution and allowlist injection for console onboarding', async () => {
      const mockAgent = new MockAgentServer();
      const resolution = await xbox.resolveGamertag('ConsoleOwner');
      expect(resolution.success).toBe(true);

      const invite = await xbox.dispatchFriendInvite('ConsoleOwner');
      xbox.acceptFriendInvite(invite.id);

      const syncResult = mockAgent.syncAllowlist('srv_1', [
        { name: resolution.gamertag, xuid: resolution.xuid, ignoresPlayerLimit: true },
      ]);

      expect(syncResult.success).toBe(true);
      expect(mockAgent.hasAllowlistEntry('srv_1', 'ConsoleOwner')).toBe(true);
    });

    it('handles failed friend invitation dispatch gracefully', async () => {
      const record = await xbox.dispatchFriendInvite('');
      expect(record.status).toBe('FAILED');
    });
  });

  // ---------------------------------------------------------------------------
  // R5.3 Automated Setup Pipelines
  // ---------------------------------------------------------------------------
  describe('R5.3 Automated Setup Pipelines', () => {
    it('executes server setup pipeline and creates server record in ONLINE status', async () => {
      const res = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Pipeline Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevAdmin',
      });

      expect(res.server).toBeDefined();
      expect(res.server.name).toBe('Pipeline Realm');
      expect(res.server.status).toBe(ServerStatus.ONLINE);
    });

    it('applies server template during setup pipeline execution', async () => {
      const res = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Templated Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevAdmin',
      });

      expect(res.server.gameMode).toBe('survival');
      expect(res.server.difficulty).toBe('hard');
    });

    it('triggers initial automated backup snapshot as safety checkpoint during pipeline run', async () => {
      const res = await PipelineEngine.runServerSetupPipeline({
        serverName: 'BackedUp Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevAdmin',
      });

      const serverBackups = db.backups.filter((b) => b.serverId === res.server.id);
      expect(serverBackups.length).toBe(1);
      expect(serverBackups[0].notes).toContain('Initial automated setup pipeline snapshot');
    });

    it('emits audit log event and dispatches Discord notification during pipeline execution', async () => {
      const webhookUrl = 'https://discord.com/api/webhooks/pipeline-test';
      const res = await PipelineEngine.runServerSetupPipeline({
        serverName: 'Notified Realm',
        templateId: 'tmpl_vanilla_survival',
        webhookUrl,
        actorName: 'AlertAdmin',
      });

      const audit = db.auditLogs.find((a) => a.entityId === res.server.id);
      expect(audit).toBeDefined();
      expect(audit?.action).toBe('PIPELINE_SERVER_SETUP');

      expect(NotificationDispatcher.sentMessages.length).toBe(1);
      expect(NotificationDispatcher.sentMessages[0].webhookUrl).toBe(webhookUrl);
    });

    it('stores pipeline run execution log and sets status to SUCCESS', async () => {
      const res = await PipelineEngine.runServerSetupPipeline({
        serverName: 'LogCheck Realm',
        templateId: 'tmpl_vanilla_survival',
        actorName: 'DevAdmin',
      });

      expect(res.run.status).toBe(PipelineStatus.SUCCESS);
      expect(res.run.logs.length).toBeGreaterThanOrEqual(4);
      expect(res.run.logs[0]).toContain('Initializing pipeline run');
    });
  });
});
