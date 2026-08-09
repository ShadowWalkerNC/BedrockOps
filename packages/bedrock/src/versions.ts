import { db as defaultDb, MemoryDatabase, BdsVersion, BedrockServer } from '@mc-admin/db';

/**
 * Wave C — BDS version matrix. Tracks the supported/latest Bedrock Dedicated
 * Server versions, checks a server's pinned version for drift, and pins new
 * versions (optionally requiring a backup first).
 */
export interface VersionCheck {
  serverId: string;
  pinnedVersion: string;
  latestVersion: string | null;
  isLatest: boolean;
  isSupported: boolean;
  mismatch: boolean;
  warning?: string;
}

export interface PinResult {
  ok: boolean;
  version: string;
  supported: boolean;
  previousVersion: string;
  requiresBackup: boolean;
}

export class BdsVersionMatrix {
  public static list(database: MemoryDatabase = defaultDb): BdsVersion[] {
    return database.bdsVersions;
  }

  public static latest(database: MemoryDatabase = defaultDb): BdsVersion | undefined {
    return database.bdsVersions.find((v) => v.isLatest);
  }

  public static find(version: string, database: MemoryDatabase = defaultDb): BdsVersion | undefined {
    return database.bdsVersions.find((v) => v.version === version);
  }

  public static checkServer(server: BedrockServer, database: MemoryDatabase = defaultDb): VersionCheck {
    const latest = this.latest(database);
    const pinned = server.version;
    const known = this.find(pinned, database);
    const isSupported = known ? known.isSupported : false;
    const isLatest = latest ? pinned === latest.version : false;
    const mismatch = latest ? pinned !== latest.version : false;

    let warning: string | undefined;
    if (!known) {
      warning = `Pinned BDS ${pinned} is not in the version catalog — compatibility unverified.`;
    } else if (!isSupported) {
      warning = `Pinned BDS ${pinned} is no longer supported; update recommended.`;
    } else if (mismatch && latest) {
      warning = `Pinned BDS ${pinned} is behind the latest supported ${latest.version}.`;
    }

    return {
      serverId: server.id,
      pinnedVersion: pinned,
      latestVersion: latest?.version ?? null,
      isLatest,
      isSupported,
      mismatch,
      warning
    };
  }

  /**
   * Pin a server to a specific BDS version. `backupBefore` signals the caller
   * to take a safety snapshot first (enforced at the API layer).
   */
  public static pin(
    server: BedrockServer,
    version: string,
    options: { backupBefore?: boolean } = {},
    database: MemoryDatabase = defaultDb
  ): PinResult {
    const known = this.find(version, database);
    const previousVersion = server.version;
    server.version = version;
    server.updatedAt = new Date();
    return {
      ok: true,
      version,
      supported: known?.isSupported ?? false,
      previousVersion,
      requiresBackup: options.backupBefore ?? false
    };
  }
}
