import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../lib/api-client';
import {
  DashboardNode,
  DashboardServer,
  DashboardSessionUser,
  SystemStatus
} from '../lib/types';

const c = THEME.colors;

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<DashboardSessionUser | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [nodes, setNodes] = useState<DashboardNode[]>([]);
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, statusRes, nodesRes, serversRes] = await Promise.all([
        apiFetch<{ user: DashboardSessionUser }>('/auth/me'),
        apiFetch<SystemStatus>('/system/status'),
        apiFetch<{ nodes: DashboardNode[] }>('/nodes'),
        apiFetch<{ servers: DashboardServer[] }>('/servers')
      ]);
      setMe(meRes.user);
      setStatus(statusRes);
      setNodes(nodesRes.nodes);
      setServers(serversRes.servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveRealm = async (server: DashboardServer, patch: Partial<DashboardServer>) => {
    setSavingId(server.id);
    setNote(null);
    try {
      await apiFetch(`/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setNote(`Saved ${server.name}.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppShell active="settings">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28 }}>Settings</h1>
          <p style={{ margin: '6px 0 0', color: c.onSurfaceVariant }}>
            Control-plane account, agents, realm config, and integration readiness.
          </p>
        </div>
        <button type="button" onClick={() => void load()} style={btnSecondary}>
          Refresh
        </button>
      </header>

      {note ? <Banner>{note}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <p style={{ color: c.onSurfaceVariant }}>Loading…</p> : null}

      {!loading && me && status ? (
        <div style={{ display: 'grid', gap: THEME.space.md }}>
          <Section title="Account">
            <KV label="Username" value={me.username} />
            <KV label="Email" value={me.email} />
            <KV label="Role" value={me.role} />
          </Section>

          <Section title="Control plane">
            <KV label="Environment" value={status.nodeEnv} />
            <KV label="Database adapter" value={status.dbAdapter} />
            <KV label="CORS origin" value={status.corsOrigin} />
            <KV label="API status" value={status.status} />
          </Section>

          <Section title="Integrations">
            <p style={{ margin: 0, color: c.onSurfaceVariant, fontSize: 13 }}>
              Live credentials are env-driven. Missing keys use honest stubs (no fake success).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              <StatusPill label="Cloudflare R2" ok={status.integrations.r2} />
              <StatusPill label="Discord webhook" ok={status.integrations.discordWebhook} />
              <StatusPill label="Discord slash" ok={status.integrations.discordSlash} />
              <StatusPill label="Cloudflare DNS" ok={status.integrations.cloudflareDns} />
              <StatusPill label="Xbox / OpenXBL" ok={status.integrations.xbox} />
            </div>
          </Section>

          <Section title="Agent nodes">
            {nodes.length === 0 ? (
              <p style={{ margin: 0, color: c.onSurfaceVariant }}>No agent nodes registered.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Name</th>
                    <th style={th}>Status</th>
                    <th style={th}>Tunnel</th>
                    <th style={th}>Version</th>
                    <th style={th}>Token</th>
                    <th style={th}>Last heartbeat</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n) => {
                    const tunnelUp = Boolean(status?.agents?.connectedNodeIds?.includes(n.id));
                    return (
                      <tr key={n.id}>
                        <td style={td}>{n.name}</td>
                        <td style={td}>{n.status}</td>
                        <td style={{ ...td, color: tunnelUp ? c.primary : c.warning }}>
                          {tunnelUp ? 'connected' : 'offline'}
                        </td>
                        <td style={td}>{n.version}</td>
                        <td style={td}>{n.hasToken ? 'set' : 'missing'}</td>
                        <td style={td}>{n.lastHeartbeat ? new Date(n.lastHeartbeat).toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Realm configuration">
            {servers.length === 0 ? (
              <p style={{ margin: 0, color: c.onSurfaceVariant }}>
                No realms yet. <Link href="/setup">Run setup</Link> or register one on the dashboard.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {servers.map((s) => (
                  <RealmEditor
                    key={s.id}
                    server={s}
                    busy={savingId === s.id}
                    onSave={(patch) => void saveRealm(s, patch)}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      ) : null}
    </AppShell>
  );
}

function RealmEditor({
  server,
  busy,
  onSave
}: {
  server: DashboardServer;
  busy: boolean;
  onSave: (patch: Partial<DashboardServer>) => void;
}) {
  const [name, setName] = useState(server.name);
  const [gameMode, setGameMode] = useState(server.gameMode);
  const [difficulty, setDifficulty] = useState(server.difficulty);
  const [maxPlayers, setMaxPlayers] = useState(String(server.maxPlayers));
  const [serverPath, setServerPath] = useState(server.serverPath || '');

  useEffect(() => {
    setName(server.name);
    setGameMode(server.gameMode);
    setDifficulty(server.difficulty);
    setMaxPlayers(String(server.maxPlayers));
    setServerPath(server.serverPath || '');
  }, [server]);

  return (
    <div style={{ border: `1px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: 14, background: c.surface }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <strong style={{ fontFamily: THEME.fonts.heading }}>{server.name}</strong>
        <Link href={`/servers/${server.id}`} style={{ color: c.tertiary, fontSize: 13 }}>
          Ops Room →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Game mode" value={gameMode} onChange={setGameMode} />
        <Field label="Difficulty" value={difficulty} onChange={setDifficulty} />
        <Field label="Max players" value={maxPlayers} onChange={setMaxPlayers} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Server path" value={serverPath} onChange={setServerPath} />
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono }}>
        {server.host}:{server.port} · {server.version} · agent {server.agentId || '—'}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            name: name.trim(),
            gameMode: gameMode.trim(),
            difficulty: difficulty.trim(),
            maxPlayers: Math.max(1, Number(maxPlayers) || server.maxPlayers),
            serverPath: serverPath.trim() || undefined
          })
        }
        style={{ ...btnPrimary, marginTop: 12, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Saving…' : 'Save realm'}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: c.surfaceContainer,
        border: `1px solid ${c.outline}`,
        borderRadius: THEME.radius.lg,
        padding: THEME.space.md,
        display: 'grid',
        gap: 12
      }}
    >
      <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
      <span style={{ width: 160, color: c.onSurfaceVariant }}>{label}</span>
      <span style={{ fontFamily: THEME.fonts.mono }}>{value}</span>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${c.outline}`,
        borderRadius: THEME.radius.md,
        padding: '10px 12px',
        background: c.surface,
        fontSize: 13
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ color: ok ? c.primary : c.warning, fontFamily: THEME.fonts.mono, marginTop: 4 }}>
        {ok ? 'configured' : 'stub / unset'}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 12, color: c.onSurfaceVariant }}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: c.surfaceContainerLowest,
          color: c.onSurface,
          border: `1px solid ${c.outline}`,
          borderRadius: THEME.radius.md,
          padding: '8px 10px',
          fontSize: 14
        }}
      />
    </label>
  );
}

function Banner({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: THEME.radius.md,
        background: tone === 'error' ? c.errorContainer : c.surfaceContainerHigh,
        color: tone === 'error' ? c.error : c.onSurface,
        fontSize: 13
      }}
    >
      {children}
    </div>
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
  cursor: 'pointer'
};

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: `1px solid ${c.outline}`,
  color: c.onSurfaceVariant,
  fontWeight: 600
};
const td: React.CSSProperties = {
  padding: '8px 6px',
  borderBottom: `1px solid ${c.outline}`,
  fontFamily: THEME.fonts.mono
};
