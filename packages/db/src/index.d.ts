import { User, BedrockServer, BackupRecord, ModerationAction, ServerTemplate, Pipeline, PipelineRun, AuditLog } from './schema';
export * from './schema';
export declare class MemoryDatabase {
    users: User[];
    servers: BedrockServer[];
    backups: BackupRecord[];
    moderationActions: ModerationAction[];
    templates: ServerTemplate[];
    pipelines: Pipeline[];
    pipelineRuns: PipelineRun[];
    auditLogs: AuditLog[];
    seedDefaults(): void;
}
export declare const db: MemoryDatabase;
//# sourceMappingURL=index.d.ts.map