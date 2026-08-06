import { db, BedrockServer, ServerStatus, PipelineRun, PipelineStatus } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { BackupEngine } from '@mc-admin/backups';
import { TemplateEngine } from '@mc-admin/templates';

export interface CreatePipelineInput {
  name: string;
  description: string;
}

export class PipelineEngine {
  public static async runServerSetupPipeline(params: {
    serverName: string;
    templateId: string;
    webhookUrl?: string;
    actorName: string;
  }): Promise<{ server: BedrockServer; run: PipelineRun }> {
    const logs: string[] = [];
    logs.push(`[${new Date().toISOString()}] Initializing pipeline run for ${params.serverName}`);

    // Step 1: Create Server Record
    const server: BedrockServer = {
      id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: params.serverName,
      version: '1.20.80',
      host: '127.0.0.1',
      port: 19132,
      rconPort: 19133,
      rconPassword: 'secret_rcon_pass',
      serverPath: `/var/minecraft/${params.serverName.toLowerCase().replace(/\s+/g, '-')}`,
      status: ServerStatus.ONLINE,
      maxPlayers: 10,
      gameMode: 'survival',
      difficulty: 'hard',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.servers.push(server);
    logs.push(`[Step 1/4] Server record created: ${server.id}`);

    // Step 2: Apply Template
    try {
      TemplateEngine.applyTemplateToServer(params.templateId, server);
      logs.push(`[Step 2/4] Applied template ${params.templateId}`);
    } catch (err: any) {
      logs.push(`[Step 2/4 Warning] Template apply skipped or failed: ${err.message}`);
    }

    // Step 3: Trigger Initial Backup Safety Snapshot
    const backup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: false,
      notes: 'Initial automated setup pipeline snapshot'
    });
    logs.push(`[Step 3/4] Created initial backup snapshot: ${backup.filename}`);

    // Step 4: Audit & Discord Notification
    AuditLogger.record({
      actorId: 'system',
      actorName: params.actorName,
      action: 'PIPELINE_SERVER_SETUP',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { templateId: params.templateId, backupId: backup.id }
    });
    logs.push(`[Step 4/4] Recorded audit log event`);

    if (params.webhookUrl) {
      const payload = NotificationDispatcher.formatServerStatusEmbed(server.name, server.status, server.host, server.port);
      await NotificationDispatcher.sendWebhook(params.webhookUrl, payload);
      logs.push(`[Step 4/4] Sent Discord alert notification`);
    }

    const runRecord: PipelineRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pipelineId: 'pipe_server_setup',
      serverId: server.id,
      status: PipelineStatus.SUCCESS,
      logs,
      startedAt: new Date(),
      completedAt: new Date()
    };
    db.pipelineRuns.push(runRecord);

    return { server, run: runRecord };
  }
}
