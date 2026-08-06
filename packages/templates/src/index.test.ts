import { describe, it, expect } from 'vitest';
import { TemplateEngine } from './index';
import { db } from '@mc-admin/db';

describe('Templates Domain Package', () => {
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
});
