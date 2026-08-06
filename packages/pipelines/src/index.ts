import { db, BedrockServer, ServerStatus, PipelineRun, PipelineStatus } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { BackupEngine } from '@mc-admin/backups';
import { TemplateEngine } from '@mc-admin/templates';
import {
  DnsProvider,
  NetworkAllocation,
  PortPool,
  SubdomainAllocator,
  defaultPortPool
} from './allocation';
import { ConsoleOnboardingService, ConsoleOnboardingResult } from './onboarding';

export * from './allocation';
export * from './onboarding';

export interface CreatePipelineInput {
  name: string;
  description: string;
}

export class PipelineEngine {
  private static allocator = new SubdomainAllocator(defaultPortPool, DnsProvider.fromEnv());

  public static async runServerSetupPipeline(params: {
    serverName: string;
    templateId: string;
    webhookUrl?: string;
    actorName: string;
    /** When true, allocate play subdomain + UDP port from the pool. */
    allocateNetwork?: boolean;
    nodeIp?: string;
    subdomain?: string;
    preferredPort?: number;
  }): Promise<{
    server: BedrockServer;
    run: PipelineRun;
    network?: NetworkAllocation;
  }> {
    const logs: string[] = [];
    logs.push(`[${new Date().toISOString()}] Initializing pipeline run for ${params.serverName}`);

    // Step 1: Create Server Record
    const serverId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let host = '127.0.0.1';
    let port = 19132;
    let network: NetworkAllocation | undefined;

    if (params.allocateNetwork) {
      network = this.allocator.allocate({
        serverId,
        nodeIp: params.nodeIp || '127.0.0.1',
        subdomain: params.subdomain,
        preferredPort: params.preferredPort
      });
      host = network.fqdn;
      port = network.port;
      logs.push(
        `[Step 1/5] Allocated network ${network.fqdn}:${network.port}` +
          (network.dns.stub ? ' (DNS stub — Cloudflare token unset)' : '')
      );
    }

    const server: BedrockServer = {
      id: serverId,
      name: params.serverName,
      version: '1.20.80',
      host,
      port,
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
    logs.push(`[Step ${params.allocateNetwork ? '2' : '1'}/4] Server record created: ${server.id}`);

    // Step 2: Apply Template
    try {
      TemplateEngine.applyTemplateToServer(params.templateId, server);
      logs.push(`[Step 2/4] Applied template ${params.templateId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push(`[Step 2/4 Warning] Template apply skipped or failed: ${message}`);
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
      metadata: {
        templateId: params.templateId,
        backupId: backup.id,
        network: network
          ? { fqdn: network.fqdn, port: network.port, subdomain: network.subdomain }
          : undefined
      }
    });
    logs.push(`[Step 4/4] Recorded audit log event`);

    if (params.webhookUrl) {
      const payload = NotificationDispatcher.formatServerStatusEmbed(
        server.name,
        server.status,
        server.host,
        server.port
      );
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

    return { server, run: runRecord, network };
  }

  /** R5.2 helper used by API/onboarding flows. */
  public static async onboardConsolePlayer(input: {
    gamertag: string;
    serverId: string;
    serverPath?: string;
    ignoresPlayerLimit?: boolean;
    autoAcceptInvite?: boolean;
  }): Promise<ConsoleOnboardingResult> {
    const service = new ConsoleOnboardingService();
    return service.onboard(input);
  }

  public static getPortPool(): PortPool {
    return defaultPortPool;
  }

  public static getAllocator(): SubdomainAllocator {
    return this.allocator;
  }
}
