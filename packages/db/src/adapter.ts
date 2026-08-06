/**
 * Database adapter mode for BedrockOps.
 *
 * - `memory` (default): In-process MemoryDatabase for local dev and unit tests.
 * - `prisma`: PostgreSQL via Prisma Client (schema in prisma/schema.prisma).
 *
 * Set DB_ADAPTER=prisma when wiring production persistence.
 * Docker Compose Postgres is configured but not used until Prisma adapter is selected.
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
