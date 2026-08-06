import { describe, it, expect } from 'vitest';
import { LocalBedrockAgent } from './index';

describe('LocalBedrockAgent App', () => {
  it('checks daemon health status', async () => {
    const health = await LocalBedrockAgent.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.nodeVersion).toBeDefined();
  });

  it('returns stub result for local daemon command', async () => {
    const res = await LocalBedrockAgent.executeLocalCommand('status');
    expect(res.success).toBe(false);
    expect(res.stub).toBe(true);
    expect(res.output).toContain('[AGENT STUB]');
  });
});
