import { describe, it, expect } from 'vitest';
import { validateEnv, envSchema } from './env';

describe('@mc-admin/config env validation', () => {
  it('validates and applies default environment variable values', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe('file:./dev.db');
    expect(env.RCON_HOST).toBe('127.0.0.1');
    expect(env.RCON_PORT).toBe(19133);
    expect(env.DISCORD_WEBHOOK_URL).toBeUndefined();
  });

  it('validates custom valid environment variables', () => {
    const custom = {
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/mydb',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/12345/abcde',
      BEDROCK_SERVER_PATH: '/srv/mc',
      RCON_PORT: '25575'
    };
    const env = validateEnv(custom);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/mydb');
    expect(env.DISCORD_WEBHOOK_URL).toBe('https://discord.com/api/webhooks/12345/abcde');
    expect(env.BEDROCK_SERVER_PATH).toBe('/srv/mc');
    expect(env.RCON_PORT).toBe(25575);
  });

  it('throws an error when invalid NODE_ENV is provided', () => {
    expect(() => validateEnv({ NODE_ENV: 'invalid_env' as any })).toThrow(/Environment variable validation failed/);
  });

  it('throws an error when invalid DISCORD_WEBHOOK_URL is provided', () => {
    expect(() => validateEnv({ DISCORD_WEBHOOK_URL: 'not-a-url' })).toThrow(/Environment variable validation failed/);
  });

  it('rejects partial Pterodactyl partner env', () => {
    expect(() =>
      validateEnv({ PTERODACTYL_API_BASE_URL: 'https://panel.example.com' })
    ).toThrow(/Environment variable validation failed/);
  });

  it('accepts complete Pterodactyl partner env', () => {
    const env = validateEnv({
      PTERODACTYL_API_BASE_URL: 'https://panel.example.com',
      PTERODACTYL_API_KEY: 'ptla_test'
    });
    expect(env.PTERODACTYL_API_BASE_URL).toBe('https://panel.example.com');
    expect(env.PTERODACTYL_API_KEY).toBe('ptla_test');
  });
});
