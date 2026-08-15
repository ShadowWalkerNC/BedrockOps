import dgram from 'node:dgram';

// RakNet offline ping magic sequence (16 bytes)
const RAKNET_MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');

export interface RakNetPingResult {
  latencyMs: number;
  edition: string;
  motd: string;
  protocolVersion: number;
  versionName: string;
  playerCount: number;
  maxPlayers: number;
  serverGuid: string;
  worldName: string;
  gameMode: string;
  portIpv4: number;
}

export type IssueSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DiagnosticIssue {
  code: string;
  title: string;
  severity: IssueSeverity;
  description: string;
  recommendation: string;
  canAutoFix: boolean;
  autoFixAction?: string;
}

export interface ServerDiagnosticsReport {
  serverId: string;
  serverName: string;
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
  raknet: RakNetPingResult | null;
  process: {
    running: boolean;
    pid?: number;
    memoryMb?: number;
  };
  network: {
    loopbackExempt: boolean;
    onlineMode: boolean;
    port: number;
  };
  issues: DiagnosticIssue[];
}

export class BedrockDiagnostics {
  /**
   * Performs a native RakNet UDP unconnected ping to inspect live server protocol and latency.
   */
  public static pingRakNet(host = '127.0.0.1', port = 19132, timeoutMs = 3000): Promise<RakNetPingResult> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const start = Date.now();

      // ID_UNCONNECTED_PING: 1 byte ID (0x01), 8 bytes timestamp, 16 bytes magic, 8 bytes client GUID
      const pingPacket = Buffer.alloc(1 + 8 + 16 + 8);
      pingPacket.writeUInt8(0x01, 0);
      pingPacket.writeBigInt64BE(BigInt(Date.now()), 1);
      RAKNET_MAGIC.copy(pingPacket, 9);
      pingPacket.writeBigInt64BE(BigInt(12345678), 25);

      const timer = setTimeout(() => {
        try { socket.close(); } catch (_) {}
        reject(new Error(`RakNet UDP ping timed out after ${timeoutMs}ms on ${host}:${port}`));
      }, timeoutMs);

