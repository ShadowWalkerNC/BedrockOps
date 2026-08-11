import { describe, it, expect } from 'vitest';
import { MarketplaceSynthesisEngine } from './index';

describe('@mc-admin/marketplace Pack Synthesis Engine', () => {
  const sampleManifest = JSON.stringify({
    format_version: 2,
    header: {
      name: 'Custom Behavior Pack',
      description: 'Adds custom mobs and items',
      uuid: '11111111-2222-3333-4444-555555555555',
      version: [1, 2, 0]
    },
    modules: [{ type: 'data', uuid: '66666666-7777-8888-9999-000000000000', version: [1, 2, 0] }]
  });

  it('parses valid Bedrock behavior pack manifest', () => {
    const pack = MarketplaceSynthesisEngine.parseManifest(sampleManifest, 'my_addon.mcpack');
    expect(pack.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(pack.name).toBe('Custom Behavior Pack');
    expect(pack.packType).toBe('BEHAVIOR');
  });

  it('synthesizes behavior_packs.json and resource_packs.json files', () => {
    const pack1 = MarketplaceSynthesisEngine.parseManifest(sampleManifest, 'addon.mcpack');
    const { behaviorPacksJson, resourcePacksJson } = MarketplaceSynthesisEngine.buildWorldPacksJson([pack1]);

    expect(behaviorPacksJson).toContain('11111111-2222-3333-4444-555555555555');
    expect(resourcePacksJson).toBe('[]');
  });
});
