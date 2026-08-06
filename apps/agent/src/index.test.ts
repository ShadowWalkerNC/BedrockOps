import { describe, it, expect } from 'vitest';
import { LocalBedrockAgent } from './index';

describe('LocalBedrockAgent App', () => {
  it('checks daemon health status and points at Go binary', async () => {
    const health = await LocalBedrockAgent.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.nodeVersion).toBeDefined();
    expect(health.goBinary).toBe('cmd/bedrock-agent');
    expect(health.runtime).toBe('typescript-shim');
  });

  it('returns stub result for local daemon command in TS shim', async () => {
    const res = await LocalBedrockAgent.executeLocalCommand('status');
    expect(res.success).toBe(false);
    expect(res.stub).toBe(true);
    expect(res.output).toContain('[AGENT STUB]');
    expect(res.output).toContain('bedrock-agent');
  });
});
