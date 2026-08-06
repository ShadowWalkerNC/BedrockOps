import http from 'http';
import { app } from './app';
import { config } from './config';
import { setupWebSocketRouter } from './ws/router';
import { db, ServerStatus, BackupRecord } from '@mc-admin/db';
import { BackupEngine } from '@mc-admin/backups';
import { PipelineEngine } from '@mc-admin/pipelines';

export { app };

export class ApiServer {
  public static async getServers() {
    return db.servers.filter(s => !s.deletedAt);
  }

  public static async createServer(data: Partial<any>) {
    const server = {
      id: `srv_${Date.now()}`,
      name: data.name || 'New Bedrock Server',
      type: data.type || 'VANILLA',
      hostProvider: data.hostProvider || 'DOCKER_AGENT',
      version: data.version || '1.20.80',
      host: data.host || '127.0.0.1',
      port: data.port || 19132,
      rconPort: data.rconPort || 19133,
      rconPassword: data.rconPassword || 'secret_rcon_pass',
      serverPath: data.serverPath || `/var/minecraft/${(data.name || 'new-server').toLowerCase().replace(/\s+/g, '-')}`,
      status: ServerStatus.OFFLINE,
      maxPlayers: data.maxPlayers || 10,
      gameMode: data.gameMode || 'survival',
      difficulty: data.difficulty || 'easy',
      ownerId: data.ownerId || 'usr_admin_1',
      agentId: data.agentId || 'node_docker_agent_1',
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
    return BackupEngine.triggerBackup(server, true);
  }

  public static async executeSetupPipeline(pipelineId: string, serverId?: string) {
    return PipelineEngine.executePipeline(pipelineId, serverId);
  }
}

// Only start HTTP listener if file is executed directly
if (require.main === module) {
  const server = http.createServer(app);
  setupWebSocketRouter(server);

  server.listen(config.PORT, () => {
    console.log(`[apps/api] Control plane API server running on port ${config.PORT}`);
  });
}
