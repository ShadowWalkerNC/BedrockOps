import { describe, it, expect } from 'vitest';
import { db, UserRole, ServerStatus } from './index';

describe('Database Schema & Seed Defaults', () => {
  it('seeds default admin user and default server', () => {
    expect(db.users.length).toBeGreaterThan(0);
    expect(db.users[0].username).toBe('admin');
    expect(db.users[0].role).toBe(UserRole.OWNER);

    expect(db.servers.length).toBeGreaterThan(0);
    expect(db.servers[0].name).toBe('Main Survival Realm');
    expect(db.servers[0].status).toBe(ServerStatus.ONLINE);
  });
});
