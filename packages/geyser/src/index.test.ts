import { describe, it, expect } from 'vitest';
import { GeyserBridgeManager } from './index';

describe('@mc-admin/geyser Cross-Play Bridge', () => {
  const dummyServer = {
    id: 'srv_test_geyser',
    name: 'Test Cross-Play Realm',
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

  it('provides default config values', () => {
    const cfg = GeyserBridgeManager.defaultConfig(dummyServer);
    expect(cfg.javaPort).toBe(25565);
    expect(cfg.bedrockPort).toBe(19132);
    expect(cfg.authType).toBe('floodgate');
  });

  it('enables and disables Geyser bridge for server', () => {
    const enabled = GeyserBridgeManager.enableBridge(dummyServer.id, { javaPort: 25565 });
    expect(enabled.javaPort).toBe(25565);

    const status = GeyserBridgeManager.getStatus(dummyServer.id);
    expect(status.enabled).toBe(true);
    expect(status.floodgateEnabled).toBe(true);

    const disabled = GeyserBridgeManager.disableBridge(dummyServer.id);
    expect(disabled).toBe(true);

    const statusAfter = GeyserBridgeManager.getStatus(dummyServer.id);
    expect(statusAfter.enabled).toBe(false);
  });

  it('generates valid Geyser YAML config format', () => {
    const cfg = GeyserBridgeManager.defaultConfig(dummyServer);
    const yaml = GeyserBridgeManager.generateGeyserYamlConfig(dummyServer, cfg);
    expect(yaml).toContain('GeyserMC Cross-Play Proxy Configuration');
    expect(yaml).toContain('port: 25565');
    expect(yaml).toContain('auth-type: floodgate');
  });
});
