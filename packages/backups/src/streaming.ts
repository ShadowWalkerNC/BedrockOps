import { createHash, createHmac, randomBytes } from 'crypto';

export interface WorldFileEntry {
  path: string;
  size: number;
}

export type SaveHoldPhase = 'HOLD' | 'QUERY' | 'RESUME' | 'DONE' | 'FAILED';

export interface SaveHoldResult {
  success: boolean;
  files: WorldFileEntry[];
  phases: SaveHoldPhase[];
  queryOutput?: string;
  error?: string;
}

export type RconExecutor = (command: string) => Promise<string>;

/**
 * R3.1 — Bedrock save-hold checkpoint driver.
 * Sequence: `save hold` → `save query` → (caller snapshots files) → `save resume`.
 */
export class SaveHoldDriver {
  public static readonly COMMANDS = {
    hold: 'save hold',
    query: 'save query',
    resume: 'save resume'
  } as const;

  /**
   * Parse BDS `save query` stdout listing: `path:size, path:size, ...`
   * Mirrors MockBdsLogStreamer.parseSaveQueryLog for production use.
   */
  public static parseSaveQueryOutput(line: string): WorldFileEntry[] | null {
    if (!line.includes(':') || line.includes('[INFO]')) {
      return null;
    }

    const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
    const files: WorldFileEntry[] = [];

    for (const part of parts) {
      const colIndex = part.lastIndexOf(':');
      if (colIndex === -1) continue;
      const path = part.substring(0, colIndex).trim();
      const size = parseInt(part.substring(colIndex + 1).trim(), 10);
      if (path && !Number.isNaN(size)) {
        files.push({ path, size });
      }
    }

    return files.length > 0 ? files : null;
  }

  /**
   * Run the live checkpoint RCON sequence.
   * Always attempts `save resume` in a finally-style path so the world is not left frozen.
   */
  public static async runCheckpoint(execRcon: RconExecutor): Promise<SaveHoldResult> {
    const phases: SaveHoldPhase[] = [];
    let files: WorldFileEntry[] = [];
    let queryOutput: string | undefined;

    try {
      phases.push('HOLD');
      await execRcon(this.COMMANDS.hold);

      phases.push('QUERY');
      queryOutput = await execRcon(this.COMMANDS.query);
      const parsed = this.parseSaveQueryOutput(queryOutput)
        ?? this.parseSaveQueryOutput(this.extractListingLine(queryOutput));
      if (!parsed) {
        throw new Error(`Unable to parse save query output: ${queryOutput.slice(0, 200)}`);
      }
      files = parsed;

      phases.push('RESUME');
      await execRcon(this.COMMANDS.resume);
      phases.push('DONE');

      return { success: true, files, phases, queryOutput };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await execRcon(this.COMMANDS.resume);
        if (!phases.includes('RESUME')) {
          phases.push('RESUME');
        }
      } catch {
        // Resume failure is secondary; surface the original error.
      }
      phases.push('FAILED');
      return { success: false, files, phases, queryOutput, error: message };
    }
  }

  /** Prefer the last non-empty line that looks like a file listing. */
  private static extractListingLine(raw: string): string {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(':') && !lines[i].includes('[INFO]')) {
        return lines[i];
      }
    }
    return raw;
  }
}

export interface BackupManifest {
  version: 1;
  backupId: string;
  serverId: string;
  createdAt: string;
  files: WorldFileEntry[];
  archiveSha256: string;
  fileSizeBytes: number;
  isHoldCheckpoint: boolean;
}

export interface ManifestVerifyResult {
  ok: boolean;
  errors: string[];
}

/**
 * R3.3 — SHA256 hashing helpers and snapshot manifest verification.
 */
export class ManifestVerifier {
  public static isValidSha256(hash: string): boolean {
    return /^[a-f0-9]{64}$/i.test(hash);
  }

