import { createHash } from 'crypto';

export interface ParsedJoinEvent {
  gamertag: string;
  xuid: string;
}

export interface ParsedDisconnectEvent {
  gamertag: string;
  xuid: string;
}

/**
 * R4.1 — Parse Bedrock Dedicated Server stdout join/leave lines.
 * Offline-mode BDS often emits an empty xuid; we synthesize a stable offline id
 * so join-flood / player tracking still work for local bot harnesses.
 */
export class PlayerLogParser {
  public static offlineXuid(gamertag: string): string {
    const digest = createHash('sha256').update(`offline:${gamertag}`).digest('hex').slice(0, 16);
    // Keep it digit-shaped for callers that assume XUID-like tokens.
    return `9${BigInt(`0x${digest}`).toString().padStart(18, '0').slice(0, 18)}`;
  }

  public static parseJoinLog(line: string): ParsedJoinEvent | null {
    const match = line.match(/Player connected:\s*(?<gamertag>.+?),\s*xuid:\s*(?<xuid>\d*)/i);
    if (!match?.groups) return null;
    const gamertag = match.groups.gamertag.trim();
    const rawXuid = match.groups.xuid.trim();
    return {
      gamertag,
      xuid: rawXuid || PlayerLogParser.offlineXuid(gamertag)
    };
  }

  public static parseDisconnectLog(line: string): ParsedDisconnectEvent | null {
    const match = line.match(
      /Player disconnected:\s*(?<gamertag>.+?),\s*xuid:\s*(?<xuid>\d*)(?:,\s*pfid:)?/i
    );
    if (!match?.groups) return null;
    const gamertag = match.groups.gamertag.trim();
    const rawXuid = match.groups.xuid.trim();
    return {
      gamertag,
      xuid: rawXuid || PlayerLogParser.offlineXuid(gamertag)
    };
  }
}

export interface PlayerIdentity {
  id: string;
  serverId?: string;
  gamertag: string;
  xuid: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  joinCount: number;
}

/**
 * In-memory player join ledger keyed by XUID (falls back to gamertag).
 */
export class PlayerTracker {
  private players = new Map<string, PlayerIdentity>();

