import { Router, Response } from 'express';
import { getDatabaseAdapterMode, db, ServerStatus, HostProviderType } from '@mc-admin/db';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { AuditLogger } from '@mc-admin/audit';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';
import { config } from '../config';
import { agentGateway } from '../ws/agentGateway';

export const systemRouter: Router = Router();

systemRouter.use(authenticateJwt);

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** GET /api/v1/system/status — non-secret control-plane readiness for Settings. */
systemRouter.get('/status', (_req: AuthenticatedRequest, res: Response) => {
  const connectedAgentIds = agentGateway.listConnectedNodeIds();
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: config.NODE_ENV,
    dbAdapter: getDatabaseAdapterMode(),
    corsOrigin: config.CORS_ORIGIN,
    agents: {
      connectedCount: connectedAgentIds.length,
      connectedNodeIds: connectedAgentIds
    },
    integrations: {
      r2: present(process.env.R2_ACCOUNT_ID) && present(process.env.R2_ACCESS_KEY_ID) && present(process.env.R2_SECRET_ACCESS_KEY) && present(process.env.R2_BUCKET),
      discordWebhook: present(process.env.DISCORD_WEBHOOK_URL),
      discordSlash:
        present(process.env.DISCORD_BOT_TOKEN) &&
        present(process.env.DISCORD_APPLICATION_ID) &&
        present(process.env.DISCORD_GUILD_ID),
      cloudflareDns: present(process.env.CLOUDFLARE_API_TOKEN) && present(process.env.CLOUDFLARE_ZONE_ID),
      xbox: present(process.env.XBOX_API_KEY) || present(process.env.OPENXBL_API_KEY)
    }
  });
});

/** POST /api/v1/system/stop-all — Emergency stop all running servers and background tunnels. */
systemRouter.post('/stop-all', async (req: AuthenticatedRequest, res: Response) => {
  const stopped: string[] = [];
  for (const srv of db.servers) {
    if (!srv.deletedAt) {
      try {
        const provider = HostProviderFactory.getProvider(srv.hostProvider || HostProviderType.DOCKER_AGENT);
        await provider.stopServer(srv, true);
        srv.status = ServerStatus.OFFLINE;
        stopped.push(srv.id);
      } catch (_) {}
    }
  }

  // Also terminate any native OS BDS processes and playit tunnels on Windows
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try { execSync('taskkill /IM bedrock_server.exe /F', { stdio: 'ignore' }); } catch (_) {}
      try { execSync('taskkill /IM playit.exe /F', { stdio: 'ignore' }); } catch (_) {}
    }
  } catch (_) {}

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SYSTEM_EMERGENCY_STOP_ALL',
    entityType: 'System',
    entityId: 'all',
    metadata: { stoppedServers: stopped }
  });

  return res.json({ success: true, message: 'All servers and background processes stopped successfully.', stopped });
});
