import { BedrockServer } from '@mc-admin/db';

export interface LanDiscoveryOptions {
  bindPort?: number;       // Default: 19132
  serverAddress: string;  // Destination BDS host:port (e.g., 127.0.0.1:19132)
  bindIp?: string;        // Default: 0.0.0.0 (broadcast on LAN)
  customMotd?: string;
  maxPlayers?: number;
}

export interface LanDiscoveryStatus {
  active: boolean;
  serverId: string;
  broadcastAddress: string;
  targetAddress: string;
  packetCount: number;
}

export class LanDiscoveryManager {
  private static activeDaemons = new Map<string, LanDiscoveryStatus>();

  public static startDiscovery(server: BedrockServer, options?: Partial<LanDiscoveryOptions>): LanDiscoveryStatus {
    const targetAddress = `${server.host || '127.0.0.1'}:${server.port || 19132}`;
    const broadcastAddress = `${options?.bindIp || '0.0.0.0'}:${options?.bindPort || 19132}`;

    const status: LanDiscoveryStatus = {
      active: true,
      serverId: server.id,
      broadcastAddress,
      targetAddress,
      packetCount: 1
    };

    this.activeDaemons.set(server.id, status);
    return status;
  }

  public static stopDiscovery(serverId: string): boolean {
    return this.activeDaemons.delete(serverId);
  }

  public static getStatus(serverId: string): LanDiscoveryStatus {
    return (
      this.activeDaemons.get(serverId) || {
        active: false,
        serverId,
        broadcastAddress: '0.0.0.0:19132',
        targetAddress: '127.0.0.1:19132',
        packetCount: 0
      }
    );
  }

  public static generatePhantomLaunchArgs(server: BedrockServer): string[] {
    const host = server.host || '127.0.0.1';
    const port = server.port || 19132;
    return ['-server', `${host}:${port}`, '-bind', '0.0.0.0:19132'];
  }
}
