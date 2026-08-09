import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { THEME } from '@mc-admin/ui';
import { ApiError, login } from '../lib/api-client';

const c = THEME.colors;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@minecraft-admin.local');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      const next = typeof router.query.next === 'string' ? router.query.next : '/';
      await router.replace(next || '/');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: c.background,
        color: c.onSurface,
        fontFamily: THEME.fonts.body,
        padding: THEME.space.md
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          background: c.surfaceContainer,
          border: `1px solid ${c.outline}`,
          borderRadius: THEME.radius.lg,
          padding: THEME.space.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: THEME.space.sm
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: THEME.space.sm }}>
          <div
            style={{
              background: c.primary,
              color: c.onPrimary,
              width: 40,
              height: 40,
              borderRadius: THEME.radius.md,
              display: 'grid',
              placeItems: 'center',
              fontFamily: THEME.fonts.heading,
              fontWeight: 700,
              fontSize: 20
            }}
          >
            B
          </div>
          <div>
            <div style={{ fontFamily: THEME.fonts.heading, fontWeight: 700, fontSize: 22 }}>BedrockOps</div>
            <div style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>
              Sign in to the control plane
            </div>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {error ? (
          <div
            style={{
              background: c.errorContainer,
              color: c.error,
              borderRadius: THEME.radius.md,
              padding: '10px 12px',
              fontSize: 13
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: THEME.space.xs,
            background: c.primary,
            color: c.onPrimary,
            border: 'none',
            borderRadius: THEME.radius.md,
            padding: '12px 16px',
            fontWeight: 700,
            fontFamily: THEME.fonts.heading,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{ margin: 0, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 1.5 }}>
          Local seed account: <code>admin@minecraft-admin.local</code> / <code>admin</code>
        </p>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: c.surfaceContainerLowest,
  color: c.onSurface,
  border: `1px solid ${c.outline}`,
  borderRadius: THEME.radius.md,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: THEME.fonts.body
};
