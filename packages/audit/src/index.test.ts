import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@mc-admin/db';
import { AuditLogger } from './index';

describe('AuditLogger Domain Package', () => {
  beforeEach(() => {
    db.auditLogs = [];
  });

  it('records an audit entry into the database log repository', () => {
    const entry = AuditLogger.record({
      actorId: 'usr_123',
      actorName: 'Steve',
      action: 'SERVER_START',
      entityType: 'BedrockServer',
      entityId: 'srv_bedrock_1',
      metadata: { reason: 'Scheduled reboot' }
    });

    expect(entry.id).toBeDefined();
    expect(entry.action).toBe('SERVER_START');
    expect(db.auditLogs.length).toBe(1);
    expect(db.auditLogs[0].actorName).toBe('Steve');
  });

  it('filters audit logs by entity ID', () => {
    AuditLogger.record({
      actorId: 'usr_1',
      actorName: 'Alex',
      action: 'BACKUP_TRIGGER',
      entityType: 'BedrockServer',
      entityId: 'srv_1'
    });

    AuditLogger.record({
      actorId: 'usr_2',
      actorName: 'Bob',
      action: 'PLAYER_MUTE',
      entityType: 'Player',
      entityId: 'player_99'
    });

    const serverLogs = AuditLogger.getLogsForEntity('srv_1');
    expect(serverLogs.length).toBe(1);
    expect(serverLogs[0].action).toBe('BACKUP_TRIGGER');
  });
});
