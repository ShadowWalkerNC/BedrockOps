import { BedrockServer, HostProviderType } from '@mc-admin/db';
import { RconClient } from './rcon';
import { LocalServerRunner } from './localRunner';

export interface ServerMetrics {
  cpuPercent: number;
  memoryMb: number;
  totalMemoryMb?: number;
  diskFreeGb?: number;
  uptimeSeconds: number;
  activePlayers: number;
}

export interface BackupTriggerOptions {
  backupId: string;
  presignedUploadUrl: string;
  isManual: boolean;
  isHoldCheckpoint?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  fileSizeBytes?: number;
  sha256?: string;
  stub?: boolean;
  error?: string;
}

export interface RestoreTriggerOptions {
  backupId: string;
  presignedDownloadUrl: string;
}

export interface RestoreResult {
  success: boolean;
  backupId: string;
  stub?: boolean;
  error?: string;
  filesExtracted?: number;
  fileSizeBytes?: number;
  output?: string;
}

export interface PropertiesWriteResult {
  success: boolean;
  stub?: boolean;
  path?: string;
  error?: string;
  output?: string;
}

export interface HostProvider {
  readonly type: HostProviderType;

  startServer(server: BedrockServer): Promise<boolean>;
  stopServer(server: BedrockServer, force?: boolean): Promise<boolean>;
  restartServer(server: BedrockServer): Promise<boolean>;
  getStatus(server: BedrockServer): Promise<ServerMetrics>;
  executeRcon(server: BedrockServer, command: string): Promise<string>;
  streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void;
  triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult>;
  restoreBackup(server: BedrockServer, options: RestoreTriggerOptions): Promise<RestoreResult>;
  writeServerProperties(
    server: BedrockServer,
    plan: { targetPath: string; tempPath: string; contents: string }
  ): Promise<PropertiesWriteResult>;
}

/** Minimal tunnel surface used by DockerAgentHostProvider (implemented by AgentTunnelGateway). */
export interface AgentTunnelGatewayLike {
  sendCommand(nodeId: string, serverId: string, command: string, payload: Record<string, unknown>): Promise<unknown>;
  isNodeConnected?(nodeId: string): boolean;
}

export class DockerAgentHostProvider implements HostProvider {
  public readonly type = HostProviderType.DOCKER_AGENT;

  constructor(private tunnelGateway?: AgentTunnelGatewayLike) {}

  public setTunnelGateway(gateway: AgentTunnelGatewayLike): void {
    this.tunnelGateway = gateway;
  }

