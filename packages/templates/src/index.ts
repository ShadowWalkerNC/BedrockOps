import { db, ServerTemplate, BedrockServer } from '@mc-admin/db';

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

export interface PackManifestEntry {
  pack_id: string;
  version: [number, number, number];
}

export class PackManifestSynthesizer {
  public static serializePackManifest(entries: PackManifestEntry[]): string {
    return `${JSON.stringify(entries, null, 2)}\n`;
  }

  public static writeWorldPackManifests(
    worldDir: string,
    behaviorPacks: PackManifestEntry[] = [],
    resourcePacks: PackManifestEntry[] = []
  ): { behaviorPath: string; resourcePath: string } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    fs.mkdirSync(worldDir, { recursive: true });

    const behaviorPath = path.join(worldDir, 'world_behavior_packs.json');
    const resourcePath = path.join(worldDir, 'world_resource_packs.json');

    fs.writeFileSync(behaviorPath, this.serializePackManifest(behaviorPacks), 'utf8');
    fs.writeFileSync(resourcePath, this.serializePackManifest(resourcePacks), 'utf8');

    return { behaviorPath, resourcePath };
  }
}

