import { z } from 'zod';

const WEAK_JWT_DEFAULTS = new Set([
  'dev_jwt_secret_change_in_production',
  'changeme',
  'secret',
  'jwt_secret'
]);

const WEAK_PAIRING_DEFAULTS = new Set([
  'dev_node_pairing_secret_change_in_production',
  'changeme',
  'secret'
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  JWT_SECRET: z.string().min(16).default('dev_jwt_secret_change_in_production'),
  NODE_PAIRING_SECRET: z.string().min(16).default('dev_node_pairing_secret_change_in_production'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ALLOW_DEV_LOGIN: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ALLOWED_UPLOAD_HOSTS: z.string().optional()
});

function parseConfig() {
  const parsed = envSchema.parse(process.env);

  if (parsed.NODE_ENV === 'production') {
    if (WEAK_JWT_DEFAULTS.has(parsed.JWT_SECRET) || parsed.JWT_SECRET.length < 32) {
      throw new Error(
        'JWT_SECRET must be a strong unique secret (min 32 chars) in production'
      );
    }
    if (
      WEAK_PAIRING_DEFAULTS.has(parsed.NODE_PAIRING_SECRET) ||
      parsed.NODE_PAIRING_SECRET.length < 32
    ) {
      throw new Error(
        'NODE_PAIRING_SECRET must be a strong unique secret (min 32 chars) in production'
      );
    }
    if (parsed.CORS_ORIGIN === '*') {
      throw new Error('CORS_ORIGIN=* is not allowed in production');
    }
  }

  return parsed;
}

export const config = parseConfig();
