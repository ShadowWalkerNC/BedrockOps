import http from 'http';
import { app } from './app';
import { config } from './config';
import { setupWebSocketRouter } from './ws/router';
import { agentGateway } from './ws/agentGateway';
import {
  db,
  ServerStatus,
  BackupRecord,
  BedrockServer,
  initializeDatabase,
  defaultServerPath,
  DEFAULT_DOCKER_AGENT_ID
} from '@mc-admin/db';
import { BackupEngine } from '@mc-admin/backups';
import { PipelineEngine } from '@mc-admin/pipelines';
import { HostProviderFactory } from '@mc-admin/bedrock';

export { app };

// Wire Docker agent HostProvider to the live WebSocket tunnel gateway.
HostProviderFactory.bindAgentTunnel(agentGateway);

export class ApiServer {
  public static async getServers() {
    return db.servers.filter(s => !s.deletedAt);
  }

  public static async createServer(data: Partial<BedrockServer>) {
    const serverId = `srv_${Date.now()}`;
    const server = {
      id: serverId,
      name: data.name || 'New Bedrock Server',
      type: data.type || 'VANILLA',
      hostProvider: data.hostProvider || 'DOCKER_AGENT',
      version: data.version || '1.20.80',
      host: data.host || '127.0.0.1',
      port: data.port || 19132,
      rconPort: data.rconPort || 19133,
      rconPassword: data.rconPassword || 'secret_rcon_pass',
      serverPath: defaultServerPath(serverId, data.serverPath),
      status: ServerStatus.OFFLINE,
      maxPlayers: data.maxPlayers || 10,
      gameMode: data.gameMode || 'survival',
      difficulty: data.difficulty || 'easy',
      ownerId: data.ownerId || 'usr_admin_1',
      agentId: data.agentId || DEFAULT_DOCKER_AGENT_ID,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.servers.push(server);
    return server;
  }

  public static async triggerManualBackup(serverId: string): Promise<BackupRecord> {
    const server = db.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    return BackupEngine.triggerBackup({ serverId, isManual: true });
  }

  public static async executeSetupPipeline(_pipelineId: string, _serverId?: string) {
    return PipelineEngine.runServerSetupPipeline({
      serverName: 'Pipeline Server',
      templateId: 'tmpl_vanilla_survival',
      actorName: 'admin'
    });
  }
}

async function start(): Promise<void> {
  const dbInit = await initializeDatabase(db);
  console.log(
    `[apps/api] Database ready (mode=${dbInit.mode}${dbInit.seeded ? ', seeded defaults' : ''})`
  );

  const server = http.createServer(app);
  setupWebSocketRouter(server);

  server.listen(config.PORT, () => {
    console.log(`[apps/api] Control plane API server running on port ${config.PORT}`);
  });
}

// Only start HTTP listener if file is executed directly
if (require.main === module) {
  start().catch((err: unknown) => {
    console.error('[apps/api] Failed to start:', err);
    process.exit(1);
  });
}
