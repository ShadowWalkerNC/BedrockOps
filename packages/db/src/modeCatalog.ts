import type { ServerTemplate } from './schema';

/** First-party Realm mode presets (property-level; packs are Wave D). */
export const MODE_CATALOG_TEMPLATES: Omit<ServerTemplate, 'createdAt'>[] = [
  {
    id: 'tmpl_vanilla_survival',
    name: 'Vanilla Hard Survival',
    description: 'Classic hard survival — no cheats. Packs not included (Wave D).',
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
    description: 'Build freely — creative mode with cheats for operators.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'creative',
      difficulty: 'peaceful',
      'allow-cheats': 'true',
      'max-players': '20',
      pvp: 'false',
      'keep-inventory': 'true'
    },
    addonPacks: []
  },
  {
    id: 'tmpl_flat_skyblock',
    name: 'Skyblock-ready Flat',
    description:
      'Flat world properties for a Skyblock-style start. Island packs/worlds are Wave D — not installed yet.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'normal',
      'allow-cheats': 'false',
      'max-players': '10',
      'level-type': 'FLAT',
      pvp: 'true',
      'keep-inventory': 'false'
    },
    addonPacks: []
  },
  {
    id: 'tmpl_classic_smp',
    name: 'Classic SMP',
    description:
      'Community survival multiplayer defaults (larger slots, PvP on). First-party preset — not a third-party SMP clone.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'normal',
      'allow-cheats': 'false',
      'max-players': '50',
      pvp: 'true',
      'keep-inventory': 'false'
    },
    addonPacks: []
  },
  {
    id: 'tmpl_endstone_plugin_hub',
    name: 'Endstone Python/C++ Plugin BDS',
    description:
      'Official Endstone server wrapper bringing Bukkit/Spigot Python & C++ plugin APIs directly to Bedrock Dedicated Server.',
    bdsVersion: '1.20.80',
    defaultProperties: {
      gamemode: 'survival',
      difficulty: 'hard',
      'allow-cheats': 'true',
      'max-players': '30',
      pvp: 'true'
    },
    addonPacks: ['endstone-chat-guard', 'endstone-perm-nodes']
  }
];

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
