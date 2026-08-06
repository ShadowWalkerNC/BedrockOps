import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    alias: {
      '@mc-admin/db': path.resolve(__dirname, '../db/src/index.ts'),
      '@mc-admin/audit': path.resolve(__dirname, '../audit/src/index.ts'),
      '@mc-admin/auth': path.resolve(__dirname, '../auth/src/index.ts'),
      '@mc-admin/backups': path.resolve(__dirname, '../backups/src/index.ts'),
      '@mc-admin/bedrock': path.resolve(__dirname, '../bedrock/src/index.ts'),
      '@mc-admin/config': path.resolve(__dirname, '../config/src/index.ts'),
      '@mc-admin/moderation': path.resolve(__dirname, '../moderation/src/index.ts'),
      '@mc-admin/notifications': path.resolve(__dirname, '../notifications/src/index.ts'),
      '@mc-admin/pipelines': path.resolve(__dirname, '../pipelines/src/index.ts'),
      '@mc-admin/templates': path.resolve(__dirname, '../templates/src/index.ts'),
      '@mc-admin/ui': path.resolve(__dirname, '../ui/src/index.ts'),
      '@mc-admin/agent': path.resolve(__dirname, '../../apps/agent/src/index.ts'),
      '@mc-admin/api': path.resolve(__dirname, '../../apps/api/src/index.ts'),
      '@mc-admin/discord': path.resolve(__dirname, '../../apps/discord/src/index.ts'),
      '@mc-admin/worker': path.resolve(__dirname, '../../apps/worker/src/index.ts'),
    }
  }
});
