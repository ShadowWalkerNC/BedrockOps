import { describe, it, expect } from 'vitest';
import { LanDiscoveryManager } from './index';

describe('@mc-admin/lan-discovery Console Friends-Tab Auto-Discovery', () => {
  const dummyServer = {
    id: 'srv_test_lan',
    name: 'Console Realm Test',
    host: '127.0.0.1',
    port: 19132,
    hostProvider: 'DOCKER_AGENT',
    version: '1.20.80',
    ownerId: 'usr_admin',
    agentId: 'node_docker_agent_1',
    status: 'ONLINE',
    createdAt: new Date(),
    updatedAt: new Date()
  } as any;

  it('starts and stops LAN broadcast discovery', () => {
    const status = LanDiscoveryManager.startDiscovery(dummyServer);
    expect(status.active).toBe(true);
    expect(status.targetAddress).toBe('127.0.0.1:19132');

    const current = LanDiscoveryManager.getStatus(dummyServer.id);
    expect(current.active).toBe(true);

    const stopped = LanDiscoveryManager.stopDiscovery(dummyServer.id);
    expect(stopped).toBe(true);

    const statusAfter = LanDiscoveryManager.getStatus(dummyServer.id);
    expect(statusAfter.active).toBe(false);
  });

  it('generates Phantom CLI arguments for console discovery', () => {
    const args = LanDiscoveryManager.generatePhantomLaunchArgs(dummyServer);
    expect(args).toContain('-server');
    expect(args).toContain('127.0.0.1:19132');
  });
});
