import { createGzip } from 'zlib';
import { createReadStream, promises as fs } from 'fs';
import { join, relative, sep } from 'path';
import { PassThrough, Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { db, BackupRecord, BackupStatus } from '@mc-admin/db';
import {
  BackupManifest,
  ManifestVerifier,
  R2PresignClient,
  SaveHoldDriver,
  WorldFileEntry,
  backupIdNonce,
  buildBackupObjectKey
} from './streaming';

export * from './streaming';

export interface CreateBackupInput {
  serverId: string;
  isManual: boolean;
  notes?: string;
}

export interface RestoreBackupResult {
  success: boolean;
  stub?: boolean;
  message: string;
}

export interface CompleteBackupOptions {
  fileSizeBytes: number;
  sha256?: string;
  storageUrl?: string;
  manifest?: BackupManifest;
  verified?: boolean;
}

export interface StreamingBackupJob {
  record: BackupRecord;
  objectKey: string;
  presignedUploadUrl: string;
  presignStub: boolean;
  presignError?: string;
  saveHoldCommands: string[];
}

/**
 * R3 — Backup snapshot engine with streaming R2 upload orchestration,
 * save-hold checkpoints, and SHA256 manifest verification.
 */
export class BackupEngine {
  public static triggerBackup(input: CreateBackupInput): BackupRecord {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${input.serverId}_${timestamp}.tar.gz`;
    const storagePath = `/backups/${input.serverId}/${filename}`;

    const record: BackupRecord = {
      id: `bkp_${Date.now()}_${backupIdNonce()}`,
      serverId: input.serverId,
      filename,
      fileSizeBytes: 0,
      status: BackupStatus.PENDING,
      isManual: input.isManual,
      notes: input.notes,
      storagePath,
      createdAt: new Date()
    };

    db.backups.push(record);
    return record;
  }

  /**
   * Prepare a streaming backup job: PENDING record + optional R2 presigned PUT URL.
   * Does not claim the archive succeeded — callers must dispatch to the agent and complete/fail.
   */
  public static async prepareStreamingBackup(
    input: CreateBackupInput,
    r2: R2PresignClient = R2PresignClient.fromEnv()
  ): Promise<StreamingBackupJob> {
    const record = this.triggerBackup(input);
    record.status = BackupStatus.RUNNING;
    const objectKey = buildBackupObjectKey(record.serverId, record.id, record.filename);
    const presign = await r2.createPresignedPutUrl(objectKey);

    if (!presign.stub) {
      record.storageUrl = `r2://${objectKey}`;
    }

    return {
      record,
      objectKey,
      presignedUploadUrl: presign.url,
      presignStub: presign.stub,
      presignError: presign.error,
      saveHoldCommands: [
        SaveHoldDriver.COMMANDS.hold,
        SaveHoldDriver.COMMANDS.query,
        SaveHoldDriver.COMMANDS.resume
      ]
    };
  }

  /** Finalize a backup after agent/worker completes archive I/O. */
  public static completeBackup(
    backupId: string,
    fileSizeBytesOrOptions: number | CompleteBackupOptions
  ): BackupRecord {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      throw new Error(`Backup ID ${backupId} not found`);
    }

    const options: CompleteBackupOptions =
      typeof fileSizeBytesOrOptions === 'number'
        ? { fileSizeBytes: fileSizeBytesOrOptions }
        : fileSizeBytesOrOptions;

    if (options.sha256 && options.manifest) {
      const verified = ManifestVerifier.verify(options.manifest, {
        archiveSha256: options.sha256,
        fileSizeBytes: options.fileSizeBytes
      });
      if (!verified.ok) {
        backup.status = BackupStatus.FAILED;
        backup.notes = [backup.notes, `manifest verification failed: ${verified.errors.join('; ')}`]
          .filter(Boolean)
          .join(' ');
        throw new Error(`Manifest verification failed: ${verified.errors.join('; ')}`);
      }
      backup.verified = true;
      backup.manifest = options.manifest as unknown as Record<string, unknown>;
    } else if (options.sha256) {
      if (!ManifestVerifier.isValidSha256(options.sha256)) {
        throw new Error('Invalid SHA-256 digest');
      }
      backup.verified = options.verified ?? false;
    } else if (options.verified !== undefined) {
      backup.verified = options.verified;
    }

    if (options.manifest && !options.sha256) {
      backup.manifest = options.manifest as unknown as Record<string, unknown>;
    }
    if (options.storageUrl) {
      backup.storageUrl = options.storageUrl;
    }

    backup.status = BackupStatus.COMPLETED;
    backup.fileSizeBytes = options.fileSizeBytes;
    if (options.sha256) {
      backup.sha256 = options.sha256.toLowerCase();
    }
    return backup;
  }

  public static failBackup(backupId: string, error: string): BackupRecord {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      throw new Error(`Backup ID ${backupId} not found`);
    }
    backup.status = BackupStatus.FAILED;
    backup.notes = [backup.notes, error].filter(Boolean).join(' ');
    return backup;
  }

  public static getBackupsForServer(serverId: string): BackupRecord[] {
    return db.backups.filter((b) => b.serverId === serverId);
  }

  public static restoreBackup(backupId: string): RestoreBackupResult {
    const backup = db.backups.find((b) => b.id === backupId);
    if (!backup) {
      return { success: false, message: `Backup ID ${backupId} not found` };
    }
    if (backup.status !== BackupStatus.COMPLETED) {
      return {
        success: false,
        stub: true,
        message: `Backup ${backupId} is not completed (status: ${backup.status}). Restore unavailable until archive is finalized.`
      };
    }

    // TODO: Wire agent filesystem restore (download from R2 + extract)
    return {
      success: false,
      stub: true,
      message: `Restore is not yet implemented. TODO: agent filesystem integration for ${backup.filename}.`
    };
  }

  public static applyRetentionPolicy(serverId: string, maxRetentionCount = 5): number {
    const serverBackups = this.getBackupsForServer(serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (serverBackups.length > maxRetentionCount) {
      const toDelete = serverBackups.slice(maxRetentionCount);
      const deleteIds = new Set(toDelete.map((b) => b.id));
      db.backups = db.backups.filter((b) => !deleteIds.has(b.id));
      return toDelete.length;
    }
    return 0;
  }

  /**
   * Stream a directory into a gzip-compressed ustar archive (zero intermediate disk file).
   * Returns the archive bytes and SHA-256 for manifest verification.
   */
  public static async streamDirectoryArchive(sourceDir: string): Promise<{
    buffer: Buffer;
    sha256: string;
    fileSizeBytes: number;
    files: WorldFileEntry[];
  }> {
    const files = await listFilesRecursive(sourceDir);
    const gzip = createGzip();
    const pass = new PassThrough();
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];

    pass.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      hash.update(chunk);
    });

    const tarSource = Readable.from(buildTarStream(sourceDir, files));
    await pipeline(tarSource, gzip, pass);

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      sha256: hash.digest('hex'),
      fileSizeBytes: buffer.length,
      files
    };
  }
}

