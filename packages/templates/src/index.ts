import { db, ServerTemplate, BedrockServer, MODE_EXPERIMENT_HINTS } from '@mc-admin/db';
import { PackApplyPlan, PackEngine } from './packs';

export * from './packs';
export * from './scriptMatrix';

export interface CreateTemplateInput {
  name: string;
  description: string;
  bdsVersion: string;
  defaultProperties: Record<string, string>;
  addonPacks?: string[];
}

/** Atomic write plan for agent WRITE_PROPERTIES (server.properties only). */
export interface PropertiesWritePlan {
  targetPath: string;
  tempPath: string;
  contents: string;
  templateId: string;
}

export interface DeclaredPackPlanResult {
  packId: string;
  plan?: PackApplyPlan;
  error?: string;
}

export class TemplateEngine {
  public static createTemplate(input: CreateTemplateInput): ServerTemplate {
    const template: ServerTemplate = {
      id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: input.name,
      description: input.description,
      bdsVersion: input.bdsVersion,
      defaultProperties: input.defaultProperties,
      addonPacks: input.addonPacks || [],
      createdAt: new Date()
    };

    db.templates.push(template);
    return template;
  }

  public static getTemplate(templateId: string): ServerTemplate {
    const template = db.templates.find((t) => t.id === templateId);
    if (!template) {
      throw new Error(`Template ID ${templateId} not found`);
    }
    return template;
  }

  public static getExperimentHints(templateId: string): string[] {
    return [...(MODE_EXPERIMENT_HINTS[templateId] || [])];
  }

  /** Serialize template (+ server name/port/rcon) into server.properties body. */
  public static serializeProperties(
    template: ServerTemplate,
    server: Pick<BedrockServer, 'name' | 'port' | 'rconPort' | 'rconPassword'>
  ): string {
    const merged: Record<string, string> = {
      'server-name': server.name,
      'server-port': String(server.port),
      'server-portv6': String(server.port + 1),
      'enable-rcon': 'true',
      'rcon.port': String(server.rconPort),
      'rcon.password': server.rconPassword || '',
      ...template.defaultProperties
    };
    return Object.entries(merged)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
      .concat('\n');
  }

  public static buildPropertiesWritePlan(templateId: string, server: BedrockServer): PropertiesWritePlan {
    const template = this.getTemplate(templateId);
    if (!server.serverPath) {
      throw new Error(`Server ${server.id} has no serverPath for properties write`);
    }
    const base = server.serverPath.replace(/\/$/, '');
    const targetPath = `${base}/server.properties`;
    const digest = `${templateId}_${server.id}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return {
      targetPath,
      tempPath: `${targetPath}.${digest}.tmp`,
      contents: this.serializeProperties(template, server),
      templateId
    };
  }

  /**
   * Build pack apply plans for every addonPacks entry that exists in the D1 catalog.
   * Unknown IDs are returned with an error (never silently skipped as success).
   */
  public static buildDeclaredPackPlans(
    templateId: string,
    server: Pick<BedrockServer, 'serverPath' | 'version'>
  ): DeclaredPackPlanResult[] {
    const template = this.getTemplate(templateId);
    return template.addonPacks.map((packId) => {
      try {
        const pack = PackEngine.getPack(packId);
        if (!PackEngine.isBdsCompatible(server.version || template.bdsVersion, pack.minEngineVersion)) {
          return {
            packId,
            error: `BDS ${server.version || template.bdsVersion} below pack min ${pack.minEngineVersion.join('.')}`
          };
        }
        if (pack.scriptApi) {
          const compat = PackEngine.checkScriptCompatibility(
            server.version || template.bdsVersion,
            pack
          );
          if (!compat.ok) {
            return { packId, error: compat.reason || 'Script API incompatible' };
          }
        }
        return {
          packId,
          plan: PackEngine.buildApplyPlan(packId, server as BedrockServer, {
            levelName: PackEngine.resolveLevelName(
              template.defaultProperties['level-name']
                ? `level-name=${template.defaultProperties['level-name']}`
                : undefined
            )
          })
        };
      } catch (err: unknown) {
        return {
          packId,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    });
  }

  public static applyTemplateToServer(templateId: string, server: BedrockServer): BedrockServer {
    const template = this.getTemplate(templateId);

    server.version = template.bdsVersion;
    if (template.defaultProperties['gamemode']) {
      server.gameMode = template.defaultProperties['gamemode'];
    }
    if (template.defaultProperties['difficulty']) {
      server.difficulty = template.defaultProperties['difficulty'];
    }
    if (template.defaultProperties['max-players']) {
      server.maxPlayers = parseInt(template.defaultProperties['max-players'], 10) || 10;
    }

    server.updatedAt = new Date();
    return server;
  }
}
