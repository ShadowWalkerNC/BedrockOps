import { describe, it, expect } from 'vitest';
import {
  createMinimalLevelDat,
  parseLevelDat,
  patchLevelDatExperiments,
  serializeLevelDat
} from './nbt';

describe('level.dat NBT experiments (Wave D)', () => {
  it('creates a minimal level.dat with experiment flags', () => {
    const buf = createMinimalLevelDat(['data_driven_items', 'gametest']);
    const doc = parseLevelDat(buf);
    expect(doc.storageVersion).toBe(10);
    const experiments = doc.root.value.experiments;
    expect(experiments?.type).toBe('compound');
    if (experiments?.type === 'compound') {
      expect(experiments.value.data_driven_items).toMatchObject({ type: 'byte', value: 1 });
      expect(experiments.value.gametest).toMatchObject({ type: 'byte', value: 1 });
      expect(experiments.value.experiments_ever_used).toMatchObject({ type: 'byte', value: 1 });
    }
  });

  it('round-trips serialize → parse', () => {
    const buf = createMinimalLevelDat(['villager_trades_rebalance']);
    const again = serializeLevelDat(parseLevelDat(buf));
    expect(parseLevelDat(again).root.value.experiments?.type).toBe('compound');
  });

  it('patches an existing level.dat buffer', () => {
    const base = createMinimalLevelDat([]);
    const patched = patchLevelDatExperiments(base, ['data_driven_items']);
    expect(patched.applied).toEqual(['data_driven_items']);
    const doc = parseLevelDat(patched.buffer);
    const experiments = doc.root.value.experiments;
    expect(experiments?.type).toBe('compound');
    if (experiments?.type === 'compound') {
      expect(experiments.value.data_driven_items).toMatchObject({ type: 'byte', value: 1 });
    }
  });
});
