/**
 * MockBdsLogStreamer.ts
 * E2E Test Harness Mock for Bedrock Dedicated Server stdout log streams
 */

export interface LogStreamEntry {
  id: string;
  serverId: string;
  timestamp: string;
  rawLine: string;
  type: 'JOIN' | 'DISCONNECT' | 'RCON' | 'STARTUP' | 'SHUTDOWN' | 'SAVE_HOLD' | 'INFO' | 'WARN' | 'ERROR';
  metadata?: Record<string, any>;
}

export interface ParsedJoinEvent {
  gamertag: string;
  xuid: string;
}

export interface ParsedDisconnectEvent {
  gamertag: string;
  xuid: string;
}

export interface ParsedSaveQueryEvent {
  files: Array<{ path: string; size: number }>;
}

export class MockBdsLogStreamer {
  private logHistory: LogStreamEntry[] = [];
  private listeners: Set<(entry: LogStreamEntry) => void> = new Set();

  /**
   * Format current or given timestamp in BDS stdout format
   * e.g. "2026-08-06 04:55:00:123"
   */
  public static formatTimestamp(date: Date = new Date()): string {
    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    const ms = pad(date.getMilliseconds(), 3);
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}:${ms}`;
  }

  /**
   * Internal helper to publish log entry
   */
  private publish(entry: Omit<LogStreamEntry, 'id'>): LogStreamEntry {
    const fullEntry: LogStreamEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    this.logHistory.push(fullEntry);

    for (const listener of this.listeners) {
      try {
        listener(fullEntry);
      } catch (err) {
        console.error('[MockBdsLogStreamer] Listener error:', err);
      }
    }

    return fullEntry;
  }

  /**
   * Register a subscriber for log stream entries
   */
  public onLogLine(callback: (entry: LogStreamEntry) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Emit simulated player join event stdout log line
   */
  public emitPlayerJoin(serverId: string, gamertag: string, xuid: string): LogStreamEntry {
    const ts = MockBdsLogStreamer.formatTimestamp();
    const rawLine = `[${ts} INFO] Player connected: ${gamertag}, xuid: ${xuid}`;

    return this.publish({
      serverId,
      timestamp: ts,
      rawLine,
      type: 'JOIN',
      metadata: { gamertag, xuid },
    });
  }

  /**
   * Emit simulated player disconnect event stdout log line
   */
  public emitPlayerDisconnect(serverId: string, gamertag: string, xuid: string): LogStreamEntry {
    const ts = MockBdsLogStreamer.formatTimestamp();
    const rawLine = `[${ts} INFO] Player disconnected: ${gamertag}, xuid: ${xuid}`;

    return this.publish({
      serverId,
      timestamp: ts,
      rawLine,
      type: 'DISCONNECT',
      metadata: { gamertag, xuid },
    });
  }

  /**
   * Emit simulated RCON command output log line
   */
  public emitRconOutput(serverId: string, command: string, output: string): LogStreamEntry {
    const ts = MockBdsLogStreamer.formatTimestamp();
    const rawLine = `[${ts} INFO] [RCON] Executed "${command}": ${output}`;

    return this.publish({
      serverId,
      timestamp: ts,
      rawLine,
      type: 'RCON',
      metadata: { command, output },
    });
  }

  /**
   * Emit simulated server startup log sequence
   */
  public emitStartupSequence(serverId: string, port: number = 19132, version: string = '1.20.80.01'): LogStreamEntry[] {
    const entries: LogStreamEntry[] = [];
    const ts1 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts1,
        rawLine: `[${ts1} INFO] Starting Server`,
        type: 'STARTUP',
      })
    );

    const ts2 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts2,
        rawLine: `[${ts2} INFO] Version ${version}`,
        type: 'STARTUP',
      })
    );

    const ts3 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts3,
        rawLine: `[${ts3} INFO] IPv4 supported port: ${port}`,
        type: 'STARTUP',
      })
    );

    const ts4 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts4,
        rawLine: `[${ts4} INFO] Server started.`,
        type: 'STARTUP',
      })
    );

    return entries;
  }

  /**
   * Emit simulated server shutdown log sequence
   */
  public emitShutdownSequence(serverId: string): LogStreamEntry[] {
    const entries: LogStreamEntry[] = [];
    const ts1 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts1,
        rawLine: `[${ts1} INFO] Quit command received. Stopping server...`,
        type: 'SHUTDOWN',
      })
    );

    const ts2 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts2,
        rawLine: `[${ts2} INFO] Server stopped.`,
        type: 'SHUTDOWN',
      })
    );

    return entries;
  }

  /**
   * Emit save-hold RCON checkpoint sequence lines
   */
  public emitSaveHoldSequence(serverId: string, files?: Array<{ path: string; size: number }>): LogStreamEntry[] {
    const entries: LogStreamEntry[] = [];
    const ts1 = MockBdsLogStreamer.formatTimestamp();

    entries.push(
      this.publish({
        serverId,
        timestamp: ts1,
        rawLine: `[${ts1} INFO] Data saved. Files to copy:`,
        type: 'SAVE_HOLD',
      })
    );

    const fileList = files || [
      { path: 'bedrock_level/db/000005.ldb', size: 1048576 },
      { path: 'bedrock_level/level.dat', size: 2048 },
    ];
    const fileStr = fileList.map((f) => `${f.path}:${f.size}`).join(', ');

    const ts2 = MockBdsLogStreamer.formatTimestamp();
    entries.push(
      this.publish({
        serverId,
        timestamp: ts2,
        rawLine: fileStr,
        type: 'SAVE_HOLD',
        metadata: { files: fileList },
      })
    );

    return entries;
  }

  /**
   * Emit arbitrary custom log line
   */
  public emitCustomLog(
    serverId: string,
    message: string,
    level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
  ): LogStreamEntry {
    const ts = MockBdsLogStreamer.formatTimestamp();
    const rawLine = `[${ts} ${level}] ${message}`;

    return this.publish({
      serverId,
      timestamp: ts,
      rawLine,
      type: level as any,
    });
  }

  /**
   * Retrieve log stream history
   */
  public getLogHistory(serverId?: string): LogStreamEntry[] {
    if (!serverId) return [...this.logHistory];
    return this.logHistory.filter((entry) => entry.serverId === serverId);
  }

  /**
   * Clear log history
   */
  public clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Static helper: Parse BDS stdout line for player join
   */
  public static parseJoinLog(line: string): ParsedJoinEvent | null {
    const match = line.match(/Player connected:\s*(?<gamertag>.+?),\s*xuid:\s*(?<xuid>\d+)/i);
    if (!match || !match.groups) return null;
    return {
      gamertag: match.groups.gamertag.trim(),
      xuid: match.groups.xuid.trim(),
    };
  }

  /**
   * Static helper: Parse BDS stdout line for player disconnect
   */
  public static parseDisconnectLog(line: string): ParsedDisconnectEvent | null {
    const match = line.match(/Player disconnected:\s*(?<gamertag>.+?),\s*xuid:\s*(?<xuid>\d+)/i);
    if (!match || !match.groups) return null;
    return {
      gamertag: match.groups.gamertag.trim(),
      xuid: match.groups.xuid.trim(),
    };
  }

  /**
   * Static helper: Parse save query file listing string
   */
  public static parseSaveQueryLog(line: string): ParsedSaveQueryEvent | null {
    if (!line.includes(':') || line.includes('[INFO]')) return null;
    const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
    const files: Array<{ path: string; size: number }> = [];

    for (const part of parts) {
      const colIndex = part.lastIndexOf(':');
      if (colIndex !== -1) {
        const path = part.substring(0, colIndex).trim();
        const sizeStr = part.substring(colIndex + 1).trim();
        const size = parseInt(sizeStr, 10);
        if (path && !isNaN(size)) {
          files.push({ path, size });
        }
      }
    }

    if (files.length === 0) return null;
    return { files };
  }
}
