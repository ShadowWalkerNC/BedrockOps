import { BedrockServer, HostProviderType } from '@mc-admin/db';
import { RconClient } from './rcon';
import {
  type HostProviderReadiness,
  type PterodactylPartnerConfig,
  type DirectSshPartnerConfig,
  parsePterodactylPartnerConfig,
  parseDirectSshPartnerConfig,
  isPterodactylConfigured,
  dockerAgentReadiness,
  pterodactylReadiness,
  directRconSshReadiness
} from './partnerHosts';

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

export interface PackApplyResult {
  success: boolean;
  stub?: boolean;
  filesWritten?: number;
  error?: string;
  output?: string;
}

export interface WorldFileResult {
  success: boolean;
  stub?: boolean;
  relativePath?: string;
  contentsBase64?: string;
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
  writePackFiles(
    server: BedrockServer,
    plan: { files: Array<{ relativePath: string; contents: string }> }
  ): Promise<PackApplyResult>;
  /** Wave D — jailed binary world file read (level.dat). */
  readWorldFile(
    server: BedrockServer,
    plan: { relativePath: string }
  ): Promise<WorldFileResult>;
  /** Wave D — jailed binary world file write (level.dat); optional .bak. */
  writeWorldFile(
    server: BedrockServer,
    plan: { relativePath: string; contentsBase64: string; backup?: boolean }
  ): Promise<WorldFileResult>;
  /** Wave D5 — honest capability / readiness surface for partner hosts. */
  getReadiness(): HostProviderReadiness;
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

  public getReadiness(): HostProviderReadiness {
    return dockerAgentReadiness(Boolean(this.tunnelGateway));
  }

