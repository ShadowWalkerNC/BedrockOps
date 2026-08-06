import { describe, it, expect } from 'vitest';
import {
  HostProviderFactory,
  DockerAgentHostProvider,
  PterodactylHostProvider,
  DirectRconSshHostProvider
} from './provider';
import { db, HostProviderType } from '@mc-admin/db';

describe('HostProvider Strategy Pattern', () => {
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
    expect(rconResult).toContain('Executed "list"');

    const metrics = await provider.getStatus(server);
    expect(metrics).toHaveProperty('cpuPercent');
    expect(metrics).toHaveProperty('memoryMb');
  });
});
