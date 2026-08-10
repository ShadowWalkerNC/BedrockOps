import { describe, it, expect, beforeEach } from 'vitest';
import {
  HostProviderFactory,
  parsePterodactylPartnerConfig,
  parseDirectSshPartnerConfig,
  pterodactylReadiness,
  directRconSshReadiness
} from './index';

describe('Wave D5 partner host readiness', () => {
  beforeEach(() => {
    HostProviderFactory.reset();
  });

  it('rejects partial Pterodactyl env', () => {
    expect(() =>
      parsePterodactylPartnerConfig({ PTERODACTYL_API_BASE_URL: 'https://panel.example.com' })
    ).toThrow(/incomplete/);
  });

  it('accepts both-or-neither Pterodactyl env', () => {
    expect(parsePterodactylPartnerConfig({})).toEqual({});
    expect(
      parsePterodactylPartnerConfig({
        PTERODACTYL_API_BASE_URL: 'https://panel.example.com',
        PTERODACTYL_API_KEY: 'ptla_x'
      }).apiBaseUrl
    ).toBe('https://panel.example.com');
  });

  it('marks Pterodactyl needs_config when unset and stub when credentials present', () => {
    expect(pterodactylReadiness({}).capabilities.power.state).toBe('needs_config');
    expect(
      pterodactylReadiness({
        apiBaseUrl: 'https://panel.example.com',
        apiKey: 'ptla_x'
      }).capabilities.power.state
    ).toBe('stub');
  });

  it('marks Direct RCON as wired and SSH power as needs_config without SSH env', () => {
    const readiness = directRconSshReadiness({});
    expect(readiness.capabilities.rcon.state).toBe('wired');
    expect(readiness.capabilities.power.state).toBe('needs_config');
  });

  it('rejects partial Direct SSH env', () => {
    expect(() => parseDirectSshPartnerConfig({ DIRECT_SSH_HOST: '10.0.0.1' })).toThrow(/incomplete/);
  });

  it('binds partner hosts from env onto the factory', () => {
    HostProviderFactory.bindPartnerHosts({
      PTERODACTYL_API_BASE_URL: 'https://panel.example.com',
      PTERODACTYL_API_KEY: 'ptla_x'
    });
    const list = HostProviderFactory.listReadiness();
    expect(list.some((r) => r.type === 'PTERODACTYL' && r.configured)).toBe(true);
    expect(list.some((r) => r.type === 'DIRECT_RCON_SSH' && r.capabilities.rcon.state === 'wired')).toBe(
      true
    );
  });
});
