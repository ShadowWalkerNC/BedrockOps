import { describe, it, expect } from 'vitest';
import {
  signJwt,
  verifyJwt,
  hashPassword,
  comparePassword,
  hasPermission,
  generateDevSession,
  AuthSession
} from './index';
import { UserRole } from '@mc-admin/db';

describe('Auth Package', () => {
  const secret = 'test_jwt_secret';

  it('signs and verifies JWT tokens correctly', () => {
    const session: AuthSession = {
      userId: 'usr_123',
      email: 'test@example.com',
      username: 'testuser',
      role: UserRole.ADMIN
    };

    const token = signJwt(session, secret);
    expect(typeof token).toBe('string');

    const decoded = verifyJwt<AuthSession>(token, secret);
    expect(decoded.userId).toBe(session.userId);
    expect(decoded.username).toBe(session.username);
    expect(decoded.role).toBe(session.role);
  });

  it('hashes and compares passwords correctly', async () => {
    const password = 'mySecretPassword123';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('wrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('checks permission hierarchy', () => {
    expect(hasPermission(UserRole.OWNER, UserRole.ADMIN)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, UserRole.ADMIN)).toBe(true);
    expect(hasPermission(UserRole.MODERATOR, UserRole.ADMIN)).toBe(false);
    expect(hasPermission(UserRole.VIEWER, UserRole.MODERATOR)).toBe(false);
  });

  it('generates dev session with token', () => {
    const devSession = generateDevSession('devadmin', UserRole.OWNER);
    expect(devSession.username).toBe('devadmin');
    expect(devSession.token).toBeDefined();
  });
});
