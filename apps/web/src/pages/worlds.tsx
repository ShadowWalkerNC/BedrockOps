import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../lib/api-client';
import { DashboardBackup, DashboardServer } from '../lib/types';

const c = THEME.colors;

export default function WorldsPage() {
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [backups, setBackups] = useState<DashboardBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, b] = await Promise.all([
        apiFetch<{ servers: DashboardServer[] }>('/servers'),
        apiFetch<{ backups: DashboardBackup[] }>('/backups')
      ]);
      setServers(s.servers);
      setBackups(b.backups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worlds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const byServer = useMemo(() => {
    const map = new Map<string, DashboardBackup[]>();
    for (const b of backups) {
      const list = map.get(b.serverId) || [];
      list.push(b);
      map.set(b.serverId, list);
    }
    Array.from(map.values()).forEach((list) => {
      list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    });
    return map;
  }, [backups]);

  const triggerBackup = async (serverId: string) => {
    setBusy(serverId);
    setNote(null);
    try {
      const res = await apiFetch<{ success?: boolean; stub?: boolean; message?: string; backup: DashboardBackup }>(
        '/backups',
        {
          method: 'POST',
          body: JSON.stringify({ serverId })
        }
      );
      setNote(
        res.success
          ? `Backup queued: ${res.backup.filename}`
          : res.message || 'Backup did not complete — agent/R2 may be offline (honest stub).'
      );
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async (backup: DashboardBackup) => {
    setBusy(backup.id);
    setNote(null);
    try {
      const res = await apiFetch<{ success?: boolean; stub?: boolean; message?: string }>(`/backups/${backup.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      setNote(
        res.success
          ? `Restore accepted for ${backup.filename}`
          : res.message || 'Restore not executed — agent offline or world path unavailable (honest stub).'
      );
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell active="worlds">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28 }}>Worlds</h1>
          <p style={{ margin: '6px 0 0', color: c.onSurfaceVariant }}>
            Realm world paths and safety snapshots. Multi-world upload/switch is a later add-on (not faked).
          </p>
        </div>
        <button type="button" onClick={() => void load()} style={btnSecondary}>
          Refresh
        </button>
      </header>

      {note ? <Banner>{note}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <p style={{ color: c.onSurfaceVariant }}>Loading…</p> : null}

      {!loading && servers.length === 0 ? (
        <Empty>
          No realms yet. <Link href="/setup">Create one in Setup</Link>.
        </Empty>
      ) : null}

      <div style={{ display: 'grid', gap: THEME.space.md }}>
        {servers.map((server) => {
          const snaps = byServer.get(server.id) || [];
          return (
            <section
              key={server.id}
              style={{
                background: c.surfaceContainer,
                border: `1px solid ${c.outline}`,
                borderRadius: THEME.radius.lg,
                padding: THEME.space.md,
                display: 'grid',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 20 }}>{server.name}</h2>
                  <div style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant, marginTop: 4 }}>
                    {server.status} · {server.version} · {server.serverPath || 'path unset'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/servers/${server.id}`} style={btnSecondary as React.CSSProperties}>
                    Ops Room
                  </Link>
                  <button
                    type="button"
                    disabled={busy === server.id}
                    onClick={() => void triggerBackup(server.id)}
                    style={{ ...btnPrimary, opacity: busy === server.id ? 0.7 : 1 }}
                  >
                    {busy === server.id ? 'Working…' : 'Snapshot world'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  border: `1px dashed ${c.outline}`,
                  borderRadius: THEME.radius.md,
                  padding: 12,
                  fontSize: 13,
                  color: c.onSurfaceVariant
                }}
              >
                Multi-world folder list / upload / <code>level-name</code> switch is a later add-on.
                Until then, backups are the supported world recovery path.
              </div>

              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: c.onSurfaceVariant }}>Safety snapshots</h3>
                {snaps.length === 0 ? (
                  <p style={{ margin: 0, color: c.onSurfaceVariant, fontSize: 13 }}>No snapshots yet.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={th}>File</th>
                        <th style={th}>Status</th>
                        <th style={th}>Created</th>
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {snaps.map((b) => (
                        <tr key={b.id}>
                          <td style={td}>{b.filename}</td>
                          <td style={td}>{b.status}</td>
                          <td style={td}>{new Date(b.createdAt).toLocaleString()}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <button
                              type="button"
                              disabled={busy === b.id || b.status !== 'COMPLETED'}
                              onClick={() =>
                                setConfirm({
                                  title: `Restore ${b.filename}?`,
                                  desc: 'This replaces the live world from the snapshot. Confirm only if you intend to roll back.',
                                  onConfirm: () => {
                                    setConfirm(null);
                                    void restoreBackup(b);
                                  }
                                })
                              }
                              style={{
                                ...btnSecondary,
                                opacity: busy === b.id || b.status !== 'COMPLETED' ? 0.5 : 1,
                                cursor: busy === b.id || b.status !== 'COMPLETED' ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {confirm ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: c.surface,
              border: `1px solid ${c.outline}`,
              borderRadius: THEME.radius.lg,
              padding: THEME.space.md,
              display: 'grid',
              gap: 12
            }}
          >
            <h3 style={{ margin: 0, fontFamily: THEME.fonts.heading }}>{confirm.title}</h3>
            <p style={{ margin: 0, color: c.onSurfaceVariant, fontSize: 14 }}>{confirm.desc}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnSecondary} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={confirm.onConfirm}>
                Confirm restore
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
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
        fontSize: 13,
        marginTop: 8
      }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 20,
        border: `1px dashed ${c.outline}`,
        borderRadius: THEME.radius.lg,
        color: c.onSurfaceVariant
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
  fontFamily: THEME.fonts.heading,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center'
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

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: `1px solid ${c.outline}`,
  color: c.onSurfaceVariant
};
const td: React.CSSProperties = {
  padding: '8px 6px',
  borderBottom: `1px solid ${c.outline}`,
  fontFamily: THEME.fonts.mono
};