  private async power(server: BedrockServer, action: 'START' | 'STOP' | 'KILL' | 'RESTART'): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    if (!this.tunnelGateway) {
      console.warn(`[STUB] DockerAgentHostProvider.${action} — no tunnel gateway registered for agent ${server.agentId}`);
      return false;
    }
    if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
      console.warn(`[STUB] DockerAgentHostProvider.${action} — agent ${server.agentId} is not connected`);
      return false;
    }
    const result = await this.tunnelGateway.sendCommand(server.agentId, server.id, 'POWER_ACTION', {
      action,
      serverPath: server.serverPath || undefined
    }) as {
      success?: boolean;
    };
    return result?.success !== false;
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
          const result = await this.tunnelGateway.sendCommand(server.agentId, server.id, 'GET_STATUS', {}) as {
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
            activePlayers: result.activePlayers ?? 0,
          };
        } catch {
          // Fall through to empty metrics when agent is unreachable
        }
      }
    }
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    if (this.tunnelGateway && server.agentId) {
      if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
        return `[STUB] Agent ${server.agentId} not connected — RCON not executed`;
      }
      const result = await this.tunnelGateway.sendCommand(server.agentId, server.id, 'RCON_COMMAND', {
        rconCommand: command
      }) as { output?: string; error?: string; stub?: boolean };
      if (result?.error && !result.output) {
        return result.error;
      }
      return result?.output ?? JSON.stringify(result);
    }
    return `[STUB] DockerAgent tunnel not connected — RCON "${command}" not executed on ${server.id}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    onLog(`[DockerAgent] Log streaming started for server ${server.id}`);
    return () => {
      // Unsubscribe cleanup callback
    };
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

  public async writePackFiles(
    server: BedrockServer,
    plan: { files: Array<{ relativePath: string; contents: string }> }
  ): Promise<PackApplyResult> {
    if (!server.agentId) {
      return {
        success: false,
        stub: true,
        error: `Server ${server.id} has no assigned agentNode — pack files not written.`
      };
    }
    if (!this.tunnelGateway) {
      return {
        success: false,
        stub: true,
        error: '[STUB] Agent tunnel not connected — pack files not written on host.'
      };
    }
    if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
      return {
        success: false,
        stub: true,
        error: `[STUB] Agent ${server.agentId} not connected — pack files not written on host.`
      };
    }
    const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'WRITE_PACK_FILES', {
      serverPath: server.serverPath,
      files: plan.files
    })) as { success?: boolean; stub?: boolean; error?: string; output?: string };
    const writtenMatch = result?.output?.match(/wrote (\d+) pack files/);
    return {
      success: !!result?.success,
      stub: result?.stub,
      filesWritten: writtenMatch ? parseInt(writtenMatch[1], 10) : plan.files.length,
      output: result?.output,
      error: result?.error
    };
  }

  public async readWorldFile(
    server: BedrockServer,
    plan: { relativePath: string }
  ): Promise<WorldFileResult> {
    if (!server.agentId) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: `Server ${server.id} has no assigned agentNode — world file not read.`
      };
    }
    if (!this.tunnelGateway) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: '[STUB] Agent tunnel not connected — world file not read.'
      };
    }
    if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: `[STUB] Agent ${server.agentId} not connected — world file not read.`
      };
    }
    const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'READ_WORLD_FILE', {
      serverPath: server.serverPath,
      relativePath: plan.relativePath
    })) as {
      success?: boolean;
      stub?: boolean;
      error?: string;
      output?: string;
      contentsBase64?: string;
    };
    return {
      success: !!result?.success,
      stub: result?.stub,
      relativePath: plan.relativePath,
      contentsBase64: result?.contentsBase64,
      output: result?.output,
      error: result?.error
    };
  }

  public async writeWorldFile(
    server: BedrockServer,
    plan: { relativePath: string; contentsBase64: string; backup?: boolean }
  ): Promise<WorldFileResult> {
    if (!server.agentId) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: `Server ${server.id} has no assigned agentNode — world file not written.`
      };
    }
    if (!this.tunnelGateway) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: '[STUB] Agent tunnel not connected — world file not written.'
      };
    }
    if (this.tunnelGateway.isNodeConnected && !this.tunnelGateway.isNodeConnected(server.agentId)) {
      return {
        success: false,
        stub: true,
        relativePath: plan.relativePath,
        error: `[STUB] Agent ${server.agentId} not connected — world file not written.`
      };
    }
    const result = (await this.tunnelGateway.sendCommand(server.agentId, server.id, 'WRITE_WORLD_FILE', {
      serverPath: server.serverPath,
      relativePath: plan.relativePath,
      contentsBase64: plan.contentsBase64,
      backup: plan.backup !== false
    })) as { success?: boolean; stub?: boolean; error?: string; output?: string };
    return {
      success: !!result?.success,
      stub: result?.stub,
      relativePath: plan.relativePath,
      output: result?.output,
      error: result?.error
    };
  }
}

export class PterodactylHostProvider implements HostProvider {
  public readonly type = HostProviderType.PTERODACTYL;

  constructor(private config: PterodactylPartnerConfig = {}) {}

  public setConfig(config: PterodactylPartnerConfig): void {
    this.config = config;
  }

  public getReadiness(): HostProviderReadiness {
    return pterodactylReadiness(this.config);
  }

  private notImplemented(action: string, server: BedrockServer): false {
    const id = server.pterodactylServerId || server.id;
    if (!isPterodactylConfigured(this.config)) {
      console.warn(
        `[STUB] PterodactylHostProvider.${action} — panel credentials unset for ${id}`
      );
      return false;
    }
    if (!server.pterodactylServerId) {
      console.warn(
        `[STUB] PterodactylHostProvider.${action} — server ${server.id} has no pterodactylServerId`
      );
      return false;
    }
    console.warn(
      `[STUB] PterodactylHostProvider.${action} — panel API integration pending for ${server.pterodactylServerId}`
    );
    void this.config.apiBaseUrl;
    void this.config.apiKey;
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
      error: isPterodactylConfigured(this.config)
        ? '[STUB] Pterodactyl backup API integration pending.'
        : '[STUB] Pterodactyl credentials unset — backup not run.'
    };
  }

  public async restoreBackup(server: BedrockServer, options: RestoreTriggerOptions): Promise<RestoreResult> {
    void server;
    return {
      success: false,
      stub: true,
      backupId: options.backupId,
      error: isPterodactylConfigured(this.config)
        ? '[STUB] Pterodactyl restore API integration pending.'
        : '[STUB] Pterodactyl credentials unset — restore not run.'
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

  public async writePackFiles(
    server: BedrockServer,
    plan: { files: Array<{ relativePath: string; contents: string }> }
  ): Promise<PackApplyResult> {
    void plan;
    return {
      success: false,
      stub: true,
      error: `[STUB] Pterodactyl pack install pending for ${server.pterodactylServerId || server.id}`
    };
  }

  public async readWorldFile(
    server: BedrockServer,
    plan: { relativePath: string }
  ): Promise<WorldFileResult> {
    return {
      success: false,
      stub: true,
      relativePath: plan.relativePath,
      error: `[STUB] Pterodactyl world file read pending for ${server.pterodactylServerId || server.id}`
    };
  }

  public async writeWorldFile(
    server: BedrockServer,
    plan: { relativePath: string; contentsBase64: string; backup?: boolean }
  ): Promise<WorldFileResult> {
    void plan.contentsBase64;
    void plan.backup;
    return {
      success: false,
      stub: true,
      relativePath: plan.relativePath,
      error: `[STUB] Pterodactyl world file write pending for ${server.pterodactylServerId || server.id}`
    };
  }
}

export class DirectRconSshHostProvider implements HostProvider {
  public readonly type = HostProviderType.DIRECT_RCON_SSH;

  constructor(private config: DirectSshPartnerConfig = {}) {}

  public setConfig(config: DirectSshPartnerConfig): void {
    this.config = config;
  }

  public getReadiness(): HostProviderReadiness {
    return directRconSshReadiness(this.config);
  }

  private notImplemented(action: string, server: BedrockServer): false {
    console.warn(
      `[STUB] DirectRconSshHostProvider.${action} — SSH/RCON lifecycle integration pending for ${server.host}`
    );
    void this.config;
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

  public async writePackFiles(
    server: BedrockServer,
    plan: { files: Array<{ relativePath: string; contents: string }> }
  ): Promise<PackApplyResult> {
    void plan;
    return {
      success: false,
      stub: true,
      error: `[STUB] Direct RCON/SSH pack install pending for ${server.host}`
    };
  }

  public async readWorldFile(
    server: BedrockServer,
    plan: { relativePath: string }
  ): Promise<WorldFileResult> {
    return {
      success: false,
      stub: true,
      relativePath: plan.relativePath,
      error: `[STUB] Direct RCON/SSH world file read pending for ${server.host}`
    };
  }

  public async writeWorldFile(
    server: BedrockServer,
    plan: { relativePath: string; contentsBase64: string; backup?: boolean }
  ): Promise<WorldFileResult> {
    void plan.contentsBase64;
    void plan.backup;
    return {
      success: false,
      stub: true,
      relativePath: plan.relativePath,
      error: `[STUB] Direct RCON/SSH world file write pending for ${server.host}`
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

  /**
   * Wave D5 — bind optional partner host credentials from env.
   * Throws if partner env is partially set (both-or-neither).
   */
  public static bindPartnerHosts(
    env: Record<string, string | undefined> = process.env
  ): {
    pterodactyl: PterodactylHostProvider;
    directRconSsh: DirectRconSshHostProvider;
  } {
    const pteroCfg = parsePterodactylPartnerConfig(env);
    const sshCfg = parseDirectSshPartnerConfig(env);

    let ptero = this.providers.get(HostProviderType.PTERODACTYL);
    if (ptero instanceof PterodactylHostProvider) {
      ptero.setConfig(pteroCfg);
    } else {
      ptero = new PterodactylHostProvider(pteroCfg);
      this.providers.set(HostProviderType.PTERODACTYL, ptero);
    }

    let direct = this.providers.get(HostProviderType.DIRECT_RCON_SSH);
    if (direct instanceof DirectRconSshHostProvider) {
      direct.setConfig(sshCfg);
    } else {
      direct = new DirectRconSshHostProvider(sshCfg);
      this.providers.set(HostProviderType.DIRECT_RCON_SSH, direct);
    }

    return {
      pterodactyl: ptero as PterodactylHostProvider,
      directRconSsh: direct as DirectRconSshHostProvider
    };
  }

  public static listReadiness(): HostProviderReadiness[] {
    return [
      this.getProvider(HostProviderType.DOCKER_AGENT).getReadiness(),
      this.getProvider(HostProviderType.PTERODACTYL).getReadiness(),
      this.getProvider(HostProviderType.DIRECT_RCON_SSH).getReadiness()
    ];
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
