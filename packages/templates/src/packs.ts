import type { BedrockServer } from '@mc-admin/db';
import { checkScriptCompatibility, type ScriptCompatResult } from './scriptMatrix';

export type PackKind = 'behavior' | 'resource';
export type PackCategory = 'starter' | 'gameplay' | 'cosmetic' | 'utility';

export interface PackFile {
  /** Path relative to serverPath (must stay under worlds/... packs jail). */
  relativePath: string;
  contents: string;
}

export interface PackCatalogEntry {
  id: string;
  name: string;
  description: string;
  kind: PackKind;
  category: PackCategory;
  tags: string[];
  publisher: string;
  vetted: boolean;
  /** UUID from manifest header — used in world_*_packs.json */
  uuid: string;
  version: [number, number, number];
  minEngineVersion: [number, number, number];
  scriptApi: boolean;
  /** Required @minecraft/* module versions when scriptApi is true. */
  requiredScriptModules?: Record<string, string>;
  /** Hard block reason — never one-click apply (stubs / persona). */
  blockedReason?: string;
  /** Pack root files keyed by path relative to the pack folder. */
  files: Record<string, string>;
}

export interface PackCatalogQuery {
  q?: string;
  kind?: PackKind;
  category?: PackCategory;
  tag?: string;
  vettedOnly?: boolean;
}

export interface PackApplyPlan {
  packId: string;
  kind: PackKind;
  levelName: string;
  files: PackFile[];
  scriptApi: boolean;
  minEngineVersion: [number, number, number];
}

function bpManifest(name: string, description: string, headerUuid: string, moduleUuid: string): string {
  return `${JSON.stringify(
    {
      format_version: 2,
      header: {
        name,
        description,
        uuid: headerUuid,
        version: [1, 0, 0],
        min_engine_version: [1, 20, 0]
      },
      modules: [{ type: 'data', uuid: moduleUuid, version: [1, 0, 0] }]
    },
    null,
    2
  )}\n`;
}

function rpManifest(name: string, description: string, headerUuid: string, moduleUuid: string): string {
  return `${JSON.stringify(
    {
      format_version: 2,
      header: {
        name,
        description,
        uuid: headerUuid,
        version: [1, 0, 0],
        min_engine_version: [1, 20, 0]
      },
      modules: [{ type: 'resources', uuid: moduleUuid, version: [1, 0, 0] }]
    },
    null,
    2
  )}\n`;
}

