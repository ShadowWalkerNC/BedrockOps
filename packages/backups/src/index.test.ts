import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { db, BackupStatus } from '@mc-admin/db';
import {
  BackupEngine,
  ManifestVerifier,
  R2PresignClient,
  SaveHoldDriver
} from './index';

describe('BackupEngine Package', () => {
  beforeEach(() => {
    db.backups = [];
  });

  it('triggers a manual backup record as PENDING', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: true,
      notes: 'Pre-update safety snapshot'
    });

    expect(backup.id).toBeDefined();
    expect(backup.status).toBe(BackupStatus.PENDING);
    expect(backup.isManual).toBe(true);
    expect(backup.notes).toContain('Pre-update safety snapshot');
    expect(backup.filename).toMatch(/\.tar\.gz$/);
    expect(backup.fileSizeBytes).toBe(0);
    expect(db.backups.length).toBe(1);
  });

  it('completes a backup after agent/worker finalization', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: false
    });

    BackupEngine.completeBackup(backup.id, 5_000_000);
    expect(backup.status).toBe(BackupStatus.COMPLETED);
    expect(backup.fileSizeBytes).toBe(5_000_000);
  });

  it('completes a backup with SHA256 + verified manifest', () => {
    const backup = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
    const sha256 = ManifestVerifier.sha256Hex('archive-bytes');
    const manifest = ManifestVerifier.buildManifest({
      backupId: backup.id,
      serverId: 'srv_1',
      files: [{ path: 'level.dat', size: 100 }],
      archiveSha256: sha256,
      fileSizeBytes: 42
    });

    BackupEngine.completeBackup(backup.id, {
      fileSizeBytes: 42,
      sha256,
      manifest,
      storageUrl: 'r2://backups/srv_1/x.tar.gz'
    });

    expect(backup.status).toBe(BackupStatus.COMPLETED);
    expect(backup.verified).toBe(true);
    expect(backup.sha256).toBe(sha256);
    expect(backup.storageUrl).toContain('r2://');
  });

  it('fails backup when manifest SHA does not match', () => {
    const backup = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: true });
    const manifest = ManifestVerifier.buildManifest({
      backupId: backup.id,
      serverId: 'srv_1',
      files: [],
      archiveSha256: ManifestVerifier.sha256Hex('a'),
      fileSizeBytes: 10
    });

    expect(() =>
      BackupEngine.completeBackup(backup.id, {
        fileSizeBytes: 10,
        sha256: ManifestVerifier.sha256Hex('b'),
        manifest
      })
    ).toThrow(/Manifest verification failed/);
    expect(backup.status).toBe(BackupStatus.FAILED);
  });

  it('restore returns stub until filesystem integration is wired', () => {
    const backup = BackupEngine.triggerBackup({
      serverId: 'srv_1',
      isManual: false
    });
    BackupEngine.completeBackup(backup.id, 1024);

    const result = BackupEngine.restoreBackup(backup.id);
    expect(result.success).toBe(false);
    expect(result.stub).toBe(true);
    expect(result.message).toContain('not yet implemented');
  });

  it('enforces retention policy by removing old backups exceeding max count', () => {
    for (let i = 0; i < 7; i++) {
      const b = BackupEngine.triggerBackup({ serverId: 'srv_1', isManual: false });
      BackupEngine.completeBackup(b.id, 1024);
    }

    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(7);
    const removedCount = BackupEngine.applyRetentionPolicy('srv_1', 5);
    expect(removedCount).toBe(2);
    expect(BackupEngine.getBackupsForServer('srv_1').length).toBe(5);
  });

  it('prepareStreamingBackup marks RUNNING and returns save-hold command plan', async () => {
    const job = await BackupEngine.prepareStreamingBackup({
      serverId: 'srv_stream',
      isManual: true
    });

    expect(job.record.status).toBe(BackupStatus.RUNNING);
    expect(job.presignStub).toBe(true);
    expect(job.presignError).toContain('R2 credentials not configured');
    expect(job.saveHoldCommands).toEqual(['save hold', 'save query', 'save resume']);
    expect(job.objectKey).toContain(job.record.id);
  });
});

