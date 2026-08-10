import type { BedrockServer } from '@mc-admin/db';

export type PackKind = 'behavior' | 'resource';

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
  /** UUID from manifest header — used in world_*_packs.json */
  uuid: string;
  version: [number, number, number];
  minEngineVersion: [number, number, number];
  scriptApi: boolean;
  /** Pack root files keyed by path relative to the pack folder. */
  files: Record<string, string>;
}

export interface PackApplyPlan {
  packId: string;
  kind: PackKind;
  levelName: string;
  files: PackFile[];
  scriptApi: boolean;
  minEngineVersion: [number, number, number];
}

/** First-party vetted sample packs (Wave D1). Not a marketplace yet. */
export const PACK_CATALOG: PackCatalogEntry[] = [
  {
    id: 'pack_sample_bp',
    name: 'Sample Behavior Pack',
    description:
      'Minimal vetted behavior pack for install/enable smoke. No Script API modules.',
    kind: 'behavior',
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': JSON.stringify(
        {
          format_version: 2,
          header: {
            name: 'Sample Behavior Pack',
            description: 'BedrockOps Wave D1 sample',
            uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
            version: [1, 0, 0],
            min_engine_version: [1, 20, 0]
          },
          modules: [
            {
              type: 'data',
              uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2',
              version: [1, 0, 0]
            }
          ]
        },
        null,
        2
      ),
      'texts/en_US.lang': 'pack.name=Sample Behavior Pack\npack.description=BedrockOps Wave D1 sample\n'
    }
  },
  {
    id: 'pack_sample_rp',
    name: 'Sample Resource Pack',
    description: 'Minimal vetted resource pack for install/enable smoke.',
    kind: 'resource',
    uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    scriptApi: false,
    files: {
      'manifest.json': JSON.stringify(
        {
          format_version: 2,
          header: {
            name: 'Sample Resource Pack',
            description: 'BedrockOps Wave D1 sample RP',
            uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3',
            version: [1, 0, 0],
            min_engine_version: [1, 20, 0]
          },
          modules: [
            {
              type: 'resources',
              uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee4',
              version: [1, 0, 0]
            }
          ]
        },
        null,
        2
      ),
      'texts/en_US.lang': 'pack.name=Sample Resource Pack\npack.description=BedrockOps Wave D1 sample RP\n'
    }
  }
];

export class PackEngine {
  public static listCatalog(): PackCatalogEntry[] {
    return PACK_CATALOG.map((p) => ({
      ...p,
      files: { ...p.files }
    }));
  }

  public static getPack(packId: string): PackCatalogEntry {
    const pack = PACK_CATALOG.find((p) => p.id === packId);
    if (!pack) {
      throw new Error(`Pack ID ${packId} not found in catalog`);
    }
    return pack;
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
