import { db, ServerTemplate, BedrockServer } from '@mc-admin/db';

export interface CreateTemplateInput {
  name: string;
  description: string;
  bdsVersion: string;
  defaultProperties: Record<string, string>;
  addonPacks?: string[];
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

  public static applyTemplateToServer(templateId: string, server: BedrockServer): BedrockServer {
    const template = db.templates.find((t) => t.id === templateId);
    if (!template) {
      throw new Error(`Template ID ${templateId} not found`);
    }

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
