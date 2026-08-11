import { describe, it, expect } from 'vitest';
import { WaterdogNetworkManager } from './index';

describe('@mc-admin/waterdog Multi-Server Proxy Network', () => {
  const dummyServers = [
    { id: 'srv_lobby', name: 'Lobby Server', host: '127.0.0.1', port: 19133 },
    { id: 'srv_survival', name: 'Survival Realm', host: '127.0.0.1', port: 19134 }
  ] as any[];

  it('builds network config and assigns lobby route', () => {
    const config = WaterdogNetworkManager.buildNetworkConfig('net_main', dummyServers, 'srv_lobby');
    expect(config.servers.length).toBe(2);
    expect(config.servers[0].isLobby).toBe(true);
    expect(config.servers[1].isLobby).toBe(false);
  });

  it('generates valid WaterdogPE YAML routing file', () => {
    const config = WaterdogNetworkManager.buildNetworkConfig('net_main', dummyServers, 'srv_lobby');
    const yaml = WaterdogNetworkManager.generateWaterdogYaml(config);
    expect(yaml).toContain('WaterdogPE Multi-Server Network Proxy Configuration');
    expect(yaml).toContain('lobby_server');
    expect(yaml).toContain('survival_realm');
  });
});