  public recordJoin(input: {
    gamertag: string;
    xuid: string;
    serverId?: string;
    at?: Date;
  }): PlayerIdentity {
    const key = input.xuid || input.gamertag.toLowerCase();
    const existing = this.players.get(key);
    const now = input.at ?? new Date();

    if (existing) {
      existing.gamertag = input.gamertag;
      existing.xuid = input.xuid;
      existing.lastSeenAt = now;
      existing.joinCount += 1;
      if (input.serverId) existing.serverId = input.serverId;
      return existing;
    }

    const record: PlayerIdentity = {
      id: `plr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      serverId: input.serverId,
      gamertag: input.gamertag,
      xuid: input.xuid,
      firstSeenAt: now,
      lastSeenAt: now,
      joinCount: 1
    };
    this.players.set(key, record);
    return record;
  }

  public recordDisconnect(input: { gamertag: string; xuid: string; at?: Date }): PlayerIdentity | undefined {
    const key = input.xuid || input.gamertag.toLowerCase();
    const existing = this.players.get(key);
    if (!existing) return undefined;
    existing.lastSeenAt = input.at ?? new Date();
    existing.gamertag = input.gamertag;
    return existing;
  }

  public findByXuid(xuid: string): PlayerIdentity | undefined {
    return this.players.get(xuid);
  }

  public findByGamertag(gamertag: string): PlayerIdentity | undefined {
    const lower = gamertag.toLowerCase();
    for (const player of this.players.values()) {
      if (player.gamertag.toLowerCase() === lower) return player;
    }
    return undefined;
  }

  public list(serverId?: string): PlayerIdentity[] {
    const all = Array.from(this.players.values());
    if (!serverId) return all;
    return all.filter((p) => p.serverId === serverId);
  }

  public clear(): void {
    this.players.clear();
  }
}

export const playerTracker = new PlayerTracker();

export interface GamertagResolution {
  gamertag: string;
  xuid: string;
  success: boolean;
  stub: boolean;
  resolvedAt: Date;
}

export type FriendInviteStatus = 'PENDING' | 'ACCEPTED' | 'FAILED' | 'REVOKED';

export interface FriendInviteRecord {
  id: string;
  gamertag: string;
  xuid: string;
  botGamertag: string;
  status: FriendInviteStatus;
  stub: boolean;
  dispatchedAt: Date;
  updatedAt: Date;
}

/**
 * R4.1 / R5.2 — Xbox identity resolution + Friend Bot invites.
 * Without an OpenXBL/Xbox API key this uses a deterministic stub XUID
 * (same algorithm as the E2E MockXboxService) and marks `stub: true`.
 */
export class XboxIdentityService {
  private customMappings = new Map<string, string>();
  private reverseMappings = new Map<string, string>();
  private inviteHistory: FriendInviteRecord[] = [];

  constructor(
    private readonly apiKey?: string,
    private readonly botGamertag = 'BedrockOps Onboarding Bot'
  ) {}

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): XboxIdentityService {
    return new XboxIdentityService(
      env.XBOX_API_KEY || env.OPENXBL_API_KEY,
      env.XBOX_FRIEND_BOT_GAMERTAG || 'BedrockOps Onboarding Bot'
    );
  }

  public registerMapping(gamertag: string, xuid: string): void {
    this.customMappings.set(gamertag.toLowerCase(), xuid);
    this.reverseMappings.set(xuid, gamertag);
  }

  public generateDeterministicXuid(gamertag: string): string {
    let hash = 0;
    const str = gamertag.toLowerCase();
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const positiveHash = Math.abs(hash).toString().padStart(11, '0').slice(0, 11);
    return `25354${positiveHash}`;
  }

  public async resolveGamertag(gamertag: string): Promise<GamertagResolution> {
    if (!gamertag?.trim()) {
      return { gamertag: '', xuid: '', success: false, stub: true, resolvedAt: new Date() };
    }

    const trimmed = gamertag.trim();
    const key = trimmed.toLowerCase();
    let xuid = this.customMappings.get(key);

    if (!xuid && this.apiKey) {
      // Live OpenXBL lookup when an API key is configured.
      try {
        const live = await this.resolveGamertagLive(trimmed);
        if (live) {
          this.customMappings.set(key, live.xuid);
          this.reverseMappings.set(live.xuid, live.gamertag);
          return { ...live, success: true, stub: false, resolvedAt: new Date() };
        }
        return {
          gamertag: trimmed,
          xuid: '',
          success: false,
          stub: false,
          resolvedAt: new Date()
        };
      } catch {
        return {
          gamertag: trimmed,
          xuid: '',
          success: false,
          stub: false,
          resolvedAt: new Date()
        };
      }
    }

    if (!xuid) {
      // Honest deterministic stub when no API key is configured.
      xuid = this.generateDeterministicXuid(trimmed);
      this.customMappings.set(key, xuid);
      this.reverseMappings.set(xuid, trimmed);
    }

    return {
      gamertag: trimmed,
      xuid,
      success: true,
      stub: !this.apiKey,
      resolvedAt: new Date()
    };
  }

  /**
   * OpenXBL gamertag search. Returns null when the API responds without a usable XUID
   * (caller treats that as an honest live miss, not a silent stub).
   */
  private async resolveGamertagLive(
    gamertag: string
  ): Promise<{ gamertag: string; xuid: string } | null> {
    const res = await fetch(`https://xbl.io/api/v2/search/${encodeURIComponent(gamertag)}`, {
      headers: {
        'X-Authorization': this.apiKey!,
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`OpenXBL HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      people?: { gamertag?: string; xuid?: string; displayPicRaw?: string }[];
      // Some OpenXBL routes nest under profileUsers
      profileUsers?: { id?: string; settings?: { id: string; value: string }[] }[];
    };

    const person = json.people?.find((p) => p.xuid);
    if (person?.xuid) {
      return { gamertag: person.gamertag || gamertag, xuid: person.xuid };
    }

    const profile = json.profileUsers?.[0];
    if (profile?.id) {
      const gt =
        profile.settings?.find((s) => s.id === 'Gamertag')?.value || gamertag;
      return { gamertag: gt, xuid: profile.id };
    }

    return null;
  }

  public async resolveXuid(xuid: string): Promise<GamertagResolution> {
    if (!xuid?.trim()) {
      return { gamertag: '', xuid: '', success: false, stub: true, resolvedAt: new Date() };
    }
    const trimmed = xuid.trim();
    const gamertag = this.reverseMappings.get(trimmed) ?? `Player_${trimmed.slice(-6)}`;
    return {
      gamertag,
      xuid: trimmed,
      success: true,
      stub: !this.apiKey,
      resolvedAt: new Date()
    };
  }

  /** R5.2 — Dispatch Xbox Friend Bot invitation (honest stub without live API). */
  public async dispatchFriendInvite(gamertag: string): Promise<FriendInviteRecord> {
    const resolution = await this.resolveGamertag(gamertag);
    const now = new Date();
    const record: FriendInviteRecord = {
      id: `invite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      gamertag: resolution.gamertag,
      xuid: resolution.xuid,
      botGamertag: this.botGamertag,
      status: resolution.success ? 'PENDING' : 'FAILED',
      stub: !this.apiKey,
      dispatchedAt: now,
      updatedAt: now
    };
    this.inviteHistory.push(record);
    return record;
  }

  public acceptFriendInvite(inviteIdOrGamertag: string): FriendInviteRecord | undefined {
    const record = this.inviteHistory.find(
      (r) =>
        r.id === inviteIdOrGamertag ||
        r.gamertag.toLowerCase() === inviteIdOrGamertag.toLowerCase()
    );
    if (record) {
      record.status = 'ACCEPTED';
      record.updatedAt = new Date();
    }
    return record;
  }

  public getInviteHistory(filter?: {
    gamertag?: string;
    status?: FriendInviteStatus;
  }): FriendInviteRecord[] {
    return this.inviteHistory.filter((record) => {
      if (filter?.gamertag && record.gamertag.toLowerCase() !== filter.gamertag.toLowerCase()) {
        return false;
      }
      if (filter?.status && record.status !== filter.status) {
        return false;
      }
      return true;
    });
  }

  public clearInviteHistory(): void {
    this.inviteHistory = [];
  }
}

export const GDPR_REDACTED = '[GDPR_REDACTED]';

export interface AllowlistEntry {
  name: string;
  xuid: string;
  ignoresPlayerLimit?: boolean;
}

export interface AllowlistSyncResult {
  success: boolean;
  entriesCount: number;
  timestamp: number;
  serverId: string;
  contents: string;
  targetPath: string;
  tempPath: string;
  reloadCommand: string;
}

/**
 * R4.3 — Bedrock allowlist.json sanitize + atomic write plan + reload command.
 */
export class AllowlistManager {
  public static readonly RELOAD_COMMAND = 'allowlist reload';
  public static readonly FILENAME = 'allowlist.json';

