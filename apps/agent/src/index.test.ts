import { describe, it, expect } from 'vitest';
import { LocalBedrockAgent } from './index';

describe('LocalBedrockAgent App', () => {
  it('checks daemon health status', async () => {
    const health = await LocalBedrockAgent.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.nodeVersion).toBeDefined();
  });

  it('executes local daemon command', async () => {
    const res = await LocalBedrockAgent.executeLocalCommand('status');
    expect(res.success).toBe(true);
    expect(res.output).toContain("Command 'status' executed.");
  });
});
