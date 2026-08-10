import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ApiError } from '../lib/api-client';
import { RealmTemplate } from '../lib/types';

const c = THEME.colors;

interface CatalogPack {
  id: string;
  name: string;
  description: string;
  kind: string;
  version: number[];
  scriptApi: boolean;
  fileCount: number;
}

export default function PluginsPage() {
  const [templates, setTemplates] = useState<RealmTemplate[]>([]);
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [serverId, setServerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [tmpl, srv, packRes] = await Promise.all([
          apiFetch<{ templates: RealmTemplate[] }>('/templates'),
          apiFetch<{ servers: Array<{ id: string; name: string }> }>('/servers'),
          apiFetch<{ packs: CatalogPack[] }>('/packs')
        ]);
        setTemplates(tmpl.templates);
        setServers(srv.servers);
        setPacks(packRes.packs);
        if (srv.servers[0]) setServerId(srv.servers[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const applyProperties = async (templateId: string, name: string) => {
    if (!serverId) {
      setNote('No realm selected — create one in Setup first.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await apiFetch<{
        success?: boolean;
        propertiesWrite?: { success: boolean; stub?: boolean; path?: string; error?: string };
        message?: string;
      }>('/provisioning/apply-template', {
        method: 'POST',
        body: JSON.stringify({ serverId, templateId })
      });
      if (res.propertiesWrite?.success || res.success) {
        setNote(`Applied "${name}" properties → ${res.propertiesWrite?.path || 'server.properties'}`);
      } else {
        setNote(
          res.propertiesWrite?.error ||
            res.message ||
            `Applied "${name}" in DB; disk write deferred until agent connects.`
        );
      }
    } catch (e) {
      const body =
        e instanceof ApiError && e.body && typeof e.body === 'object'
          ? (e.body as { propertiesWrite?: { error?: string }; message?: string })
          : null;
      setNote(
        body?.propertiesWrite?.error ||
          body?.message ||
          (e instanceof Error ? e.message : 'Apply failed')
      );
    } finally {
      setBusy(false);
    }
  };

  const installPack = async (packId: string, name: string, restart: boolean) => {
    if (!serverId) {
      setNote('No realm selected — create one in Setup first.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await apiFetch<{
        success?: boolean;
        write?: { filesWritten?: number; path?: string };
        plan?: { levelName?: string; fileCount?: number };
        message?: string;
      }>('/packs/apply', {
        method: 'POST',
        body: JSON.stringify({ serverId, packId, restart })
      });
      setNote(
        `Installed "${name}" → ${res.plan?.fileCount ?? res.write?.filesWritten ?? '?'} files` +
          (res.plan?.levelName ? ` under worlds/${res.plan.levelName}` : '') +
          (restart ? ' (restart requested)' : '') +
          '.'
      );
    } catch (e) {
      const body =
        e instanceof ApiError && e.body && typeof e.body === 'object'
          ? (e.body as { write?: { error?: string }; message?: string })
          : null;
      setNote(
        body?.write?.error ||
          body?.message ||
          (e instanceof Error ? e.message : 'Pack install failed')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell active="plugins">
      <header>
        <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28 }}>Plugins & packs</h1>
        <p style={{ margin: '6px 0 0', color: c.onSurfaceVariant }}>
          Mode presets + Wave D1 pack engine (vetted sample BP/RP). Marketplace catalog is D4.
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

      {servers.length > 0 ? (
        <label style={{ display: 'grid', gap: 4, maxWidth: 360, marginTop: THEME.space.md }}>
          <span style={{ fontFamily: THEME.fonts.mono, fontSize: 11, color: c.onSurfaceVariant }}>
            Target realm
          </span>
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            style={{
              background: c.surfaceContainerLowest,
              color: c.onSurface,
              border: `1px solid ${c.outline}`,
              borderRadius: THEME.radius.md,
              padding: '8px 10px',
              fontFamily: THEME.fonts.mono,
              fontSize: 13
            }}
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
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
        <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 18 }}>Vetted packs (D1)</h2>
        {loading ? <p style={{ color: c.onSurfaceVariant }}>Loading…</p> : null}
        {!loading && packs.length === 0 ? (
          <p style={{ margin: 0, color: c.onSurfaceVariant }}>No packs in catalog.</p>
        ) : null}
        <div style={{ display: 'grid', gap: 12 }}>
          {packs.map((p) => (
            <article
              key={p.id}
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
                  <strong style={{ fontFamily: THEME.fonts.heading, fontSize: 16 }}>{p.name}</strong>
                  <div style={{ color: c.onSurfaceVariant, fontSize: 13, marginTop: 4 }}>{p.description}</div>
                </div>
                <span style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.tertiary }}>
                  {p.kind} · v{p.version.join('.')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={busy || !serverId}
                  onClick={() => installPack(p.id, p.name, false)}
                >
                  Install pack
                </button>
                <button
                  type="button"
                  style={btnSecondary}
                  disabled={busy || !serverId}
                  onClick={() => installPack(p.id, p.name, true)}
                >
                  Install + restart
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

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
            No templates seeded. Run Setup to apply a mode preset.
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
                props:{' '}
                {Object.entries(t.defaultProperties || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ') || '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={busy || !serverId}
                  onClick={() => applyProperties(t.id, t.name)}
                >
                  Apply properties
                </button>
                <Link href="/setup" style={btnSecondary}>
                  Create via Setup
                </Link>
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
        <strong style={{ color: c.onSurface }}>Still Wave D</strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>D4 Marketplace catalog beyond first-party samples</li>
          <li>D3 Skins / cosmetics</li>
          <li>Script API pack compatibility matrix per BDS build</li>
        </ul>
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
  fontFamily: THEME.fonts.mono,
  fontSize: 13
};

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: c.onSurface,
  border: `1px solid ${c.outline}`,
  borderRadius: THEME.radius.md,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: THEME.fonts.mono,
  fontSize: 13,
  textDecoration: 'none',
  display: 'inline-block'
};