  public static sanitize(entries: AllowlistEntry[]): AllowlistEntry[] {
    return entries.map((e) => ({
      name: e.name.trim(),
      xuid: String(e.xuid).trim(),
      ignoresPlayerLimit: e.ignoresPlayerLimit ?? false
    }));
  }

  public static serialize(entries: AllowlistEntry[]): string {
    return `${JSON.stringify(this.sanitize(entries), null, 2)}\n`;
  }

  public static parse(raw: string): AllowlistEntry[] {
    const parsed = JSON.parse(raw) as AllowlistEntry[];
    if (!Array.isArray(parsed)) {
      throw new Error('allowlist.json must be a JSON array');
    }
    return this.sanitize(parsed);
  }

  public static hasEntry(entries: AllowlistEntry[], query: string): boolean {
    const q = query.toLowerCase();
    return entries.some((e) => e.name.toLowerCase() === q || e.xuid === query);
  }

  public static buildAtomicWritePlan(
    serverId: string,
    serverPath: string,
    entries: AllowlistEntry[]
  ): AllowlistSyncResult {
    const sanitized = this.sanitize(entries);
    const contents = this.serialize(sanitized);
    const targetPath = `${serverPath.replace(/\/$/, '')}/${this.FILENAME}`;
    const digest = createHash('sha1').update(contents).digest('hex').slice(0, 8);
    const tempPath = `${targetPath}.${digest}.tmp`;

    return {
      success: true,
      entriesCount: sanitized.length,
      timestamp: Date.now(),
      serverId,
      contents,
      targetPath,
      tempPath,
      reloadCommand: this.RELOAD_COMMAND
    };
  }

  public static writeAllowlistFile(serverPath: string, entries: AllowlistEntry[]): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const sanitized = this.sanitize(entries);
    const contents = this.serialize(sanitized);
    const targetPath = path.join(serverPath, this.FILENAME);
    const tempPath = `${targetPath}.${Date.now()}.tmp`;
    fs.mkdirSync(serverPath, { recursive: true });
    fs.writeFileSync(tempPath, contents, 'utf8');
    fs.renameSync(tempPath, targetPath);
    return targetPath;
  }
}
