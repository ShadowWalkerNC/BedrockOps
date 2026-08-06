/**
 * MockAgentServer.ts
 * E2E Test Harness Mock for BedrockOps V6 Go Agent Daemon Tunnel
 */

export type AgentMessageType =
  | 'HEARTBEAT'
  | 'CMD_EXEC'
  | 'CMD_RESP'
  | 'LOG_LINE'
  | 'METRICS'
  | 'BACKUP_START'
  | 'BACKUP_PROGRESS'
  | 'BACKUP_COMPLETE'
  | 'BACKUP_ERROR'
  | 'ALLOWLIST_SYNC'
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE';

export type ContainerState = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING' | 'ERROR';

export interface AgentFrame<T = any> {
  id: string;
  type: AgentMessageType;
  nodeId: string;
  serverId: string;
  timestamp: number;
  payload: T;
}

export interface AgentTelemetry {
  cpuPercent: number;
  memoryUsageMB: number;
  memoryLimitMB: number;
  diskUsageMB: number;
  uptimeSeconds: number;
  activeConnections: number;
  timestamp: number;
}

export interface AllowlistEntry {
  name: string;
  xuid: string;
  ignoresPlayerLimit?: boolean;
}

export interface AllowlistSyncResult {
  success: boolean;
  entriesCount: number;
  timestamp: number;
  serverId: string;
}

export class MockAgentServer {
  private connectedNodes: Set<string> = new Set();
  private serverStates: Map<string, ContainerState> = new Map();
  private allowlists: Map<string, AllowlistEntry[]> = new Map();
  private frameHistory: AgentFrame[] = [];
  private listeners: Set<(frame: AgentFrame) => void> = new Set();

  /**
   * Connect an agent node to the mock server
   */
  public connect(nodeId: string = 'node-1'): boolean {
    this.connectedNodes.add(nodeId);
    return true;
  }

  /**
   * Disconnect an agent node
   */
  public disconnect(nodeId: string = 'node-1'): void {
    this.connectedNodes.delete(nodeId);
  }

  /**
   * Check if an agent node is connected
   */
  public isConnected(nodeId: string = 'node-1'): boolean {
    return this.connectedNodes.has(nodeId);
  }

