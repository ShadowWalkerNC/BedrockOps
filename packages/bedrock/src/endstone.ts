import { EndstonePlugin } from '@mc-admin/db';

export interface EndstonePluginManifest {
  name: string;
  version: string;
  description: string;
  entrypoint: string;
  author?: string;
  website?: string;
  api_version?: string;
}

export interface EndstoneServerConfig {
  serverName: string;
  port: number;
  rconPort: number;
  rconPassword?: string;
  pluginsEnabled: boolean;
  pythonPluginPath: string;
  cppPluginPath: string;
}

export class EndstoneService {
  public static parseManifest(manifestContent: string): EndstonePluginManifest {
    const lines = manifestContent.split('\n');
    const result: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const cleanKey = key.trim().toLowerCase();
        const cleanVal = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        result[cleanKey] = cleanVal;
      }
    }

    return {
      name: result.name || 'UnnamedEndstonePlugin',
      version: result.version || '1.0.0',
      description: result.description || 'Endstone BDS plugin',
      entrypoint: result.entrypoint || result.main || 'main.py',
      author: result.author,
      website: result.website,
      api_version: result.api_version || '0.5'
    };
  }

  public static generateEndstoneConfig(config: EndstoneServerConfig): string {
    return [
      `# Endstone Bedrock Dedicated Server Configuration`,
      `[server]`,
      `name = "${config.serverName}"`,
      `port = ${config.port}`,
      `rcon_port = ${config.rconPort}`,
      `rcon_password = "${config.rconPassword || ''}"`,
      ``,
      `[plugins]`,
      `enabled = ${config.pluginsEnabled}`,
      `python_path = "${config.pythonPluginPath}"`,
      `cpp_path = "${config.cppPluginPath}"`
    ].join('\n');
  }

  public static formatPluginInstallPlan(serverId: string, plugin: EndstonePlugin): {
    targetDirectory: string;
    targetFilename: string;
    installPlan: string;
  } {
    const isPython = plugin.entrypoint.endsWith('.py');
    const subfolder = isPython ? 'python' : 'cpp';
    return {
      targetDirectory: `/var/minecraft/${serverId}/plugins/${subfolder}`,
      targetFilename: `${plugin.name.toLowerCase()}.${isPython ? 'py' : 'so'}`,
      installPlan: `Piping Endstone ${isPython ? 'Python' : 'C++'} plugin package "${plugin.name} v${plugin.version}" into /plugins/${subfolder}/`
    };
  }
}
