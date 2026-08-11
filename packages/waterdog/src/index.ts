import { BedrockServer } from '@mc-admin/db';

export interface WaterdogNetworkRoute {
  name: string;
  address: string; // e.g. 127.0.0.1:19133
  isLobby?: boolean;
}

export interface WaterdogNetworkConfig {
  bindPort: number; // Default 19132
  motd: string;
  maxPlayers: number;
  servers: WaterdogNetworkRoute[];
}

export class WaterdogNetworkManager {
  private static networkConfigs = new Map<string, WaterdogNetworkConfig>();

  public static buildNetworkConfig(
    networkId: string,
    servers: BedrockServer[],
    lobbyServerId?: string
  ): WaterdogNetworkConfig {
    const routes: WaterdogNetworkRoute[] = servers.map((s) => ({
      name: s.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      address: `${s.host || '127.0.0.1'}:${s.port || 19132}`,
      isLobby: s.id === lobbyServerId || servers[0]?.id === s.id
    }));

    const config: WaterdogNetworkConfig = {
      bindPort: 19132,
      motd: 'BedrockOps Multi-Server Network Hub',
      maxPlayers: 100,
      servers: routes
    };

    this.networkConfigs.set(networkId, config);
    return config;
  }

  public static generateWaterdogYaml(config: WaterdogNetworkConfig): string {
    const serverEntries = config.servers
      .map(
        (s) => `  ${s.name}:
    address: "${s.address}"
    lobby: ${Boolean(s.isLobby)}`
      )
      .join('\n');

    return `# WaterdogPE Multi-Server Network Proxy Configuration
listener:
  motd: "${config.motd}"
  bind: "0.0.0.0:${config.bindPort}"
  max_players: ${config.maxPlayers}

servers:
${serverEntries}
`;
  }
}
