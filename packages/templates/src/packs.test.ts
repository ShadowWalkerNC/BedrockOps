import { describe, it, expect } from 'vitest';
import { PackEngine, PACK_CATALOG } from './packs';

describe('PackEngine (Wave D1)', () => {
  it('lists the first-party sample catalog', () => {
    expect(PACK_CATALOG.length).toBeGreaterThanOrEqual(3);
    expect(PackEngine.listCatalog().some((p) => p.id === 'pack_sample_bp')).toBe(true);
  });

  it('filters marketplace catalog by category and query', () => {
    const gameplay = PackEngine.listCatalog({ category: 'gameplay' });
    expect(gameplay.every((p) => p.category === 'gameplay')).toBe(true);
    const smp = PackEngine.listCatalog({ q: 'smp' });
    expect(smp.some((p) => p.id === 'pack_smp_welcome_bp')).toBe(true);
    expect(PackEngine.listFacets().categories).toContain('utility');
  });

  it('builds a behavior pack apply plan under worlds/<level>/behavior_packs', () => {
    const plan = PackEngine.buildApplyPlan('pack_sample_bp', {
      serverPath: '/tmp/bedrockops-worlds/srv_1'
    });
    expect(plan.kind).toBe('behavior');
    expect(plan.files.some((f) => f.relativePath.includes('behavior_packs/pack_sample_bp/manifest.json'))).toBe(
      true
    );
    expect(plan.files.some((f) => f.relativePath.endsWith('world_behavior_packs.json'))).toBe(true);
    const enable = plan.files.find((f) => f.relativePath.endsWith('world_behavior_packs.json'));
    const parsed = JSON.parse(enable!.contents) as Array<{ pack_id: string }>;
    expect(parsed[0].pack_id).toMatch(/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1/);
  });

  it('merges enable lists without duplicating uuid', () => {
    const existing = JSON.stringify([{ pack_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1', version: [0, 9, 0] }]);
    const merged = PackEngine.mergeEnableList(existing, {
      pack_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
      version: [1, 0, 0]
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].version).toEqual([1, 0, 0]);
  });

  it('checks BDS min engine compatibility', () => {
    expect(PackEngine.isBdsCompatible('1.20.80', [1, 20, 0])).toBe(true);
    expect(PackEngine.isBdsCompatible('1.19.0', [1, 20, 0])).toBe(false);
  });
});
