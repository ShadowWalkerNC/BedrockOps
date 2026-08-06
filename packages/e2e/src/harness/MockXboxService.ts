/**
 * MockXboxService.ts
 * E2E Test Harness Mock for Xbox Live / OpenXBL Gamertag resolution and Friend Bot dispatches
 */

export type FriendInviteStatus = 'PENDING' | 'ACCEPTED' | 'FAILED' | 'REVOKED';

export interface GamertagResolution {
  gamertag: string;
  xuid: string;
  success: boolean;
  resolvedAt: Date;
}

export interface FriendInviteRecord {
  id: string;
  gamertag: string;
  xuid: string;
  botGamertag: string;
  status: FriendInviteStatus;
  dispatchedAt: Date;
  updatedAt: Date;
}

export class MockXboxService {
  private customMappings: Map<string, string> = new Map(); // gamertag (lowercase) -> xuid
  private reverseMappings: Map<string, string> = new Map(); // xuid -> gamertag
  private inviteHistory: FriendInviteRecord[] = [];
  private botGamertag: string = 'BedrockOps Bot';

  constructor(botGamertag: string = 'BedrockOps Bot') {
    this.botGamertag = botGamertag;
  }

  /**
   * Register explicit Gamertag <-> XUID mapping
   */
  public registerMapping(gamertag: string, xuid: string): void {
    const key = gamertag.toLowerCase();
    this.customMappings.set(key, xuid);
    this.reverseMappings.set(xuid, gamertag);
  }

  /**
   * Generate a deterministic 64-bit XUID string for a given Gamertag
   * Standard Xbox XUIDs are 16-digit decimal numbers starting with 25354...
   */
  public generateDeterministicXuid(gamertag: string): string {
    let hash = 0;
    const str = gamertag.toLowerCase();
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    const positiveHash = Math.abs(hash).toString().padStart(11, '0').slice(0, 11);
    return `25354${positiveHash}`;
  }

  /**
   * Resolve Gamertag -> XUID
   */
  public async resolveGamertag(gamertag: string): Promise<GamertagResolution> {
    if (!gamertag || gamertag.trim().length === 0) {
      return {
        gamertag: '',
        xuid: '',
        success: false,
        resolvedAt: new Date(),
      };
    }

    const key = gamertag.trim().toLowerCase();
    let xuid = this.customMappings.get(key);

    if (!xuid) {
      xuid = this.generateDeterministicXuid(gamertag.trim());
      // Save for consistency
      this.customMappings.set(key, xuid);
      this.reverseMappings.set(xuid, gamertag.trim());
    }

    return {
      gamertag: gamertag.trim(),
      xuid,
      success: true,
      resolvedAt: new Date(),
    };
  }

  /**
   * Resolve XUID -> Gamertag
   */
  public async resolveXuid(xuid: string): Promise<GamertagResolution> {
    if (!xuid || xuid.trim().length === 0) {
      return {
        gamertag: '',
        xuid: '',
        success: false,
        resolvedAt: new Date(),
      };
    }

    const gamertag = this.reverseMappings.get(xuid.trim());
    if (gamertag) {
      return {
        gamertag,
        xuid: xuid.trim(),
        success: true,
        resolvedAt: new Date(),
      };
    }

    return {
      gamertag: `Player_${xuid.trim().slice(-6)}`,
      xuid: xuid.trim(),
      success: true,
      resolvedAt: new Date(),
    };
  }

  /**
   * Dispatch Xbox Friend Bot invitation to player Gamertag
   */
  public async dispatchFriendInvite(gamertag: string): Promise<FriendInviteRecord> {
    const resolution = await this.resolveGamertag(gamertag);
    const now = new Date();

    const record: FriendInviteRecord = {
      id: `invite-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      gamertag: resolution.gamertag,
      xuid: resolution.xuid,
      botGamertag: this.botGamertag,
      status: resolution.success ? 'PENDING' : 'FAILED',
      dispatchedAt: now,
      updatedAt: now,
    };

    this.inviteHistory.push(record);
    return record;
  }

  /**
   * Simulate acceptance of friend invitation by console player
   */
  public acceptFriendInvite(inviteIdOrGamertag: string): FriendInviteRecord | undefined {
    const record = this.inviteHistory.find(
      (r) => r.id === inviteIdOrGamertag || r.gamertag.toLowerCase() === inviteIdOrGamertag.toLowerCase()
    );

    if (record) {
      record.status = 'ACCEPTED';
      record.updatedAt = new Date();
    }

    return record;
  }

  /**
   * Retrieve list of friend invites with optional filters
   */
  public getInviteHistory(filter?: { gamertag?: string; status?: FriendInviteStatus }): FriendInviteRecord[] {
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

  /**
   * Clear invite history and mappings
   */
  public clearHistory(): void {
    this.inviteHistory = [];
    this.customMappings.clear();
    this.reverseMappings.clear();
  }
}
