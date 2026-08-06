import { db, AuditLog } from '@mc-admin/db';

export interface CreateAuditEntryInput {
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  public static record(input: CreateAuditEntryInput): AuditLog {
    const entry: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      timestamp: new Date()
    };

    db.auditLogs.push(entry);
    return entry;
  }

  public static getLogsForEntity(entityId: string): AuditLog[] {
    return db.auditLogs.filter((log) => log.entityId === entityId);
  }

  public static getAllLogs(): AuditLog[] {
    return [...db.auditLogs];
  }
}
