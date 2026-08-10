import { describe, it, expect, beforeEach } from 'vitest';
import {
  HostProviderFactory,
  DockerAgentHostProvider,
  PterodactylHostProvider,
  DirectRconSshHostProvider,
  AgentTunnelGatewayLike
} from './provider';
import { db, HostProviderType } from '@mc-admin/db';

describe('HostProvider Strategy Pattern', () => {
  beforeEach(() => {
    HostProviderFactory.reset();
  });

  it('resolves correct strategy implementations from HostProviderFactory', () => {
    const dockerProvider = HostProviderFactory.getProvider(HostProviderType.DOCKER_AGENT);
    expect(dockerProvider).toBeInstanceOf(DockerAgentHostProvider);
    expect(dockerProvider.type).toBe(HostProviderType.DOCKER_AGENT);

    const pteroProvider = HostProviderFactory.getProvider(HostProviderType.PTERODACTYL);
    expect(pteroProvider).toBeInstanceOf(PterodactylHostProvider);
    expect(pteroProvider.type).toBe(HostProviderType.PTERODACTYL);

    const directProvider = HostProviderFactory.getProvider(HostProviderType.DIRECT_RCON_SSH);
    expect(directProvider).toBeInstanceOf(DirectRconSshHostProvider);
    expect(directProvider.type).toBe(HostProviderType.DIRECT_RCON_SSH);
  });

  it('executes server actions via strategy instance', async () => {
    const server = db.servers[0];
    const provider = HostProviderFactory.getProvider(HostProviderType.DOCKER_AGENT);

    const startResult = await provider.startServer(server);
    expect(startResult).toBe(false);

    const rconResult = await provider.executeRcon(server, 'list');
    // Disconnected Docker agent → honest stub (never fake command success).
    expect(rconResult).toContain('[STUB]');
    expect(rconResult).toContain('list');

    const direct = HostProviderFactory.getProvider(HostProviderType.DIRECT_RCON_SSH);
    const directRcon = await direct.executeRcon(server, 'list');
    expect(directRcon).toContain('[RCON ERROR]');
    expect(directRcon).toContain('list');

    const metrics = await provider.getStatus(server);
    expect(metrics).toHaveProperty('cpuPercent');
    expect(metrics).toHaveProperty('memoryMb');
  });

  it('routes power and RCON through a bound agent tunnel gateway', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const gateway: AgentTunnelGatewayLike = {
      isNodeConnected: () => true,
      sendCommand: async (_nodeId, _serverId, command, payload) => {
        calls.push({ command, payload });
        if (command === 'POWER_ACTION') {
          return { success: true, state: 'ONLINE', mode: 'simulated' };
        }
        if (command === 'RCON_COMMAND') {
          return { success: false, stub: true, output: 'rcon stub ok' };
        }
        if (command === 'GET_STATUS') {
          return { cpuPercent: 12, memoryMb: 256, uptimeSeconds: 40, activePlayers: 2 };
        }
        return { success: true };
      }
    };

    const provider = HostProviderFactory.bindAgentTunnel(gateway);
    const server = db.servers[0];

    expect(await provider.startServer(server)).toBe(true);
    expect(calls[0]).toEqual({
      command: 'POWER_ACTION',
      payload: { action: 'START', serverPath: server.serverPath }
    });

    const rcon = await provider.executeRcon(server, 'list');
    expect(rcon).toContain('rcon stub ok');
    expect(calls[1].payload).toEqual({ rconCommand: 'list' });

    const status = await provider.getStatus(server);
    expect(status.cpuPercent).toBe(12);
    expect(status.memoryMb).toBe(256);
    expect(status.activePlayers).toBe(2);
  });

  it('writes server.properties through WRITE_PROPERTIES when agent is connected', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const gateway: AgentTunnelGatewayLike = {
      isNodeConnected: () => true,
      sendCommand: async (_nodeId, _serverId, command, payload) => {
        calls.push({ command, payload });
        return { success: true, output: `wrote ${payload.targetPath}` };
      }
    };
    const provider = HostProviderFactory.bindAgentTunnel(gateway);
    const server = db.servers[0];
    const result = await provider.writeServerProperties(server, {
      targetPath: `${server.serverPath}/server.properties`,
      tempPath: `${server.serverPath}/server.properties.tmp`,
      contents: 'gamemode=survival\n'
    });
    expect(result.success).toBe(true);
    expect(calls[0].command).toBe('WRITE_PROPERTIES');
    expect(calls[0].payload.contents).toContain('gamemode=survival');
  });

  it('writes pack files through WRITE_PACK_FILES when agent is connected', async () => {
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const gateway: AgentTunnelGatewayLike = {
      isNodeConnected: () => true,
      sendCommand: async (_nodeId, _serverId, command, payload) => {
        calls.push({ command, payload });
        return { success: true, output: 'wrote 2 pack files under /tmp' };
      }
    };
    const provider = HostProviderFactory.bindAgentTunnel(gateway);
    const result = await provider.writePackFiles(db.servers[0], {
      files: [
        { relativePath: 'worlds/Bedrock level/behavior_packs/p/manifest.json', contents: '{}\n' },
        { relativePath: 'worlds/Bedrock level/world_behavior_packs.json', contents: '[]\n' }
      ]
    });
    expect(result.success).toBe(true);
    expect(result.filesWritten).toBe(2);
    expect(calls[0].command).toBe('WRITE_PACK_FILES');
  });

  it('returns false when bound tunnel reports agent disconnected', async () => {
    const gateway: AgentTunnelGatewayLike = {
      isNodeConnected: () => false,
      sendCommand: async () => {
        throw new Error('should not be called');
      }
    };
    const provider = HostProviderFactory.bindAgentTunnel(gateway);
    expect(await provider.startServer(db.servers[0])).toBe(false);
  });
});
