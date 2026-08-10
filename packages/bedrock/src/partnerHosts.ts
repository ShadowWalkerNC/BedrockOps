import { HostProviderType } from '@mc-admin/db';

export type HostCapabilityState = 'wired' | 'stub' | 'needs_config';

export interface HostCapability {
  state: HostCapabilityState;
  detail?: string;
}

export interface HostProviderCapabilities {
  power: HostCapability;
  rcon: HostCapability;
  status: HostCapability;
  logs: HostCapability;
  backup: HostCapability;
  restore: HostCapability;
  properties: HostCapability;
  packs: HostCapability;
  worldFiles: HostCapability;
}

export interface HostProviderReadiness {
  type: HostProviderType;
  configured: boolean;
  summary: string;
  capabilities: HostProviderCapabilities;
}

export interface PterodactylPartnerConfig {
  apiBaseUrl?: string;
  apiKey?: string;
}

export interface DirectSshPartnerConfig {
  /** Optional future SSH lifecycle — unused until wired. */
  sshHost?: string;
  sshUser?: string;
  sshPrivateKeyPath?: string;
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Both-or-neither: partial Pterodactyl env is a validation error. */
export function parsePterodactylPartnerConfig(
  env: Record<string, string | undefined> = process.env
): PterodactylPartnerConfig {
  const apiBaseUrl = env.PTERODACTYL_API_BASE_URL?.trim() || undefined;
  const apiKey = env.PTERODACTYL_API_KEY?.trim() || undefined;
  if (present(apiBaseUrl) !== present(apiKey)) {
    throw new Error(
      'Pterodactyl partner config incomplete: set both PTERODACTYL_API_BASE_URL and PTERODACTYL_API_KEY, or neither.'
    );
  }
  return { apiBaseUrl, apiKey };
}

export function isPterodactylConfigured(cfg: PterodactylPartnerConfig): boolean {
  return present(cfg.apiBaseUrl) && present(cfg.apiKey);
}

export function parseDirectSshPartnerConfig(
  env: Record<string, string | undefined> = process.env
): DirectSshPartnerConfig {
  const sshHost = env.DIRECT_SSH_HOST?.trim() || undefined;
  const sshUser = env.DIRECT_SSH_USER?.trim() || undefined;
  const sshPrivateKeyPath = env.DIRECT_SSH_PRIVATE_KEY_PATH?.trim() || undefined;
  const any = present(sshHost) || present(sshUser) || present(sshPrivateKeyPath);
  const all = present(sshHost) && present(sshUser) && present(sshPrivateKeyPath);
  if (any && !all) {
    throw new Error(
      'Direct SSH partner config incomplete: set DIRECT_SSH_HOST, DIRECT_SSH_USER, and DIRECT_SSH_PRIVATE_KEY_PATH together, or omit all.'
    );
  }
  return { sshHost, sshUser, sshPrivateKeyPath };
}

export function isDirectSshConfigured(cfg: DirectSshPartnerConfig): boolean {
  return present(cfg.sshHost) && present(cfg.sshUser) && present(cfg.sshPrivateKeyPath);
}

function stubAll(detail: string): HostProviderCapabilities {
  const cap: HostCapability = { state: 'stub', detail };
  return {
    power: { ...cap },
    rcon: { ...cap },
    status: { ...cap },
    logs: { ...cap },
    backup: { ...cap },
    restore: { ...cap },
    properties: { ...cap },
    packs: { ...cap },
    worldFiles: { ...cap }
  };
}

function needsConfigAll(detail: string): HostProviderCapabilities {
  const cap: HostCapability = { state: 'needs_config', detail };
  return {
    power: { ...cap },
    rcon: { ...cap },
    status: { ...cap },
    logs: { ...cap },
    backup: { ...cap },
    restore: { ...cap },
    properties: { ...cap },
    packs: { ...cap },
    worldFiles: { ...cap }
  };
}

export function pterodactylReadiness(cfg: PterodactylPartnerConfig): HostProviderReadiness {
  if (!isPterodactylConfigured(cfg)) {
    return {
      type: HostProviderType.PTERODACTYL,
      configured: false,
      summary: 'Pterodactyl panel credentials unset — partner host ops stay stubbed.',
      capabilities: needsConfigAll('Set PTERODACTYL_API_BASE_URL + PTERODACTYL_API_KEY')
    };
  }
  return {
    type: HostProviderType.PTERODACTYL,
    configured: true,
    summary:
      'Pterodactyl credentials present — panel power/files API not wired yet (honest stub, no fake success).',
    capabilities: stubAll('Pterodactyl panel API integration pending')
  };
}

export function directRconSshReadiness(cfg: DirectSshPartnerConfig): HostProviderReadiness {
  const sshReady = isDirectSshConfigured(cfg);
  const caps: HostProviderCapabilities = {
    power: sshReady
      ? { state: 'stub', detail: 'SSH process lifecycle pending' }
      : { state: 'needs_config', detail: 'SSH env unset; power stays stubbed' },
    rcon: { state: 'wired', detail: 'Direct RCON via server host/rconPort' },
    status: { state: 'stub', detail: 'SSH/metrics collector pending' },
    logs: { state: 'stub', detail: 'SSH log tail pending' },
    backup: { state: 'stub', detail: 'SSH backup pending' },
    restore: { state: 'stub', detail: 'SSH restore pending' },
    properties: { state: 'stub', detail: 'SSH properties write pending' },
    packs: { state: 'stub', detail: 'SSH pack install pending' },
    worldFiles: { state: 'stub', detail: 'SSH world file IO pending' }
  };
  return {
    type: HostProviderType.DIRECT_RCON_SSH,
    configured: true, // RCON path always available; SSH is optional
    summary: sshReady
      ? 'Direct RCON wired; SSH lifecycle credentials present but process control still stubbed.'
      : 'Direct RCON wired; SSH lifecycle env unset (power/files remain stubs).',
    capabilities: caps
  };
}

export function dockerAgentReadiness(agentTunnelBound: boolean): HostProviderReadiness {
  const wired: HostCapability = {
    state: agentTunnelBound ? 'wired' : 'needs_config',
    detail: agentTunnelBound ? 'Outbound agent tunnel' : 'Agent tunnel gateway not bound'
  };
  const stubLogs: HostCapability = { state: 'stub', detail: 'Console stream uses dedicated WS path' };
  return {
    type: HostProviderType.DOCKER_AGENT,
    configured: agentTunnelBound,
    summary: agentTunnelBound
      ? 'Docker agent tunnel bound — primary Wave A host path.'
      : 'Docker agent tunnel not bound in this process.',
    capabilities: {
      power: wired,
      rcon: wired,
      status: wired,
      logs: stubLogs,
      backup: wired,
      restore: wired,
      properties: wired,
      packs: wired,
      worldFiles: wired
    }
  };
}
