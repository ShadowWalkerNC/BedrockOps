import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole } from '@mc-admin/db';

export interface AuthSession {
  userId: string;
  email?: string;
  username: string;
  role: UserRole;
  token?: string;
}

export interface JwtPayload extends AuthSession {
  iat?: number;
  exp?: number;
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.OWNER]: 4,
    [UserRole.ADMIN]: 3,
    [UserRole.MODERATOR]: 2,
    [UserRole.VIEWER]: 1,
  };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function signJwt(payload: AuthSession, secret: string, expiresIn = '24h'): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
}

export function verifyJwt<T = JwtPayload>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateDevSession(username = 'admin', role = UserRole.OWNER): AuthSession {
  const session: AuthSession = {
    userId: 'usr_dev_1',
    email: `${username}@minecraft-admin.local`,
    username,
    role
  };
  const token = signJwt(session, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production');
  return { ...session, token };
}