  private async power(server: BedrockServer, action: 'START' | 'STOP' | 'KILL' | 'RESTART'): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    if (this.tunnelGateway) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        console.warn(`[STUB] DockerAgentHostProvider.${action} — agent ${server.agentId} is not connected`);
        return false;
      }
      const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'POWER_ACTION', {
        action,
        serverPath: server.serverPath || undefined
      })) as { success?: boolean };
      return result?.success !== false;
    }

    if (process.env.VITEST) {
      console.warn(`[STUB] DockerAgentHostProvider.${action} — no tunnel gateway registered`);
      return false;
    }

    // Local / Standalone Execution Fallback (Vercel for Bedrock Minecraft)
    const runner = LocalServerRunner.getInstance();
    if (action === 'START') return runner.startServer(server);
    if (action === 'STOP' || action === 'KILL') return runner.stopServer(server);
    return runner.restartServer(server);
  }

  public async startServer(server: BedrockServer): Promise<boolean> {
    return this.power(server, 'START');
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    return this.power(server, force ? 'KILL' : 'STOP');
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    return this.power(server, 'RESTART');
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    if (this.tunnelGateway && server.agentId) {
      if (!this.tunnelGateway.isNodeConnected || this.tunnelGateway.isNodeConnected(server.agentId)) {
        try {
          const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'GET_STATUS', {})) as {
            cpuPercent?: number;
            memoryMb?: number;
            totalMemoryMb?: number;
            uptimeSeconds?: number;
            activePlayers?: number;
          };
          return {
            cpuPercent: result.cpuPercent ?? 0,
            memoryMb: result.memoryMb ?? 0,
            totalMemoryMb: result.totalMemoryMb,
            uptimeSeconds: result.uptimeSeconds ?? 0,
            activePlayers: result.activePlayers ?? 0
          };
        } catch {
          // Fall through
        }
      }
      return {
        cpuPercent: 0,
        memoryMb: 0,
        uptimeSeconds: 0,
        activePlayers: 0
      };
    }

    if (process.env.VITEST) {
      return {
        cpuPercent: 0,
        memoryMb: 0,
        uptimeSeconds: 0,
        activePlayers: 0
      };
    }

    return LocalServerRunner.getInstance().getStatus(server);
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    if (this.tunnelGateway && server.agentId) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        return `[STUB] Agent ${server.agentId} not connected — RCON not executed`;
      }
      const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'RCON_COMMAND', {
        rconCommand: command
      })) as { output?: string; error?: string; stub?: boolean };
      if (result?.error && !result.output) {
        return result.error;
      }
      return result?.output ?? JSON.stringify(result);
    }

    if (process.env.VITEST) {
      return `[STUB] DockerAgent tunnel not connected — RCON "${command}" not executed on ${server.id}`;
    }

    return LocalServerRunner.getInstance().executeRcon(server, command);
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    if (this.tunnelGateway && server.agentId) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        onLog(`[DockerAgent] Log streaming started for server ${server.id}`);
        return () => {};
      }
      return () => {};
    }

    if (process.env.VITEST) {
      onLog(`[DockerAgent] Log streaming started for server ${server.id}`);
      return () => {};
    }

    return LocalServerRunner.getInstance().streamLogs(server, onLog);
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    if (this.tunnelGateway && server.agentId) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        return {
          success: false,
          stub: true,
          backupId: options.backupId,
          error: `[STUB] Agent ${server.agentId} not connected — backup not executed on host.`
        };
      }
      const result = await this.tunnelGateway.sendCommand(server.agentId, server.id, 'TRIGGER_BACKUP', {
        backupId: options.backupId,
        presignedUploadUrl: options.presignedUploadUrl,
        isManual: options.isManual,
        isHoldCheckpoint: options.isHoldCheckpoint
      }) as BackupResult;
      return {
        success: !!result?.success,
        stub: result?.stub,
        backupId: result?.backupId ?? options.backupId,
        fileSizeBytes: result?.fileSizeBytes,
        sha256: result?.sha256,
        error: result?.error
      };
    }
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Agent tunnel not connected — backup not executed on host.'
    };
  }

  public async restoreBackup(server: BedrockServer, options: RestoreTriggerOptions): Promise<RestoreResult> {
    if (this.tunnelGateway && server.agentId) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        return {
          success: false,
          stub: true,
          backupId: options.backupId,
          error: `[STUB] Agent ${server.agentId} not connected — restore not executed on host.`
        };
      }
      const result = await this.tunnelGateway.sendCommand(server.agentId, server.id, 'RESTORE_BACKUP', {
        backupId: options.backupId,
        presignedDownloadUrl: options.presignedDownloadUrl
      }) as {
        success?: boolean;
        stub?: boolean;
        error?: string;
        backupId?: string;
        fileSizeBytes?: number;
        output?: string;
      };
      return {
        success: !!result?.success,
        stub: result?.stub,
        backupId: result?.backupId ?? options.backupId,
        fileSizeBytes: result?.fileSizeBytes,
        output: result?.output,
        error: result?.error
      };
    }
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Agent tunnel not connected — restore not executed on host.'
    };
  }

  public async writeServerProperties(
    server: BedrockServer,
    plan: { targetPath: string; tempPath: string; contents: string }
  ): Promise<PropertiesWriteResult> {
    if (!server.agentId) {
      return {
        success: false,
        stub: true,
        error: `Server ${server.id} has no assigned agentNode — properties not written.`
      };
    }
    if (!this.tunnelGateway) {
      return {
        success: false,
        stub: true,
        path: plan.targetPath,
        error: '[STUB] Agent tunnel not connected — server.properties not written on host.'
      };
    }
    if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
      return {
        success: false,
        stub: true,
        path: plan.targetPath,
        error: `[STUB] Agent ${server.agentId} not connected — server.properties not written on host.`
      };
    }
    const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'WRITE_PROPERTIES', {
      targetPath: plan.targetPath,
      tempPath: plan.tempPath,
      contents: plan.contents
    })) as { success?: boolean; stub?: boolean; error?: string; output?: string };
    return {
      success: !!result?.success,
      stub: result?.stub,
      path: plan.targetPath,
      output: result?.output,
      error: result?.error
    };
  }
}

export class PterodactylHostProvider implements HostProvider {
  public readonly type = HostProviderType.PTERODACTYL;

  constructor(private apiBaseUrl?: string, private apiKey?: string) {}

  private notImplemented(action: string, server: BedrockServer): never | false {
    console.warn(
      `[STUB] PterodactylHostProvider.${action} — panel API integration pending for ${server.pterodactylServerId || server.id}`
    );
    return false;
  }

