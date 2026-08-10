import { BedrockServer, ServerStatus } from '@mc-admin/db';
import { RconClient } from './rcon';
export * from './provider';
export * from './versions';
export * from './nbt';
export * from './experiments';
export * from './partnerHosts';
export { RconClient } from './rcon';

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
    const host = server.host || '127.0.0.1';
    const port = server.rconPort || 19133;
    const password = server.rconPassword || '';
    try {
      return await RconClient.execute({ host, port, password, command });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Honest failure — never pretend the game command ran.
      return `[RCON ERROR] ${message} (command=${JSON.stringify(command)} server=${server.name} ${host}:${port})`;
    }
  }

  public static setServerStatus(server: BedrockServer, status: ServerStatus): BedrockServer {
    server.status = status;
    server.updatedAt = new Date();
    return server;
  }
}