describe('SaveHoldDriver', () => {
  it('parses save query file listings', () => {
    const parsed = SaveHoldDriver.parseSaveQueryOutput(
      'bedrock_level/db/000005.ldb:1048576, bedrock_level/level.dat:2048'
    );
    expect(parsed).toEqual([
      { path: 'bedrock_level/db/000005.ldb', size: 1048576 },
      { path: 'bedrock_level/level.dat', size: 2048 }
    ]);
  });

  it('runs hold → query → snapshot → resume and always resumes on failure', async () => {
    const calls: string[] = [];
    const snapFiles: { path: string; size: number }[] = [];
    const result = await SaveHoldDriver.runCheckpoint(
      async (cmd) => {
        calls.push(cmd);
        if (cmd === 'save query') {
          return 'world/level.dat:128';
        }
        return 'ok';
      },
      async (files) => {
        snapFiles.push(...files);
        expect(calls).toEqual(['save hold', 'save query']);
      }
    );

    expect(result.success).toBe(true);
    expect(result.files).toEqual([{ path: 'world/level.dat', size: 128 }]);
    expect(snapFiles).toEqual([{ path: 'world/level.dat', size: 128 }]);
    expect(calls).toEqual(['save hold', 'save query', 'save resume']);
    expect(result.phases).toContain('DONE');
  });

  it('resumes world after query parse failure', async () => {
    const calls: string[] = [];
    const result = await SaveHoldDriver.runCheckpoint(async (cmd) => {
      calls.push(cmd);
      if (cmd === 'save query') return 'not a listing';
      return 'ok';
    });

    expect(result.success).toBe(false);
    expect(calls).toContain('save resume');
    expect(result.phases).toContain('FAILED');
  });
});

describe('R2PresignClient & ManifestVerifier', () => {
  it('returns honest stub when R2 env is missing', async () => {
    const client = R2PresignClient.fromEnv({});
    expect(client.isConfigured()).toBe(false);
    const result = await client.createPresignedPutUrl('backups/a/b.tar.gz');
    expect(result.stub).toBe(true);
    expect(result.url).toBe('');
    expect(result.error).toContain('[STUB]');
  });

  it('signs a PUT URL when R2 credentials are present', async () => {
    const client = new R2PresignClient({
      accountId: 'acct123',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret_test_key',
      bucket: 'bedrock-backups'
    });
    const result = await client.createPresignedPutUrl('backups/srv/1.tar.gz', 600);
    expect(result.stub).toBe(false);
    expect(result.url).toContain('acct123.r2.cloudflarestorage.com');
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.url).toContain('backups/srv/1.tar.gz');
  });

  it('validates SHA256 digest format', () => {
    const hash = ManifestVerifier.sha256Hex('');
    expect(ManifestVerifier.isValidSha256(hash)).toBe(true);
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(ManifestVerifier.isValidSha256('nope')).toBe(false);
  });
});

describe('Streaming archive', () => {
  it('builds a gzip tar archive with sha256 from a directory', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'bedrock-backup-'));
    await fs.mkdir(join(dir, 'worlds', 'bedrock_level'), { recursive: true });
    await fs.writeFile(join(dir, 'worlds', 'bedrock_level', 'level.dat'), 'hello-world');

    const archive = await BackupEngine.streamDirectoryArchive(join(dir, 'worlds'));
    expect(archive.fileSizeBytes).toBeGreaterThan(0);
    expect(ManifestVerifier.isValidSha256(archive.sha256)).toBe(true);
    expect(archive.files.some((f) => f.path.endsWith('level.dat'))).toBe(true);

    await fs.rm(dir, { recursive: true, force: true });
  });
});
