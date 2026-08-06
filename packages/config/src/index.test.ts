import { describe, it, expect } from 'vitest';
import { validateEnv, envSchema } from './index';

describe('Config Package', () => {
  it('validates default environment variables', () => {
    const validated = validateEnv({ NODE_ENV: 'test' });
    expect(validated.NODE_ENV).toBe('test');
    expect(validated.PORT).toBe(3000);
    expect(validated.RCON_PORT).toBe(19133);
  });

  it('fails validation for invalid numeric port', () => {
    expect(() => validateEnv({ PORT: '-100' })).toThrow();
  });
});