/** First-party vetted marketplace catalog (Wave D4). External Mojang store is out of scope. */
export const PACK_CATALOG: PackCatalogEntry[] = [
  {
    id: 'pack_sample_bp',
    name: 'Sample Behavior Pack',
    description: 'Minimal vetted behavior pack for install/enable smoke. No Script API modules.',
    kind: 'behavior',
    category: 'starter',
    tags: ['sample', 'smoke', 'skyblock'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': bpManifest(
        'Sample Behavior Pack',
        'BedrockOps Wave D sample',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2'
      ),
      'texts/en_US.lang': 'pack.name=Sample Behavior Pack\npack.description=BedrockOps Wave D sample\n'
    }
  },
  {
    id: 'pack_sample_rp',
    name: 'Sample Resource Pack',
    description: 'Minimal vetted resource pack for install/enable smoke.',
    kind: 'resource',
    category: 'cosmetic',
    tags: ['sample', 'smoke', 'sandbox'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': rpManifest(
        'Sample Resource Pack',
        'BedrockOps Wave D sample RP',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee4'
      ),
      'texts/en_US.lang': 'pack.name=Sample Resource Pack\npack.description=BedrockOps Wave D sample RP\n'
    }
  },
  {
    id: 'pack_smp_welcome_bp',
    name: 'SMP Welcome Rules',
    description: 'Lightweight behavior pack scaffold for community SMP welcome/rules text.',
    kind: 'behavior',
    category: 'gameplay',
    tags: ['smp', 'community', 'rules'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee5',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': bpManifest(
        'SMP Welcome Rules',
        'BedrockOps SMP starter',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee5',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee6'
      ),
      'texts/en_US.lang':
        'pack.name=SMP Welcome Rules\npack.description=Community SMP starter scaffold\n'
    }
  },
  {
    id: 'pack_cosmetic_staff_badge_rp',
    name: 'Staff Badge Cosmetics',
    description:
      'World resource pack cosmetics (textures/lang). Applies as a world RP — does not replace Xbox Persona skins.',
    kind: 'resource',
    category: 'cosmetic',
    tags: ['skin', 'cosmetics', 'staff', 'badge'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee11',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': rpManifest(
        'Staff Badge Cosmetics',
        'BedrockOps D3 cosmetic RP — world download only',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee11',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee12'
      ),
      'texts/en_US.lang':
        'pack.name=Staff Badge Cosmetics\npack.description=World RP cosmetics — not Persona\n'
    }
  },
  {
    id: 'pack_script_hello_bp',
    name: 'Script Hello Sample',
    description:
      'Minimal Script API behavior pack (hello world). Apply only when the BDS Script matrix allows it.',
    kind: 'behavior',
    category: 'utility',
    tags: ['script', 'sample', 'hello'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee13',
    version: [1, 0, 0],
    minEngineVersion: [1, 21, 0],
    scriptApi: true,
    requiredScriptModules: { '@minecraft/server': '1.11.0' },
    files: {
      'manifest.json': `${JSON.stringify(
        {
          format_version: 2,
          header: {
            name: 'Script Hello Sample',
            description: 'BedrockOps Script API sample',
            uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee13',
            version: [1, 0, 0],
            min_engine_version: [1, 21, 0]
          },
          modules: [
            {
              type: 'script',
              language: 'javascript',
              uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee14',
              version: [1, 0, 0],
              entry: 'scripts/main.js'
            }
          ],
          dependencies: [
            {
              module_name: '@minecraft/server',
              version: '1.11.0'
            }
          ]
        },
        null,
        2
      )}\n`,
      'scripts/main.js':
        "import { world } from '@minecraft/server';\nworld.sendMessage('[BedrockOps] Script Hello sample loaded');\n"
    }
  },
  {
    id: 'pack_utility_clearlag_stub',
    name: 'Utility Clear-Lag Stub',
    description:
      'Utility-category stub pack (manifest only). Real clear-lag needs a complete Script implementation.',
    kind: 'behavior',
    category: 'utility',
    tags: ['utility', 'performance'],
    publisher: 'BedrockOps',
    vetted: true,
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee7',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: true,
    requiredScriptModules: { '@minecraft/server': '1.11.0' },
    blockedReason:
      'Clear-lag is a catalog stub — not a runnable Script module yet. Use pack_script_hello_bp to validate Script apply.',
    files: {
      'manifest.json': bpManifest(
        'Utility Clear-Lag Stub',
        'Script API required — not auto-applied',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee7',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee8'
      ),
      'texts/en_US.lang': 'pack.name=Utility Clear-Lag Stub\npack.description=Script API required\n'
    }
  }
];

