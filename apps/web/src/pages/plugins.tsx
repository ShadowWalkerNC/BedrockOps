import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../lib/api-client';
import { RealmTemplate } from '../lib/types';

const c = THEME.colors;

export default function PluginsPage() {
  const [templates, setTemplates] = useState<RealmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<{ templates: RealmTemplate[] }>('/templates');
        setTemplates(res.templates);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const refuseInstall = (name: string) => {
    setNote(
      `Install refused for "${name}". Pack / add-on installation is Wave D and is not wired — refusing rather than faking success.`
    );
  };

  return (
    <AppShell active="plugins">
      <header>
        <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28 }}>Plugins & packs</h1>
        <p style={{ margin: '6px 0 0', color: c.onSurfaceVariant }}>
          Mode catalog is live (Survival, Creative Sandbox, Skyblock-ready Flat, Classic SMP). Installing behavior packs / Script API add-ons is Wave D.
        </p>
      </header>

      {note ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: THEME.radius.md,
            background: c.surfaceContainerHigh,
            color: c.onSurface,
            fontSize: 13
          }}
        >
          {note}
        </div>
      ) : null}
      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: THEME.radius.md,
            background: c.errorContainer,
            color: c.error,
            fontSize: 13
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          marginTop: THEME.space.md,
          background: c.surfaceContainer,
          border: `1px solid ${c.outline}`,
          borderRadius: THEME.radius.lg,
          padding: THEME.space.md,
          display: 'grid',
          gap: 12
        }}
      >
        <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 18 }}>Realm templates</h2>
        {loading ? <p style={{ color: c.onSurfaceVariant }}>Loading…</p> : null}
        {!loading && templates.length === 0 ? (
          <p style={{ margin: 0, color: c.onSurfaceVariant }}>
            No templates seeded. Run Setup to apply the default vanilla template, or seed via the API.
          </p>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {templates.map((t) => (
            <article
              key={t.id}
              style={{
                background: c.surface,
                border: `1px solid ${c.outline}`,
                borderRadius: THEME.radius.md,
                padding: 14,
                display: 'grid',
                gap: 8
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontFamily: THEME.fonts.heading, fontSize: 16 }}>{t.name}</strong>
                  <div style={{ color: c.onSurfaceVariant, fontSize: 13, marginTop: 4 }}>{t.description}</div>
                </div>
                <span style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.tertiary }}>BDS {t.bdsVersion}</span>
              </div>
              <div style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono }}>
                props: {Object.entries(t.defaultProperties || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ') || '—'}
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: c.onSurfaceVariant }}>Addon packs: </span>
                {t.addonPacks?.length ? t.addonPacks.join(', ') : 'none declared'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href="/setup" style={btnSecondary}>
                  Apply via Setup
                </Link>
                <button type="button" style={btnPrimary} onClick={() => refuseInstall(t.name)}>
                  Install packs
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        style={{
          marginTop: THEME.space.md,
          border: `1px dashed ${c.outline}`,
          borderRadius: THEME.radius.lg,
          padding: THEME.space.md,
          color: c.onSurfaceVariant,
          fontSize: 13,
          display: 'grid',
          gap: 8
        }}
      >
        <strong style={{ color: c.onSurface }}>Wave D — not implemented</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Pack / add-on engine and Script API compatibility checks</li>
          <li>First-party marketplace catalog</li>
          <li>Skins / cosmetics pipelines</li>
        </ul>
        <p style={{ margin: 0 }}>
          Per repo rules, these must not pretend to succeed until the pack engine lands.
        </p>
      </section>
    </AppShell>
  );
}

const btnPrimary: React.CSSProperties = {
  background: c.primary,
  color: c.onPrimary,
  border: 'none',
  borderRadius: THEME.radius.md,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: THEME.fonts.heading
};

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: c.onSurface,
  border: `1px solid ${c.outline}`,
  borderRadius: THEME.radius.md,
  padding: '10px 14px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center'
};
