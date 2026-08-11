export type PackType = 'BEHAVIOR' | 'RESOURCE' | 'ENDSTONE_PLUGIN' | 'POCKETMINE_PLUGIN' | 'WORLD';

export interface BedrockPackManifest {
  uuid: string;
  name: string;
  description: string;
  version: [number, number, number];
  packType: PackType;
  minEngineVersion?: [number, number, number];
  filename: string;
}

export interface PackSynthesisPlan {
  serverId: string;
  behaviorPacks: Array<{ pack_id: string; version: [number, number, number] }>;
  resourcePacks: Array<{ pack_id: string; version: [number, number, number] }>;
  endstonePlugins: string[];
  pocketminePlugins: string[];
}

export class MarketplaceSynthesisEngine {
  public static parseManifest(rawJson: string, filename: string): BedrockPackManifest {
    try {
      const parsed = JSON.parse(rawJson);
      const header = parsed.header || {};
      const modules = parsed.modules || [];
      const isBehavior = modules.some((m: any) => m.type === 'data' || m.type === 'script');

      return {
        uuid: header.uuid || `gen_${Math.random().toString(36).substring(2, 9)}`,
        name: header.name || filename,
        description: header.description || 'Custom Bedrock Pack',
        version: Array.isArray(header.version) ? header.version : [1, 0, 0],
        packType: isBehavior ? 'BEHAVIOR' : 'RESOURCE',
        minEngineVersion: header.min_engine_version,
        filename
      };
    } catch {
      return {
        uuid: `raw_${filename.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: filename,
        description: 'Uploaded Mod/Pack',
        version: [1, 0, 0],
        packType: filename.endsWith('.whl') || filename.endsWith('.py') ? 'ENDSTONE_PLUGIN' : 'RESOURCE',
        filename
      };
    }
  }

  public static buildWorldPacksJson(packs: BedrockPackManifest[]): {
    behaviorPacksJson: string;
    resourcePacksJson: string;
  } {
    const behaviors = packs
      .filter((p) => p.packType === 'BEHAVIOR')
      .map((p) => ({ pack_id: p.uuid, version: p.version }));

    const resources = packs
      .filter((p) => p.packType === 'RESOURCE')
      .map((p) => ({ pack_id: p.uuid, version: p.version }));

    return {
      behaviorPacksJson: JSON.stringify(behaviors, null, 2),
      resourcePacksJson: JSON.stringify(resources, null, 2)
    };
  }
}