export class PackEngine {
  public static listCatalog(query?: PackCatalogQuery): PackCatalogEntry[] {
    const q = query?.q?.trim().toLowerCase();
    return PACK_CATALOG.filter((p) => {
      if (query?.vettedOnly && !p.vetted) return false;
      if (query?.kind && p.kind !== query.kind) return false;
      if (query?.category && p.category !== query.category) return false;
      if (query?.tag && !p.tags.includes(query.tag)) return false;
      if (q) {
        const hay = `${p.name} ${p.description} ${p.tags.join(' ')} ${p.publisher}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).map((p) => ({
      ...p,
      tags: [...p.tags],
      files: { ...p.files },
      requiredScriptModules: p.requiredScriptModules ? { ...p.requiredScriptModules } : undefined
    }));
  }

  public static listFacets(): {
    categories: PackCategory[];
    kinds: PackKind[];
    tags: string[];
  } {
    const tags = new Set<string>();
    for (const p of PACK_CATALOG) {
      for (const t of p.tags) tags.add(t);
    }
    return {
      categories: ['starter', 'gameplay', 'cosmetic', 'utility'],
      kinds: ['behavior', 'resource'],
      tags: [...tags].sort()
    };
  }

  public static getPack(packId: string): PackCatalogEntry {
    const pack = PACK_CATALOG.find((p) => p.id === packId);
    if (!pack) {
      throw new Error(`Pack ID ${packId} not found in catalog`);
    }
    return pack;
  }

  /** Gate Script API packs against the per-BDS compatibility matrix. */
  public static checkScriptCompatibility(
    serverVersion: string,
    pack: PackCatalogEntry
  ): ScriptCompatResult {
    if (pack.blockedReason) {
      return { ok: false, reason: pack.blockedReason };
    }
    if (!pack.scriptApi) {
      return { ok: true };
    }
    return checkScriptCompatibility(serverVersion, pack.requiredScriptModules || {});
  }

  public static resolveLevelName(serverPropertiesContents?: string): string {
    if (serverPropertiesContents) {
      const match = serverPropertiesContents.match(/^level-name=(.*)$/m);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }
    return 'Bedrock level';
  }

  /**
   * Build atomic file writes for pack install + world enable list.
   * Does not touch the host — caller must send plan via agent.
   */
  public static buildApplyPlan(
    packId: string,
    server: Pick<BedrockServer, 'serverPath'>,
    options?: { levelName?: string; existingEnableListJson?: string }
  ): PackApplyPlan {
    const pack = this.getPack(packId);
    const levelName = options?.levelName || 'Bedrock level';
    const packFolder =
      pack.kind === 'behavior'
        ? `worlds/${levelName}/behavior_packs/${pack.id}`
        : `worlds/${levelName}/resource_packs/${pack.id}`;

    const files: PackFile[] = Object.entries(pack.files).map(([rel, contents]) => ({
      relativePath: `${packFolder}/${rel}`.replace(/\\/g, '/'),
      contents: contents.endsWith('\n') ? contents : `${contents}\n`
    }));

    const enableFile =
      pack.kind === 'behavior'
        ? `worlds/${levelName}/world_behavior_packs.json`
        : `worlds/${levelName}/world_resource_packs.json`;

    const enableList = this.mergeEnableList(options?.existingEnableListJson, {
      pack_id: pack.uuid,
      version: pack.version
    });

    files.push({
      relativePath: enableFile,
      contents: `${JSON.stringify(enableList, null, 2)}\n`
    });

    return {
      packId: pack.id,
      kind: pack.kind,
      levelName,
      files,
      scriptApi: pack.scriptApi,
      minEngineVersion: pack.minEngineVersion
    };
  }

  public static mergeEnableList(
    existingJson: string | undefined,
    entry: { pack_id: string; version: [number, number, number] }
  ): Array<{ pack_id: string; version: number[] }> {
    let list: Array<{ pack_id: string; version: number[] }> = [];
    if (existingJson?.trim()) {
      try {
        const parsed = JSON.parse(existingJson) as unknown;
        if (Array.isArray(parsed)) {
          list = parsed.filter(
            (item): item is { pack_id: string; version: number[] } =>
              !!item &&
              typeof item === 'object' &&
              typeof (item as { pack_id?: unknown }).pack_id === 'string' &&
              Array.isArray((item as { version?: unknown }).version)
          );
        }
      } catch {
        list = [];
      }
    }
    const without = list.filter((e) => e.pack_id !== entry.pack_id);
    without.push({ pack_id: entry.pack_id, version: [...entry.version] });
    return without;
  }

  /** Compare dotted BDS version string against pack min_engine_version. */
  public static isBdsCompatible(serverVersion: string, minEngine: [number, number, number]): boolean {
    const parts = serverVersion.split('.').map((p) => parseInt(p, 10));
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    if (major !== minEngine[0]) return major > minEngine[0];
    if (minor !== minEngine[1]) return minor > minEngine[1];
    return patch >= minEngine[2];
  }
}