  /**
   * Emit an agent frame out to listeners and store in history
   */
  public sendFrame<T = any>(frame: Omit<AgentFrame<T>, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): AgentFrame<T> {
    const fullFrame: AgentFrame<T> = {
      id: frame.id || `frame-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: frame.timestamp || Date.now(),
      type: frame.type,
      nodeId: frame.nodeId,
      serverId: frame.serverId,
      payload: frame.payload,
    };

    this.frameHistory.push(fullFrame);

    for (const listener of this.listeners) {
      try {
        listener(fullFrame);
      } catch (err) {
        console.error('[MockAgentServer] Listener error:', err);
      }
    }

    return fullFrame;
  }

  /**
   * Simulate receiving a frame from the control plane
   */
  public receiveFrame(frame: AgentFrame): void {
    this.frameHistory.push(frame);

    // Auto-handle allowlist sync if received
    if (frame.type === 'ALLOWLIST_SYNC' && Array.isArray(frame.payload?.entries)) {
      this.syncAllowlist(frame.serverId, frame.payload.entries);
    }

    // Auto-handle state transitions if command
    if (frame.type === 'CMD_EXEC' && frame.payload?.action) {
      const action = String(frame.payload.action).toLowerCase();
      if (action === 'start') this.setServerState(frame.serverId, 'STARTING');
      else if (action === 'stop') this.setServerState(frame.serverId, 'STOPPING');
    }
  }

  /**
   * Register a callback for incoming/outgoing WebSocket frames
   */
  public onMessage(listener: (frame: AgentFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Query frame history with optional filters
   */
  public getFrameHistory(filter?: { type?: AgentMessageType; serverId?: string; nodeId?: string }): AgentFrame[] {
    return this.frameHistory.filter((frame) => {
      if (filter?.type && frame.type !== filter.type) return false;
      if (filter?.serverId && frame.serverId !== filter.serverId) return false;
      if (filter?.nodeId && frame.nodeId !== filter.nodeId) return false;
      return true;
    });
  }

  /**
   * Clear recorded frame history
   */
  public clearHistory(): void {
    this.frameHistory = [];
  }

  /**
   * Set container lifecycle state for a server
   */
  public setServerState(serverId: string, state: ContainerState): void {
    this.serverStates.set(serverId, state);
  }

  /**
   * Get current container lifecycle state for a server
   */
  public getServerState(serverId: string): ContainerState {
    return this.serverStates.get(serverId) || 'OFFLINE';
  }

  /**
   * Atomically synchronize allowlist.json file content
   */
  public syncAllowlist(serverId: string, entries: AllowlistEntry[]): AllowlistSyncResult {
    const sanitized = entries.map((e) => ({
      name: e.name,
      xuid: e.xuid,
      ignoresPlayerLimit: e.ignoresPlayerLimit ?? false,
    }));

    this.allowlists.set(serverId, sanitized);

    const result: AllowlistSyncResult = {
      success: true,
      entriesCount: sanitized.length,
      timestamp: Date.now(),
      serverId,
    };

    // Emit frame notification
    this.sendFrame({
      type: 'ALLOWLIST_SYNC',
      nodeId: 'node-1',
      serverId,
      payload: result,
    });

    return result;
  }

  /**
   * Retrieve current allowlist entries for a server
   */
  public getAllowlist(serverId: string): AllowlistEntry[] {
    return this.allowlists.get(serverId) || [];
  }

  /**
   * Check if a player (by Gamertag or XUID) exists in the server allowlist
   */
  public hasAllowlistEntry(serverId: string, query: string): boolean {
    const list = this.getAllowlist(serverId);
    const qLower = query.toLowerCase();
    return list.some((e) => e.name.toLowerCase() === qLower || e.xuid === query);
  }

  /**
   * Scrape/generate telemetry metrics frame
   */
  public generateTelemetry(
    nodeId: string,
    serverId: string,
    custom?: Partial<AgentTelemetry>
  ): AgentFrame<AgentTelemetry> {
    const state = this.getServerState(serverId);
    const defaultCpu = state === 'ONLINE' ? 12.5 : state === 'STARTING' ? 45.0 : 0.0;
    const defaultMemory = state === 'ONLINE' ? 1024 : state === 'STARTING' ? 512 : 0;

    const telemetry: AgentTelemetry = {
      cpuPercent: custom?.cpuPercent ?? defaultCpu,
      memoryUsageMB: custom?.memoryUsageMB ?? defaultMemory,
      memoryLimitMB: custom?.memoryLimitMB ?? 4096,
      diskUsageMB: custom?.diskUsageMB ?? 2500,
      uptimeSeconds: custom?.uptimeSeconds ?? (state === 'ONLINE' ? 3600 : 0),
      activeConnections: custom?.activeConnections ?? (state === 'ONLINE' ? 3 : 0),
      timestamp: custom?.timestamp ?? Date.now(),
    };

    return this.sendFrame({
      type: 'METRICS',
      nodeId,
      serverId,
      payload: telemetry,
    });
  }

  /**
   * Simulate execution of a remote command on agent
   */
  public executeCommand(
    nodeId: string,
    serverId: string,
    command: string
  ): AgentFrame<{ command: string; output: string; exitCode: number }> {
    const frame = this.sendFrame({
      type: 'CMD_RESP',
      nodeId,
      serverId,
      payload: {
        command,
        output: `[MOCK AGENT] Command '${command}' executed on server ${serverId}`,
        exitCode: 0,
      },
    });

    return frame;
  }

  /**
   * Simulate a full streaming backup event sequence
   */
  public triggerBackupSequence(
    nodeId: string,
    serverId: string,
    backupId: string
  ): AgentFrame[] {
    const frames: AgentFrame[] = [];

    frames.push(
      this.sendFrame({
        type: 'BACKUP_START',
        nodeId,
        serverId,
        payload: { backupId, status: 'STARTING' },
      })
    );

    frames.push(
      this.sendFrame({
        type: 'BACKUP_PROGRESS',
        nodeId,
        serverId,
        payload: { backupId, progressPercent: 50, bytesTransferred: 10485760 },
      })
    );

    frames.push(
      this.sendFrame({
        type: 'BACKUP_COMPLETE',
        nodeId,
        serverId,
        payload: {
          backupId,
          status: 'COMPLETED',
          bytesTransferred: 20971520,
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      })
    );

    return frames;
  }
}
