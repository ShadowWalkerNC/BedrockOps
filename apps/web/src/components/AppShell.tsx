import React from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';

export type NavKey = 'dashboard' | 'console' | 'players' | 'plugins' | 'worlds' | 'settings';

interface NavDef {
  key: NavKey;
  label: string;
  href?: string;
  soon?: boolean;
}

const NAV: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/' },
  { key: 'console', label: 'Console', href: '/console' },
  { key: 'players', label: 'Players', soon: true },
  { key: 'plugins', label: 'Plugins', soon: true },
  { key: 'worlds', label: 'Worlds', soon: true },
  { key: 'settings', label: 'Settings', soon: true }
];

const c = THEME.colors;

export interface AppShellProps {
  active: NavKey;
  /** Optional element rendered on the right of the top bar (e.g. status pill). */
  topRight?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ active, topRight, children }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background: c.background,
        color: c.onSurface,
        fontFamily: THEME.fonts.body
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          background: c.secondaryContainer,
          borderRight: `2px solid ${c.outline}`,
          padding: THEME.space.md,
          display: 'flex',
          flexDirection: 'column',
          gap: THEME.space.sm
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <div style={{ fontFamily: THEME.fonts.heading, fontWeight: 700, fontSize: 20 }}>BedrockOps</div>
            <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, color: c.onSurfaceVariant }}>v2.4.0-STABLE</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: THEME.space.sm }}>
          {NAV.map((item) => {
            const isActive = item.key === active;
            const content = (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>{item.label}</span>
                {item.soon && (
                  <span
                    style={{
                      fontFamily: THEME.fonts.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      color: c.onSurfaceVariant,
                      border: `1px solid ${c.outline}`,
                      borderRadius: THEME.radius.sm,
                      padding: '1px 5px'
                    }}
                  >
                    SOON
                  </span>
                )}
              </span>
            );
            if (item.href && !item.soon) {
              return (
                <Link key={item.key} href={item.href} style={navStyle(isActive)}>
                  {content}
                </Link>
              );
            }
            return (
              <span key={item.key} style={{ ...navStyle(isActive), cursor: 'default', opacity: item.soon ? 0.7 : 1 }}>
                {content}
              </span>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>
          <span>◷ Help</span>
          <span>▤ Logs</span>
        </div>
      </aside>

      {/* Main column */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: `${THEME.space.sm} ${THEME.space.md}`,
            borderBottom: `2px solid ${c.outline}`,
            background: c.surface
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              maxWidth: 440,
              background: c.surfaceContainerLowest,
              border: `2px solid ${c.outline}`,
              borderRadius: THEME.radius.md,
              padding: '8px 12px',
              color: c.onSurfaceVariant,
              fontFamily: THEME.fonts.mono,
              fontSize: 13
            }}
          >
            <span>⌕</span>
            <span>Search resources…</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {topRight}
            <span style={{ color: c.onSurfaceVariant }}>🔔</span>
            <span style={{ color: c.onSurfaceVariant }}>⌸</span>
          </div>
        </header>

        <main style={{ padding: THEME.space.md, display: 'flex', flexDirection: 'column', gap: THEME.space.md, minWidth: 0, flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
};

function navStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    padding: '10px 12px',
    borderRadius: THEME.radius.md,
    fontFamily: THEME.fonts.body,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    background: active ? c.primary : 'transparent',
    color: active ? c.onPrimary : c.onSurfaceVariant,
    border: active ? `2px solid ${c.primary}` : '2px solid transparent'
  };
}