  public async startServer(server: BedrockServer): Promise<boolean> {
    if (!server.pterodactylServerId && !server.id) {
      throw new Error(`Server ${server.id} has no pterodactylServerId specified`);
    }
    // TODO: Call Pterodactyl power API when apiBaseUrl + apiKey are configured.
    void this.apiBaseUrl;
    void this.apiKey;
    return this.notImplemented('START', server);
  }

  public async stopServer(server: BedrockServer, _force = false): Promise<boolean> {
    return this.notImplemented('STOP', server);
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    return this.notImplemented('RESTART', server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    void server;
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    return `[STUB] Pterodactyl RCON not executed for ${server.pterodactylServerId || server.id}: ${command}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[STUB] Pterodactyl console WebSocket not connected for ${server.pterodactylServerId || server.id}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    void server;
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Pterodactyl backup API integration pending.'
    };
  }

  public async restoreBackup(server: BedrockServer, options: RestoreTriggerOptions): Promise<RestoreResult> {
    void server;
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Pterodactyl restore API integration pending.'
    };
  }

  public async writeServerProperties(
    server: BedrockServer,
    plan: { targetPath: string; tempPath: string; contents: string }
  ): Promise<PropertiesWriteResult> {
    void plan;
    return {
      success: false,
      stub: true,
      error: `[STUB] Pterodactyl properties write pending for ${server.pterodactylServerId || server.id}`
    };
  }
}

export class DirectRconSshHostProvider implements HostProvider {
  public readonly type = HostProviderType.DIRECT_RCON_SSH;

  private notImplemented(action: string, server: BedrockServer): false {
    console.warn(
      `[STUB] DirectRconSshHostProvider.${action} — SSH/RCON lifecycle integration pending for ${server.host}`
    );
    return false;
  }

  public async startServer(server: BedrockServer): Promise<boolean> {
    return this.notImplemented('START', server);
  }

  public async stopServer(server: BedrockServer, _force = false): Promise<boolean> {
    return this.notImplemented('STOP', server);
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    return this.notImplemented('RESTART', server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    void server;
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    const host = server.host || '127.0.0.1';
    const port = server.rconPort || 19133;
    const password = server.rconPassword || '';
    try {
      return await RconClient.execute({ host, port, password, command });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `[RCON ERROR] ${message} (command=${JSON.stringify(command)} ${host}:${port})`;
    }
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[STUB] DirectRCON log tail not connected for ${server.host}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    void server;
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Direct RCON/SSH backup integration pending.'
    };
  }

  public async restoreBackup(server: BedrockServer, options: RestoreTriggerOptions): Promise<RestoreResult> {
    void server;
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Direct RCON/SSH restore integration pending.'
    };
  }

  public async writeServerProperties(
    server: BedrockServer,
    plan: { targetPath: string; tempPath: string; contents: string }
  ): Promise<PropertiesWriteResult> {
    void plan;
    return {
      success: false,
      stub: true,
      error: `[STUB] Direct RCON/SSH properties write pending for ${server.host}`
    };
  }
}

export class HostProviderFactory {
  private static providers: Map<HostProviderType, HostProvider> = new Map();

  public static registerProvider(type: HostProviderType, provider: HostProvider): void {
    this.providers.set(type, provider);
  }

  /** Bind the live agent WebSocket gateway into the Docker agent provider. */
  public static bindAgentTunnel(gateway: AgentTunnelGatewayLike): DockerAgentHostProvider {
    const existing = this.providers.get(HostProviderType.DOCKER_AGENT);
    if (existing instanceof DockerAgentHostProvider) {
      existing.setTunnelGateway(gateway);
      return existing;
    }
    const provider = new DockerAgentHostProvider(gateway);
    this.providers.set(HostProviderType.DOCKER_AGENT, provider);
    return provider;
  }

  public static getProvider(type: HostProviderType | string): HostProvider {
    const enumType = type as HostProviderType;
    let provider = this.providers.get(enumType);

    if (!provider) {
      switch (enumType) {
        case HostProviderType.DOCKER_AGENT:
          provider = new DockerAgentHostProvider();
          break;
        case HostProviderType.PTERODACTYL:
          provider = new PterodactylHostProvider();
          break;
        case HostProviderType.DIRECT_RCON_SSH:
          provider = new DirectRconSshHostProvider();
          break;
        default:
          throw new Error(`Unsupported HostProviderType: ${type}`);
      }
      this.providers.set(enumType, provider);
    }

    return provider;
  }

  /** Test helper — clears cached provider instances. */
  public static reset(): void {
    this.providers.clear();
  }
}
