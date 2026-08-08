/**
 * Database adapter mode for BedrockOps.
 *
 * - `memory` (default): In-process MemoryDatabase for local dev and unit tests.
 * - `prisma`: PostgreSQL via Prisma Client. MemoryDatabase remains the sync working
 *   set; hydrate on boot and flush write-through (see `persist.ts`).
 *
 * Set DB_ADAPTER=prisma for staging/production. Requires DATABASE_URL.
 * Docker Compose provides local Postgres (`docker compose up -d postgres`).
 */
export type DatabaseAdapterMode = 'memory' | 'prisma';

export function getDatabaseAdapterMode(): DatabaseAdapterMode {
  const mode = process.env.DB_ADAPTER?.toLowerCase();
  if (mode === 'prisma') {
    return 'prisma';
  }
  return 'memory';
}

export function isMemoryDatabaseMode(): boolean {
  return getDatabaseAdapterMode() === 'memory';
}

export function isPrismaDatabaseMode(): boolean {
  return getDatabaseAdapterMode() === 'prisma';
}

/** Production must use Prisma unless explicitly overridden. */
export function assertDatabaseModeAllowed(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv !== 'production') {
    return;
  }
  if (isPrismaDatabaseMode()) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DB_ADAPTER=prisma in production');
    }
    return;
  }
  if (process.env.ALLOW_MEMORY_DB === 'true') {
    return;
  }
  throw new Error(
    'DB_ADAPTER=prisma is required in production. Set ALLOW_MEMORY_DB=true to override (not recommended).'
  );
}
