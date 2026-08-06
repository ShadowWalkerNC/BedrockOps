import express from 'express';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth.routes';
import { serverRouter } from './routes/server.routes';
import { nodeRouter } from './routes/node.routes';
import { backupRouter } from './routes/backup.routes';
import { moderationRouter } from './routes/moderation.routes';
import { auditRouter } from './routes/audit.routes';

export const app = express();

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

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
app.use('/api/v1/audit', auditRouter);
