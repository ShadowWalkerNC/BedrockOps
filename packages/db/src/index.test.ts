import { describe, it, expect } from 'vitest';
import { db, UserRole, ServerStatus, ensureModeCatalogTemplates, MODE_CATALOG_TEMPLATES } from './index';

describe('Database Schema & Seed Defaults', () => {
  it('seeds default admin user and default server', () => {
    expect(db.users.length).toBeGreaterThan(0);
    expect(db.users[0].username).toBe('admin');
    expect(db.users[0].role).toBe(UserRole.OWNER);

    expect(db.servers.length).toBeGreaterThan(0);
    expect(db.servers[0].name).toBe('Main Survival Realm');
    expect(db.servers[0].status).toBe(ServerStatus.ONLINE);
  });

  it('seeds the full mode catalog', () => {
    expect(db.templates.length).toBeGreaterThanOrEqual(MODE_CATALOG_TEMPLATES.length);
    for (const mode of MODE_CATALOG_TEMPLATES) {
      expect(db.templates.some((t) => t.id === mode.id)).toBe(true);
    }
  });

  it('upserts missing catalog modes without duplicating ids', () => {
    db.templates = db.templates.filter((t) => t.id === 'tmpl_vanilla_survival');
    const n = ensureModeCatalogTemplates(db);
    expect(n).toBe(MODE_CATALOG_TEMPLATES.length);
    const ids = db.templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(MODE_CATALOG_TEMPLATES.map((t) => t.id)));
  });
});
