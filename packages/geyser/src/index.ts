import { BedrockServer } from '@mc-admin/db';

export interface GeyserConfig {
  javaPort: number;       // Default: 25565
  bedrockPort: number;    // Default: 19132
  authType: 'online' | 'offline' | 'floodgate';
  passthroughMotd: boolean;
  passthroughMaxPlayers: boolean;
}

export interface GeyserStatus {
  enabled: boolean;
  javaPort: number;
  bedrockPort: number;
  activeJavaConnections: number;
  floodgateEnabled: boolean;
}

export class GeyserBridgeManager {
  private static activeConfigs = new Map<string, GeyserConfig>();

  public static defaultConfig(server: BedrockServer): GeyserConfig {
    return {
      javaPort: 25565,
      bedrockPort: server.port || 19132,
      authType: 'floodgate',
      passthroughMotd: true,
      passthroughMaxPlayers: true
    };
  }

  public static enableBridge(serverId: string, config?: Partial<GeyserConfig>): GeyserConfig {
    const fullConfig: GeyserConfig = {
      javaPort: config?.javaPort || 25565,
      bedrockPort: config?.bedrockPort || 19132,
      authType: config?.authType || 'floodgate',
      passthroughMotd: config?.passthroughMotd ?? true,
      passthroughMaxPlayers: config?.passthroughMaxPlayers ?? true
    };
    this.activeConfigs.set(serverId, fullConfig);
    return fullConfig;
  }

  public static disableBridge(serverId: string): boolean {
    return this.activeConfigs.delete(serverId);
  }

  public static getStatus(serverId: string): GeyserStatus {
    const cfg = this.activeConfigs.get(serverId);
    if (!cfg) {
      return {
        enabled: false,
        javaPort: 25565,
        bedrockPort: 19132,
        activeJavaConnections: 0,
        floodgateEnabled: false
      };
    }
    return {
      enabled: true,
      javaPort: cfg.javaPort,
      bedrockPort: cfg.bedrockPort,
      activeJavaConnections: 0,
      floodgateEnabled: cfg.authType === 'floodgate'
    };
  }

  public static generateGeyserYamlConfig(server: BedrockServer, config: GeyserConfig): string {
    return `# GeyserMC Cross-Play Proxy Configuration for ${server.name}
bedrock:
  address: 0.0.0.0
  port: ${config.bedrockPort}
  clone-remote-port: true

remote:
  address: 127.0.0.1
  port: ${config.javaPort}
  auth-type: ${config.authType}

passthrough-motd: ${config.passthroughMotd}
passthrough-max-players: ${config.passthroughMaxPlayers}
metrics:
  enabled: false
`;
  }
}
