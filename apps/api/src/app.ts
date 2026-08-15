import express, { type Application } from 'express';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth.routes';
import { serverRouter } from './routes/server.routes';
import { nodeRouter } from './routes/node.routes';
import { backupRouter } from './routes/backup.routes';
import { moderationRouter } from './routes/moderation.routes';
import { provisioningRouter } from './routes/provisioning.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { versionsRouter } from './routes/versions.routes';
import { auditRouter } from './routes/audit.routes';
import { templatesRouter } from './routes/templates.routes';
import { systemRouter } from './routes/system.routes';
import { diagnosticsRouter } from './routes/diagnostics.routes';
import { prismaWriteThroughMiddleware } from './middleware/persist.middleware';

export const app: Application = express();

app.use(cors({ origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(prismaWriteThroughMiddleware);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount v1 API routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/servers', serverRouter);
app.use('/api/v1/nodes', nodeRouter);
app.use('/api/v1/backups', backupRouter);
app.use('/api/v1/moderation', moderationRouter);
app.use('/api/v1/provisioning', provisioningRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/versions', versionsRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/templates', templatesRouter);
app.use('/api/v1/system', systemRouter);
app.use('/api/v1/diagnostics', diagnosticsRouter);
