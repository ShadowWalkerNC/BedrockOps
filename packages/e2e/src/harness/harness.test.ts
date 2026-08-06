import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MockAgentServer,
  MockBdsLogStreamer,
  MockXboxService,
  MockDnsProvider,
  AgentFrame,
  LogStreamEntry,
} from './index';

describe('E2E Test Harness Mocks Unit Tests', () => {
  describe('MockAgentServer', () => {
    let agentServer: MockAgentServer;

    beforeEach(() => {
      agentServer = new MockAgentServer();
    });

    it('manages node connection lifecycle state', () => {
      expect(agentServer.isConnected('node-1')).toBe(false);

      agentServer.connect('node-1');
      expect(agentServer.isConnected('node-1')).toBe(true);

      agentServer.disconnect('node-1');
      expect(agentServer.isConnected('node-1')).toBe(false);
    });

    it('dispatches and records WebSocket frames with history filtering', () => {
      const receivedFrames: AgentFrame[] = [];
      const unsubscribe = agentServer.onMessage((frame) => {
        receivedFrames.push(frame);
      });

      agentServer.sendFrame({
        type: 'HEARTBEAT',
        nodeId: 'node-1',
        serverId: 'server-1',
        payload: { uptime: 100 },
      });

      agentServer.sendFrame({
        type: 'METRICS',
        nodeId: 'node-1',
        serverId: 'server-2',
        payload: { cpu: 10 },
      });

      expect(receivedFrames.length).toBe(2);

      const heartbeatHistory = agentServer.getFrameHistory({ type: 'HEARTBEAT' });
      expect(heartbeatHistory.length).toBe(1);
      expect(heartbeatHistory[0].serverId).toBe('server-1');

      const server2History = agentServer.getFrameHistory({ serverId: 'server-2' });
      expect(server2History.length).toBe(1);
      expect(server2History[0].type).toBe('METRICS');

      unsubscribe();
    });

    it('handles server lifecycle state transitions', () => {
      expect(agentServer.getServerState('server-1')).toBe('OFFLINE');

      agentServer.setServerState('server-1', 'STARTING');
      expect(agentServer.getServerState('server-1')).toBe('STARTING');

      agentServer.setServerState('server-1', 'ONLINE');
      expect(agentServer.getServerState('server-1')).toBe('ONLINE');

      agentServer.setServerState('server-1', 'STOPPING');
      expect(agentServer.getServerState('server-1')).toBe('STOPPING');
    });

    it('atomically synchronizes allowlist.json entries', () => {
      const syncResult = agentServer.syncAllowlist('server-1', [
        { name: 'Steve', xuid: '2535400000000001', ignoresPlayerLimit: true },
        { name: 'Alex', xuid: '2535400000000002' },
      ]);

      expect(syncResult.success).toBe(true);
      expect(syncResult.entriesCount).toBe(2);

      const allowlist = agentServer.getAllowlist('server-1');
      expect(allowlist.length).toBe(2);
      expect(agentServer.hasAllowlistEntry('server-1', 'Steve')).toBe(true);
      expect(agentServer.hasAllowlistEntry('server-1', '2535400000000002')).toBe(true);
      expect(agentServer.hasAllowlistEntry('server-1', 'NonExistent')).toBe(false);
    });

    it('scrapes telemetry metrics and triggers streaming backup sequence', () => {
      agentServer.setServerState('server-1', 'ONLINE');

      const telemetryFrame = agentServer.generateTelemetry('node-1', 'server-1');
      expect(telemetryFrame.type).toBe('METRICS');
      expect(telemetryFrame.payload.cpuPercent).toBe(12.5);
      expect(telemetryFrame.payload.memoryUsageMB).toBe(1024);

      const backupFrames = agentServer.triggerBackupSequence('node-1', 'server-1', 'backup-123');
      expect(backupFrames.length).toBe(3);
      expect(backupFrames[0].type).toBe('BACKUP_START');
      expect(backupFrames[1].type).toBe('BACKUP_PROGRESS');
      expect(backupFrames[2].type).toBe('BACKUP_COMPLETE');
    });
  });

  describe('MockBdsLogStreamer', () => {
    let streamer: MockBdsLogStreamer;

    beforeEach(() => {
      streamer = new MockBdsLogStreamer();
    });

    it('emits player join and disconnect events with correct BDS log formatting', () => {
      const logs: LogStreamEntry[] = [];
      streamer.onLogLine((entry) => logs.push(entry));

      const joinEntry = streamer.emitPlayerJoin('server-1', 'SteveCraft', '2535411111111111');
      expect(joinEntry.type).toBe('JOIN');
      expect(joinEntry.rawLine).toContain('Player connected: SteveCraft, xuid: 2535411111111111');

      const leaveEntry = streamer.emitPlayerDisconnect('server-1', 'SteveCraft', '2535411111111111');
      expect(leaveEntry.type).toBe('DISCONNECT');
      expect(leaveEntry.rawLine).toContain('Player disconnected: SteveCraft, xuid: 2535411111111111');

      expect(logs.length).toBe(2);
      expect(streamer.getLogHistory('server-1').length).toBe(2);
    });

    it('parses player join, disconnect, and save query log lines accurately', () => {
      const joinLine = '[2026-08-06 04:55:00:123 INFO] Player connected: AlexMaster, xuid: 2535422222222222';
      const parsedJoin = MockBdsLogStreamer.parseJoinLog(joinLine);
      expect(parsedJoin).toEqual({
        gamertag: 'AlexMaster',
        xuid: '2535422222222222',
      });

      const disconnectLine = '[2026-08-06 04:56:00:456 INFO] Player disconnected: AlexMaster, xuid: 2535422222222222';
      const parsedDisconnect = MockBdsLogStreamer.parseDisconnectLog(disconnectLine);
      expect(parsedDisconnect).toEqual({
        gamertag: 'AlexMaster',
        xuid: '2535422222222222',
      });

      const saveQueryLine = 'bedrock_level/db/000005.ldb:1048576, bedrock_level/level.dat:2048';
      const parsedSaveQuery = MockBdsLogStreamer.parseSaveQueryLog(saveQueryLine);
      expect(parsedSaveQuery?.files.length).toBe(2);
      expect(parsedSaveQuery?.files[0]).toEqual({ path: 'bedrock_level/db/000005.ldb', size: 1048576 });
      expect(parsedSaveQuery?.files[1]).toEqual({ path: 'bedrock_level/level.dat', size: 2048 });
    });

    it('emits startup, shutdown, and save hold log sequences', () => {
      const startupEntries = streamer.emitStartupSequence('server-1', 19132, '1.20.80.01');
      expect(startupEntries.length).toBe(4);
      expect(startupEntries[3].rawLine).toContain('Server started.');

      const saveHoldEntries = streamer.emitSaveHoldSequence('server-1');
      expect(saveHoldEntries.length).toBe(2);
      expect(saveHoldEntries[0].type).toBe('SAVE_HOLD');

      const shutdownEntries = streamer.emitShutdownSequence('server-1');
      expect(shutdownEntries.length).toBe(2);
      expect(shutdownEntries[1].rawLine).toContain('Server stopped.');
    });
  });

  describe('MockXboxService', () => {
    let xboxService: MockXboxService;

    beforeEach(() => {
      xboxService = new MockXboxService();
    });

    it('resolves Gamertag to deterministic 64-bit XUID string', async () => {
      const res1 = await xboxService.resolveGamertag('SteveCraft');
      expect(res1.success).toBe(true);
      expect(res1.gamertag).toBe('SteveCraft');
      expect(res1.xuid).toMatch(/^25354\d{11}$/);

      // Verify deterministic response
      const res2 = await xboxService.resolveGamertag('SteveCraft');
      expect(res2.xuid).toBe(res1.xuid);
    });

    it('supports custom Gamertag to XUID mappings and reverse lookup', async () => {
      xboxService.registerMapping('CustomGamer', '2535499999999999');

      const res = await xboxService.resolveGamertag('CustomGamer');
      expect(res.xuid).toBe('2535499999999999');

      const reverseRes = await xboxService.resolveXuid('2535499999999999');
      expect(reverseRes.gamertag).toBe('CustomGamer');
    });

    it('dispatches and updates Xbox Friend Bot invitations', async () => {
      const invite = await xboxService.dispatchFriendInvite('ConsolePlayer1');
      expect(invite.status).toBe('PENDING');
      expect(invite.botGamertag).toBe('BedrockOps Bot');

      const accepted = xboxService.acceptFriendInvite(invite.id);
      expect(accepted?.status).toBe('ACCEPTED');

      const history = xboxService.getInviteHistory({ status: 'ACCEPTED' });
      expect(history.length).toBe(1);
      expect(history[0].gamertag).toBe('ConsolePlayer1');
    });
  });

  describe('MockDnsProvider', () => {
    let dnsProvider: MockDnsProvider;

    beforeEach(() => {
      dnsProvider = new MockDnsProvider('play.bedrockops.io');
    });

    it('provisions subdomain creating A and SRV DNS records', () => {
      const result = dnsProvider.provisionSubdomain('realm1', '192.168.1.50', 19134);

      expect(result.subdomain).toBe('realm1');
      expect(result.fqdn).toBe('realm1.play.bedrockops.io');
      expect(result.aRecord.type).toBe('A');
      expect(result.aRecord.content).toBe('192.168.1.50');
      expect(result.srvRecord.type).toBe('SRV');
      expect(result.srvRecord.port).toBe(19134);

      const records = dnsProvider.getRecordBySubdomain('realm1');
      expect(records.length).toBe(2);
    });

    it('verifies record routing and handles record deletion', () => {
      dnsProvider.provisionSubdomain('sub2', '10.0.0.1', 19135);

      const verification = dnsProvider.verifyRecordRouting('sub2.play.bedrockops.io', 19135);
      expect(verification.valid).toBe(true);

      const delResult = dnsProvider.deleteSubdomain('sub2');
      expect(delResult.deletedCount).toBe(2);

      const postDelVerification = dnsProvider.verifyRecordRouting('sub2.play.bedrockops.io');
      expect(postDelVerification.valid).toBe(false);
    });
  });
});
