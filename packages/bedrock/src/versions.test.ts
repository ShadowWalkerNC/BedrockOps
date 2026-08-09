import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@mc-admin/db';
import { BdsVersionMatrix } from './versions';

function makeServer(version: string) {
  return {
    id: 'srv_test',
    name: 'Test',
    version,
    host: '127.0.0.1',
    port: 19132,
    serverPath: '/tmp/x',
    status: 'ONLINE' as const,
    maxPlayers: 10,
    gameMode: 'survival',
    difficulty: 'hard',
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('BdsVersionMatrix', () => {
  beforeEach(() => {
    db.bdsVersions = [];
    db.bdsVersions.push(
      { id: 'v1', version: '1.20.80', downloadUrl: 'https://x/1.20.80.zip', releaseDate: new Date('2024-04-15'), isLatest: false, isSupported: true },
      { id: 'v2', version: '1.21.0', downloadUrl: 'https://x/1.21.0.zip', releaseDate: new Date('2024-06-01'), isLatest: true, isSupported: true },
      { id: 'v0', version: '1.19.0', downloadUrl: 'https://x/1.19.0.zip', releaseDate: new Date('2023-01-01'), isLatest: false, isSupported: false }
    );
  });

  it('reports the latest version', () => {
    expect(BdsVersionMatrix.latest(db)?.version).toBe('1.21.0');
  });

  it('flags a mismatch when a server is behind latest', () => {
    const check = BdsVersionMatrix.checkServer(makeServer('1.20.80'), db);
    expect(check.isLatest).toBe(false);
    expect(check.mismatch).toBe(true);
    expect(check.isSupported).toBe(true);
    expect(check.warning).toContain('behind the latest');
  });

  it('reports no mismatch when a server is on latest', () => {
    const check = BdsVersionMatrix.checkServer(makeServer('1.21.0'), db);
    expect(check.isLatest).toBe(true);
    expect(check.mismatch).toBe(false);
    expect(check.warning).toBeUndefined();
  });

  it('warns when the pinned version is unsupported', () => {
    const check = BdsVersionMatrix.checkServer(makeServer('1.19.0'), db);
    expect(check.isSupported).toBe(false);
    expect(check.warning).toContain('no longer supported');
  });

  it('warns when the pinned version is not in the catalog', () => {
    const check = BdsVersionMatrix.checkServer(makeServer('9.9.9'), db);
    expect(check.warning).toContain('not in the version catalog');
  });

  it('pins a server to a new version and reports backup requirement', () => {
    const server = makeServer('1.20.80');
    const result = BdsVersionMatrix.pin(server, '1.21.0', { backupBefore: true }, db);
    expect(result.previousVersion).toBe('1.20.80');
    expect(result.version).toBe('1.21.0');
    expect(result.supported).toBe(true);
    expect(result.requiresBackup).toBe(true);
    expect(server.version).toBe('1.21.0');
  });
});