  public static sha256Hex(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  public static buildManifest(input: {
    backupId: string;
    serverId: string;
    files: WorldFileEntry[];
    archiveSha256: string;
    fileSizeBytes: number;
    isHoldCheckpoint?: boolean;
    createdAt?: Date;
  }): BackupManifest {
    return {
      version: 1,
      backupId: input.backupId,
      serverId: input.serverId,
      createdAt: (input.createdAt ?? new Date()).toISOString(),
      files: input.files,
      archiveSha256: input.archiveSha256.toLowerCase(),
      fileSizeBytes: input.fileSizeBytes,
      isHoldCheckpoint: input.isHoldCheckpoint ?? true
    };
  }

  public static verify(
    manifest: BackupManifest,
    expected: { archiveSha256: string; fileSizeBytes: number }
  ): ManifestVerifyResult {
    const errors: string[] = [];

    if (manifest.version !== 1) {
      errors.push(`unsupported manifest version: ${manifest.version}`);
    }
    if (!this.isValidSha256(manifest.archiveSha256)) {
      errors.push('manifest.archiveSha256 is not a valid SHA-256 hex digest');
    }
    if (!this.isValidSha256(expected.archiveSha256)) {
      errors.push('expected archiveSha256 is not a valid SHA-256 hex digest');
    }
    if (manifest.archiveSha256.toLowerCase() !== expected.archiveSha256.toLowerCase()) {
      errors.push('archive SHA-256 mismatch');
    }
    if (manifest.fileSizeBytes !== expected.fileSizeBytes) {
      errors.push(
        `file size mismatch: manifest=${manifest.fileSizeBytes} actual=${expected.fileSizeBytes}`
      );
    }

    return { ok: errors.length === 0, errors };
  }
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  jurisdiction?: string;
}

export interface PresignResult {
  url: string;
  objectKey: string;
  stub: boolean;
  expiresAt: Date;
  error?: string;
}

/**
 * R3.2 — Cloudflare R2 (S3-compatible) presigned PUT URL generator.
 * Uses SigV4 without pulling the full AWS SDK.
 */
export class R2PresignClient {
  constructor(private readonly config?: R2Config) {}

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): R2PresignClient {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    if (accountId && accessKeyId && secretAccessKey && bucket) {
      return new R2PresignClient({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        jurisdiction: env.R2_JURISDICTION
      });
    }
    return new R2PresignClient(undefined);
  }

  public isConfigured(): boolean {
    return !!this.config;
  }

  public async createPresignedPutUrl(
    objectKey: string,
    expiresInSeconds = 3600
  ): Promise<PresignResult> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    if (!this.config) {
      return {
        url: '',
        objectKey,
        stub: true,
        expiresAt,
        error: '[STUB] R2 credentials not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)'
      };
    }

    const url = this.signPutUrl(objectKey, expiresInSeconds);
    return { url, objectKey, stub: false, expiresAt };
  }

  private signPutUrl(objectKey: string, expiresInSeconds: number): string {
    const cfg = this.config!;
    const region = 'auto';
    const service = 's3';
    const host = cfg.jurisdiction
      ? `${cfg.accountId}.${cfg.jurisdiction}.r2.cloudflarestorage.com`
      : `${cfg.accountId}.r2.cloudflarestorage.com`;
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const credential = `${cfg.accessKeyId}/${credentialScope}`;

    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host'
    });

    const canonicalQuery = [...query.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalRequest = [
      'PUT',
      `/${encodedKey}`,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD'
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSignatureKey(cfg.secretAccessKey, dateStamp, region, service);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `https://${host}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}

/** Deterministic object key helper for backup archives. */
export function buildBackupObjectKey(serverId: string, backupId: string, filename: string): string {
  return `backups/${serverId}/${backupId}/${filename}`;
}

/** Generate a short nonce for backup IDs when Date.now collisions matter in tests. */
export function backupIdNonce(): string {
  return randomBytes(3).toString('hex');
}
