import { describe, it, expect } from 'vitest';
import { BedrockDiagnostics } from './diagnostics';

describe('BedrockDiagnostics Engine', () => {
  it('detects known log errors for protocol mismatch and database lock', () => {
    const logs = [
      '[2026-08-14 20:00:00:000 INFO] Starting server...',
      '[2026-08-14 20:00:02:100 ERROR] CHAIN_INVALID: client version does not match',
      '[2026-08-14 20:00:05:200 ERROR] Resource temporarily unavailable: leveldb/db lock'
    ];

    const issues = BedrockDiagnostics.analyzeLogEntries(logs);
    expect(issues).toHaveLength(2);
    expect(issues[0].code).toBe('PROTOCOL_VERSION_MISMATCH');
    expect(issues[1].code).toBe('DATABASE_LOCKED');
  });

  it('accurately assesses healthy server state', () => {
    const fakePing = {
      latencyMs: 12,
      edition: 'MCPE',
      motd: 'My Survival Realm',
      protocolVersion: 786,
      versionName: '1.21.73',
      playerCount: 1,
      maxPlayers: 10,
      serverGuid: '12345',
      worldName: 'BedrockLevel',
      gameMode: 'survival',
      portIpv4: 19132
    };

    const assessment = BedrockDiagnostics.assessHealth(fakePing, true, false, true);
    expect(assessment.overallStatus).toBe('HEALTHY');
    expect(assessment.issues).toHaveLength(0);
  });

  it('marks overall status as CRITICAL when server process is offline', () => {
    const assessment = BedrockDiagnostics.assessHealth(null, false, false, false);
    expect(assessment.overallStatus).toBe('OFFLINE');
    expect(assessment.issues.some(i => i.code === 'SERVER_OFFLINE')).toBe(true);
  });

  it('identifies loopback isolation warning when loopbackExempt is false', () => {
    const fakePing = {
      latencyMs: 15,
      edition: 'MCPE',
      motd: 'Test Realm',
      protocolVersion: 786,
      versionName: '1.21.73',
      playerCount: 0,
      maxPlayers: 10,
      serverGuid: '12345',
      worldName: 'BedrockLevel',
      gameMode: 'survival',
      portIpv4: 19132
    };

    const assessment = BedrockDiagnostics.assessHealth(fakePing, true, false, false);
    expect(assessment.overallStatus).toBe('DEGRADED');
    expect(assessment.issues.some(i => i.code === 'WINDOWS_LOOPBACK_ISOLATION')).toBe(true);
  });
});
