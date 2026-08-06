import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  DISCORD_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  BEDROCK_SERVER_PATH: z.string().default('/var/minecraft/bedrock-server-1'),
  RCON_HOST: z.string().default('127.0.0.1'),
  RCON_PORT: z.coerce.number().int().positive().default(19133),
  RCON_PASSWORD: z.string().default('secret_rcon_pass'),
  // Cloudflare R2 (optional — streaming backups stub when unset)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_JURISDICTION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env or a custom environment object against envSchema.
 * Throws a detailed error if validation fails per AGENTS.md Rule 4.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error(`Environment variable validation failed: ${result.error.message}`);
  }
  return result.data;
}

let cachedEnv: Env | null = null;

/**
 * Retrieves cached validated environment variables or validates process.env if uncached.
 */
export function getEnv(forceRefresh = false): Env {
  if (!cachedEnv || forceRefresh) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}