async function listFilesRecursive(root: string): Promise<WorldFileEntry[]> {
  const out: WorldFileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs);
        const rel = relative(root, abs).split(sep).join('/');
        out.push({ path: rel, size: stat.size });
      }
    }
  }

  await walk(root);
  return out;
}

/** Minimal ustar tar stream generator (file entries only). */
async function* buildTarStream(
  root: string,
  files: WorldFileEntry[]
): AsyncGenerator<Buffer> {
  for (const file of files) {
    const abs = join(root, file.path);
    const header = Buffer.alloc(512);
    const name = file.path.slice(0, 100);
    header.write(name);
    header.write('0000644\0', 100, 8, 'utf8'); // mode
    header.write('0000000\0', 108, 8, 'utf8'); // uid
    header.write('0000000\0', 116, 8, 'utf8'); // gid
    header.write(`${file.size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
    header.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'utf8');
    header.write('        ', 148, 8, 'utf8'); // checksum placeholder
    header.write('0', 156, 1, 'utf8'); // typeflag file
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');

    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');

    yield header;

    const stream = createReadStream(abs);
    for await (const chunk of stream) {
      yield chunk as Buffer;
    }

    const padding = (512 - (file.size % 512)) % 512;
    if (padding > 0) {
      yield Buffer.alloc(padding);
    }
  }

  // Two zero blocks end the archive
  yield Buffer.alloc(1024);
}
