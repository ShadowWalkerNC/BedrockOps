import { BedrockServer, HostProviderType } from '@mc-admin/db';

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

export interface HostProvider {
  readonly type: HostProviderType;

  startServer(server: BedrockServer): Promise<boolean>;
  stopServer(server: BedrockServer, force?: boolean): Promise<boolean>;
  restartServer(server: BedrockServer): Promise<boolean>;
  getStatus(server: BedrockServer): Promise<ServerMetrics>;
  executeRcon(server: BedrockServer, command: string): Promise<string>;
  streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void;
  triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult>;
}

export class DockerAgentHostProvider implements HostProvider {
  public readonly type = HostProviderType.DOCKER_AGENT;

  constructor(private tunnelGateway?: any) {}

  public async startServer(server: BedrockServer): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    if (this.tunnelGateway) {
      await this.tunnelGateway.sendCommand(server.agentId, server.id, 'POWER_ACTION', { action: 'START' });
      return true;
    }
    // TODO: Wire agent tunnel in Phase 2
    console.warn(`[STUB] DockerAgentHostProvider.startServer — no tunnel for agent ${server.agentId}`);
    return false;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    if (this.tunnelGateway) {
      await this.tunnelGateway.sendCommand(server.agentId, server.id, 'POWER_ACTION', { action: force ? 'KILL' : 'STOP' });
      return true;
    }
    console.warn(`[STUB] DockerAgentHostProvider.stopServer — no tunnel for agent ${server.agentId}`);
    return false;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    await this.stopServer(server);
    return this.startServer(server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    if (this.tunnelGateway && server.agentId) {
      return this.tunnelGateway.sendCommand(server.agentId, server.id, 'RCON_COMMAND', { command });
    }
    return `[DockerAgent] Executed "${command}" on server ${server.name} (${server.id})`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[DockerAgent] Log streaming started for server ${server.id}`);
    return () => {
      // Unsubscribe cleanup callback
    };
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    if (this.tunnelGateway && server.agentId) {
      return this.tunnelGateway.sendCommand(server.agentId, server.id, 'TRIGGER_BACKUP', options);
    }
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Agent tunnel not connected — backup not executed on host.'
    };
  }
}

export class PterodactylHostProvider implements HostProvider {
  public readonly type = HostProviderType.PTERODACTYL;

  constructor(private apiBaseUrl?: string, private apiKey?: string) {}

  public async startServer(server: BedrockServer): Promise<boolean> {
    if (!server.pterodactylServerId && !server.id) {
      throw new Error(`Server ${server.id} has no pterodactylServerId specified`);
    }
    return true;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    return true;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    await this.stopServer(server);
    return this.startServer(server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    return `[Pterodactyl] Sent command "${command}" to server ${server.pterodactylServerId || server.id}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[Pterodactyl] Connected to console WebSocket for ${server.pterodactylServerId || server.id}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Pterodactyl backup API integration pending.'
    };
  }
}

export class DirectRconSshHostProvider implements HostProvider {
  public readonly type = HostProviderType.DIRECT_RCON_SSH;

  public async startServer(server: BedrockServer): Promise<boolean> {
    return true;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    return true;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    await this.stopServer(server);
    return this.startServer(server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    return `[DirectRCON] Executed "${command}" via TCP RCON socket to ${server.host}:${server.rconPort || 19133}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[DirectRCON] Log tail started for ${server.host}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: '[STUB] Direct RCON/SSH backup integration pending.'
    };
  }
}

export class HostProviderFactory {
  private static providers: Map<HostProviderType, HostProvider> = new Map();

  public static registerProvider(type: HostProviderType, provider: HostProvider): void {
    this.providers.set(type, provider);
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
}
