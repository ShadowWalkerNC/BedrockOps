import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  JWT_SECRET: z.string().default('dev_jwt_secret_change_in_production'),
  NODE_PAIRING_SECRET: z.string().default('dev_node_pairing_secret_change_in_production'),
  CORS_ORIGIN: z.string().default('*')
});

export const config = envSchema.parse(process.env);
