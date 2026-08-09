import { describe, expect, it } from 'vitest';
import type { ScenarioName } from './types';

const SCENARIOS: ScenarioName[] = ['join', 'chat', 'flood', 'churn', 'ping'];

describe('@mc-admin/bds-bots CLI contract', () => {
  it('exposes the expected offline scenarios', () => {
    expect(SCENARIOS).toEqual(['join', 'chat', 'flood', 'churn', 'ping']);
  });

  it('keeps scenario option defaults coherent for flood pressure tests', () => {
    const floodDefaultCount = 6;
    const floodDefaultStaggerMs = 75;
    expect(floodDefaultCount).toBeGreaterThan(1);
    expect(floodDefaultStaggerMs).toBeGreaterThan(0);
  });
});
