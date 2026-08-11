import { describe, it, expect } from 'vitest';
import { EndstoneService } from './endstone';

describe('EndstoneService', () => {
  it('parses Endstone plugin manifest correctly', () => {
    const rawManifest = `
      name = "EndstoneChatGuard"
      version = "1.2.0"
      description = "Python chat filter for Endstone"
      entrypoint = "chat_guard.py"
      author = "EndstoneMC"
    `;

    const parsed = EndstoneService.parseManifest(rawManifest);
    expect(parsed.name).toBe('EndstoneChatGuard');
    expect(parsed.version).toBe('1.2.0');
    expect(parsed.entrypoint).toBe('chat_guard.py');
    expect(parsed.author).toBe('EndstoneMC');
  });

  it('generates Endstone server configuration file content', () => {
    const config = EndstoneService.generateEndstoneConfig({
      serverName: 'Endstone Plugin Realm',
      port: 19132,
      rconPort: 19133,
      rconPassword: 'secret_rcon_pass',
      pluginsEnabled: true,
      pythonPluginPath: '/var/minecraft/plugins/python',
      cppPluginPath: '/var/minecraft/plugins/cpp'
    });

    expect(config).toContain('[server]');
    expect(config).toContain('name = "Endstone Plugin Realm"');
    expect(config).toContain('port = 19132');
    expect(config).toContain('enabled = true');
  });

  it('formats plugin install plan for Python and C++ plugins', () => {
    const pythonPlan = EndstoneService.formatPluginInstallPlan('srv_1', {
      id: 'p1',
      name: 'ChatGuard',
      version: '1.0.0',
      description: 'Python filter',
      entrypoint: 'guard.py',
      enabled: true,
      serverId: 'srv_1',
      createdAt: new Date()
    });

    expect(pythonPlan.targetDirectory).toContain('/plugins/python');
    expect(pythonPlan.targetFilename).toBe('chatguard.py');
  });
});
