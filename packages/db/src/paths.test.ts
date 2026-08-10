import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCKER_AGENT_ID, defaultServerPath } from './paths';

describe('defaultServerPath', () => {
  it('uses explicit path when provided', () => {
    expect(defaultServerPath('srv_1', ' /data/world ')).toBe('/data/world');
  });

  it('falls back to /tmp/bedrockops-worlds/<id>', () => {
    const prev = process.env.BDS_HOME;
    delete process.env.BDS_HOME;
    expect(defaultServerPath('srv_abc')).toBe('/tmp/bedrockops-worlds/srv_abc');
    if (prev !== undefined) process.env.BDS_HOME = prev;
  });

  it('prefers BDS_HOME when set', () => {
    const prev = process.env.BDS_HOME;
    process.env.BDS_HOME = '/opt/bds';
    expect(defaultServerPath('srv_abc')).toBe('/opt/bds');
    if (prev === undefined) delete process.env.BDS_HOME;
    else process.env.BDS_HOME = prev;
  });

  it('exports the seeded docker agent id', () => {
    expect(DEFAULT_DOCKER_AGENT_ID).toBe('node_docker_agent_1');
  });
});
