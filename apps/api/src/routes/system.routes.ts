import { Router, Response } from 'express';
import { getDatabaseAdapterMode } from '@mc-admin/db';
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
