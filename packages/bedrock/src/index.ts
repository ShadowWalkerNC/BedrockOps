import { BedrockServer, ServerStatus } from '@mc-admin/db';
export * from './provider';

export interface BedrockProperties {
  'server-name': string;
  'gamemode': string;
  'difficulty': string;
  'allow-cheats': string;
  'max-players': string;
  'online-mode': string;
  'white-list': string;
  'server-port': string;
  'server-portv6': string;
  'enable-rcon': string;
  'rcon.password': string;
  'rcon.port': string;
  [key: string]: string;
}

export class BedrockServerController {
  public static parseProperties(rawContent: string): BedrockProperties {
    const properties: Record<string, string> = {};
    const lines = rawContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex !== -1) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        properties[key] = value;
      }
    }

    return properties as BedrockProperties;
  }

  public static serializeProperties(properties: Partial<BedrockProperties>): string {
    return Object.entries(properties)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  public static async executeRconCommand(server: BedrockServer, command: string): Promise<string> {
    // TODO: Wire full RCON protocol socket client in Phase 2
    return `[STUB] RCON response for command "${command}" on ${server.name} (${server.host}:${server.rconPort || 19133})`;
  }

  public static setServerStatus(server: BedrockServer, status: ServerStatus): BedrockServer {
    server.status = status;
    server.updatedAt = new Date();
    return server;
  }
}
