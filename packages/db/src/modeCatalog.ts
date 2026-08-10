import type { ServerTemplate } from './schema';

/** First-party Realm mode presets (Wave D2: packs + BDS pin; experiments listed for awareness). */
export const MODE_CATALOG_TEMPLATES: Omit<ServerTemplate, 'createdAt'>[] = [
  {
    id: 'tmpl_vanilla_survival',
    name: 'Vanilla Hard Survival',
    description: 'Classic hard survival — no cheats. No add-on packs.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'hard',
      'allow-cheats': 'false',
      'max-players': '10',
      pvp: 'true',
      'keep-inventory': 'false'
    },
    addonPacks: []
  },
  {
    id: 'tmpl_creative_sandbox',
    name: 'Creative Sandbox',
    description: 'Build freely — creative mode with cheats. Includes sample resource pack.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'creative',
      difficulty: 'peaceful',
      'allow-cheats': 'true',
      'max-players': '20',
      pvp: 'false',
      'keep-inventory': 'true'
    },
    addonPacks: ['pack_sample_rp']
  },
  {
    id: 'tmpl_flat_skyblock',
    name: 'Skyblock-ready Flat',
    description:
      'Flat world + sample behavior pack scaffold. Full island Script packs are still a follow-on.',
    bdsVersion: '1.21.0',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'normal',
      'allow-cheats': 'false',
      'max-players': '10',
      'level-type': 'FLAT',
      pvp: 'true',
      'keep-inventory': 'false'
    },
    addonPacks: ['pack_sample_bp']
  },
  {
    id: 'tmpl_classic_smp',
    name: 'Classic SMP',
    description:
      'Community survival multiplayer defaults with sample BP+RP starter kit. First-party preset — not a third-party SMP clone.',
    bdsVersion: '1.21.0',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'normal',
      'allow-cheats': 'false',
      'max-players': '50',
      pvp: 'true',
      'keep-inventory': 'false'
    },
    addonPacks: ['pack_sample_bp', 'pack_sample_rp']
  }
];

/**
 * Experiment IDs operators may want for a mode. Not written to level.dat yet —
 * surfaced for awareness until a world NBT writer exists.
 */
export const MODE_EXPERIMENT_HINTS: Record<string, string[]> = {
  tmpl_flat_skyblock: ['data_driven_items', 'gametest'],
  tmpl_classic_smp: ['villager_trades_rebalance'],
  tmpl_creative_sandbox: [],
  tmpl_vanilla_survival: []
};

/**
 * Upsert the mode catalog into a memory DB (and later Prisma via flush).
 * Safe to call on every boot so older DBs pick up new modes without a full reseed.
 */
export function ensureModeCatalogTemplates(memory: { templates: ServerTemplate[] }): number {
  let upserted = 0;
  for (const catalog of MODE_CATALOG_TEMPLATES) {
    const existing = memory.templates.find((t) => t.id === catalog.id);
    if (existing) {
      existing.name = catalog.name;
      existing.description = catalog.description;
      existing.bdsVersion = catalog.bdsVersion;
      existing.defaultProperties = { ...catalog.defaultProperties };
      existing.addonPacks = [...catalog.addonPacks];
      upserted += 1;
    } else {
      memory.templates.push({
        ...catalog,
        defaultProperties: { ...catalog.defaultProperties },
        addonPacks: [...catalog.addonPacks],
        createdAt: new Date()
      });
      upserted += 1;
    }
  }
  return upserted;
}