      socket.on('message', (msg) => {
        clearTimeout(timer);
        const latency = Date.now() - start;
        const packetId = msg.readUInt8(0);

        if (packetId === 0x1c) { // ID_UNCONNECTED_PONG
          try {
            const strLen = msg.readUInt16BE(33);
            const pongData = msg.subarray(35, 35 + strLen).toString('utf8');
            const parts = pongData.split(';');
            socket.close();

            resolve({
              latencyMs: latency,
              edition: parts[0] || 'MCPE',
              motd: parts[1] || '',
              protocolVersion: parseInt(parts[2] || '0', 10),
              versionName: parts[3] || '',
              playerCount: parseInt(parts[4] || '0', 10),
              maxPlayers: parseInt(parts[5] || '0', 10),
              serverGuid: parts[6] || '',
              worldName: parts[7] || '',
              gameMode: parts[8] || '',
              portIpv4: parseInt(parts[10] || String(port), 10)
            });
          } catch (err) {
            socket.close();
            reject(new Error(`Failed to parse RakNet pong response: ${String(err)}`));
          }
        } else {
          socket.close();
          reject(new Error(`Unexpected RakNet packet ID: 0x${packetId.toString(16)}`));
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        try { socket.close(); } catch (_) {}
        reject(err);
      });

      socket.send(pingPacket, 0, pingPacket.length, port, host);
    });
  }

  /**
   * Analyzes server console log snippets to identify known Bedrock crashes and configuration traps.
   */
  public static analyzeLogEntries(logs: string[]): DiagnosticIssue[] {
    const issues: DiagnosticIssue[] = [];
    const joinedLogs = logs.join('\n');

    if (/CHAIN_INVALID|protocol version mismatch|client version does not match/i.test(joinedLogs)) {
      issues.push({
        code: 'PROTOCOL_VERSION_MISMATCH',
        title: 'Client & Server Protocol Version Mismatch',
        severity: 'CRITICAL',
        description: 'Connecting Minecraft players have a different version than the BDS server binary.',
        recommendation: 'Use Bedrock Launcher to launch matching client version or run version watcher to auto-upgrade server binary.',
        canAutoFix: false
      });
    }

    if (/trouble connecting to multiplayer services|XBOX_AUTH_FAILED|Failed to fetch Xbox token/i.test(joinedLogs)) {
      issues.push({
        code: 'XBOX_AUTH_RESTRICTION',
        title: 'Xbox Live Multiplayer Service Gate Active',
        severity: 'WARNING',
        description: 'Server requires Xbox Live authentication tickets that may block local or side-by-side clients.',
        recommendation: 'Toggle online-mode to false in server.properties for direct local connections.',
        canAutoFix: true,
        autoFixAction: 'DISABLE_ONLINE_MODE'
      });
    }

    if (/EADDRINUSE|failed to bind port|Address already in use/i.test(joinedLogs)) {
      issues.push({
        code: 'PORT_CONFLICT',
        title: 'Server Port Already in Use',
        severity: 'CRITICAL',
        description: 'Another process is actively listening on UDP port 19132 or RCON port.',
        recommendation: 'Stop duplicate server instances or rebind port in server.properties.',
        canAutoFix: true,
        autoFixAction: 'TERMINATE_DUPLICATE_PROCESSES'
      });
    }

    if (/leveldb.*lock|Resource temporarily unavailable|world is corrupted/i.test(joinedLogs)) {
      issues.push({
        code: 'DATABASE_LOCKED',
        title: 'LevelDB World Database Lock',
        severity: 'CRITICAL',
        description: 'LevelDB files in world directory are locked by an ungracefully terminated server instance.',
        recommendation: 'Clear stale LOCK files and restart server with graceful shutdown handling.',
        canAutoFix: true,
        autoFixAction: 'CLEAN_DATABASE_LOCKS'
      });
    }

    return issues;
  }

  /**
   * Generates a comprehensive diagnostics assessment.
   */
  public static assessHealth(
    pingResult: RakNetPingResult | null,
    processRunning: boolean,
    onlineMode: boolean,
    loopbackExempt: boolean,
    customIssues: DiagnosticIssue[] = []
  ): { overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE'; issues: DiagnosticIssue[] } {
    const issues: DiagnosticIssue[] = [...customIssues];

    if (!processRunning) {
      issues.push({
        code: 'SERVER_OFFLINE',
        title: 'Bedrock Dedicated Server Process Offline',
        severity: 'CRITICAL',
        description: 'The bedrock_server process is not running.',
        recommendation: 'Start the server from the dashboard power controls.',
        canAutoFix: true,
        autoFixAction: 'START_SERVER'
      });
      return { overallStatus: 'OFFLINE', issues };
    }

    if (!pingResult) {
      issues.push({
        code: 'RAKNET_UNRESPONSIVE',
        title: 'RakNet UDP Socket Unresponsive',
        severity: 'CRITICAL',
        description: 'Process is running but UDP port 19132 is not responding to RakNet unconnected pings.',
        recommendation: 'Check firewall settings and verify LevelDB world loading logs.',
        canAutoFix: true,
        autoFixAction: 'RESTART_SERVER'
      });
    } else if (pingResult.latencyMs > 150) {
      issues.push({
        code: 'HIGH_LATENCY',
        title: 'High Network Protocol Latency',
        severity: 'WARNING',
        description: `Local RakNet ping latency is ${pingResult.latencyMs}ms, which may cause game lag.`,
        recommendation: 'Inspect host CPU load and background disk I/O.',
        canAutoFix: false
      });
    }

    if (!loopbackExempt) {
      issues.push({
        code: 'WINDOWS_LOOPBACK_ISOLATION',
        title: 'Windows UWP Loopback Network Isolation',
        severity: 'WARNING',
        description: 'Windows AppContainer sandbox may prevent Minecraft from connecting to localhost (127.0.0.1).',
        recommendation: 'Run CheckNetIsolation LoopbackExempt to grant localhost network privileges.',
        canAutoFix: true,
        autoFixAction: 'GRANT_LOOPBACK_EXEMPTION'
      });
    }

    if (onlineMode) {
      issues.push({
        code: 'ONLINE_MODE_LOCAL_WARN',
        title: 'Online Mode Enabled for Local Server',
        severity: 'INFO',
        description: 'Xbox Live cloud ticket validation is active. Non-Microsoft Store clients may fail to authenticate.',
        recommendation: 'Keep online-mode=false for seamless local testing and multi-launcher support.',
        canAutoFix: true,
        autoFixAction: 'DISABLE_ONLINE_MODE'
      });
    }

    const hasCritical = issues.some(i => i.severity === 'CRITICAL');
    const hasWarning = issues.some(i => i.severity === 'WARNING');

    const overallStatus = hasCritical ? 'CRITICAL' : hasWarning ? 'DEGRADED' : 'HEALTHY';
    return { overallStatus, issues };
  }
}
