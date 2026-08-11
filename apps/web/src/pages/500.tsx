import React from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';

const c = THEME.colors;

export default function Custom500() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.background || '#0f172a',
        color: c.onSurface || '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: THEME.fonts.heading
      }}
    >
      <div
        style={{
          maxWidth: 500,
          width: '100%',
          background: c.surfaceContainer || '#1e293b',
          border: `1px solid ${c.outline || '#334155'}`,
          borderRadius: THEME.radius.lg,
          padding: THEME.space.md,
          textAlign: 'center',
          display: 'grid',
          gap: 16
        }}
      >
        <span style={{ fontSize: 48 }}>⚡</span>
        <h1 style={{ margin: 0, fontSize: 24, color: c.error || '#ef4444' }}>500 — Server Internal Error</h1>
        <p style={{ margin: 0, color: c.onSurfaceVariant || '#94a3b8', fontSize: 13 }}>
          An internal server error occurred while processing your request. Auto-recovery active.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link
            href="/setup"
            style={{
              background: c.primary || '#3b82f6',
              color: c.onPrimary || '#ffffff',
              padding: '10px 18px',
              borderRadius: THEME.radius.md,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 13
            }}
          >
            Launch Setup Wizard
          </Link>
          <Link
            href="/"
            style={{
              background: 'transparent',
              color: c.onSurface || '#f8fafc',
              border: `1px solid ${c.outline || '#334155'}`,
              padding: '10px 18px',
              borderRadius: THEME.radius.md,
              textDecoration: 'none',
              fontSize: 13
            }}
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
