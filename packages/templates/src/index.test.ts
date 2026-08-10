import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateEngine } from './index';
import { db } from '@mc-admin/db';

describe('Templates Domain Package', () => {
  beforeEach(() => {
    db.templates = [];
    db.servers = [];
    db.seedDefaults();
  });

  it('seeds popular mode catalog templates', () => {
    const ids = db.templates.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'tmpl_vanilla_survival',
        'tmpl_creative_sandbox',
        'tmpl_flat_skyblock',
        'tmpl_classic_smp'
      ])
    );
    expect(db.templates.find((t) => t.id === 'tmpl_vanilla_survival')?.addonPacks).toEqual([]);
    expect(db.templates.find((t) => t.id === 'tmpl_classic_smp')?.addonPacks).toEqual(
      expect.arrayContaining(['pack_sample_bp', 'pack_sample_rp'])
    );
    expect(db.templates.find((t) => t.id === 'tmpl_flat_skyblock')?.bdsVersion).toBe('1.21.0');
  });

  it('creates and applies server template', () => {
    const template = TemplateEngine.createTemplate({
      name: 'Test Template',
      description: 'Template for testing',
      bdsVersion: '1.20.80',
      defaultProperties: { gamemode: 'creative', difficulty: 'easy' }
    });

    expect(template.id).toBeDefined();
    expect(db.templates.length).toBeGreaterThan(0);

    const server = db.servers[0];
    TemplateEngine.applyTemplateToServer(template.id, server);
    expect(server.gameMode).toBe('creative');
  });

  it('builds a server.properties write plan from a catalog mode', () => {
    const server = db.servers[0];
    const plan = TemplateEngine.buildPropertiesWritePlan('tmpl_creative_sandbox', server);
    expect(plan.targetPath).toMatch(/server\.properties$/);
    expect(plan.contents).toContain('gamemode=creative');
    expect(plan.contents).toContain('difficulty=peaceful');
    expect(plan.contents).toContain(`server-name=${server.name}`);
    TemplateEngine.applyTemplateToServer('tmpl_creative_sandbox', server);
    expect(server.gameMode).toBe('creative');
    expect(server.maxPlayers).toBe(20);
  });

  it('applies Classic SMP defaults', () => {
    const server = db.servers[0];
    TemplateEngine.applyTemplateToServer('tmpl_classic_smp', server);
    expect(server.gameMode).toBe('survival');
    expect(server.difficulty).toBe('normal');
    expect(server.maxPlayers).toBe(50);
    expect(server.version).toBe('1.21.0');
  });

  it('builds declared pack plans for Classic SMP template', () => {
    const server = db.servers[0];
    TemplateEngine.applyTemplateToServer('tmpl_classic_smp', server);
    const plans = TemplateEngine.buildDeclaredPackPlans('tmpl_classic_smp', server);
    expect(plans.length).toBe(2);
    expect(plans.every((p) => p.plan && !p.error)).toBe(true);
    expect(TemplateEngine.getExperimentHints('tmpl_flat_skyblock').length).toBeGreaterThan(0);
  });
});
