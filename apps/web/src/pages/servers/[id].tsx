import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../../lib/api-client';
import { openServerStream } from '../../lib/ws-client';
import { DashboardServer } from '../../lib/types';

const c = THEME.colors;

interface Metrics {
  cpuPercent: number;
  memoryMb: number;
  totalMemoryMb?: number;
  uptimeSeconds: number;
  activePlayers: number;
}

interface TrackedPlayer {
  id: string;
  gamertag: string;
  xuid: string;
  serverId?: string;
  joinCount: number;
  lastSeenAt: string;
}

interface VersionCheck {
  serverId: string;
  pinnedVersion: string;
  latestVersion: string | null;
  isLatest: boolean;
  isSupported: boolean;
  mismatch: boolean;
  warning?: string;
}

interface CatalogVersion {
  id: string;
  version: string;
  isLatest: boolean;
  isSupported: boolean;
}

function fmtUptime(sec: number): string {
  if (!sec) return '0m';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d ? d + 'd ' : ''}${h ? h + 'h ' : ''}${m}m`;
}

export default function ServerOpsRoom() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [token, setToken] = useState('');
  const [server, setServer] = useState<DashboardServer | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [players, setPlayers] = useState<TrackedPlayer[]>([]);
  const [logTail, setLogTail] = useState<string[]>([]);
  const [versionCheck, setVersionCheck] = useState<VersionCheck | null>(null);
  const [catalog, setCatalog] = useState<CatalogVersion[]>([]);
  const [pinVersion, setPinVersion] = useState('');
  const [pinning, setPinning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  const notify = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 4000);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, st, pl, ver, cat] = await Promise.all([
        apiFetch<{ server: DashboardServer }>(`/servers/${id}`),
        apiFetch<{ metrics: Metrics }>(`/servers/${id}/status`),
        apiFetch<{ tracked: TrackedPlayer[] }>(`/moderation/players/search?q=`),
        apiFetch<{ check: VersionCheck }>(`/versions/servers/${id}/check`),
        apiFetch<{ versions: CatalogVersion[]; latest: CatalogVersion | null }>(`/versions`)
      ]);
      setServer(s.server);
      setMetrics(st.metrics);
      setPlayers(pl.tracked.filter((p) => p.serverId === id));
      setVersionCheck(ver.check);
      setCatalog(cat.versions);
      setPinVersion(cat.latest?.version || s.server.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load server');
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await ensureAuthenticated().catch(() => '');
      if (cancelled) return;
      setToken(t);
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Mini live log tail.
  useEffect(() => {
    if (!token || !id) return;
    const dispose = openServerStream(token, id, ['LOGS'], {
      onLog: (line) => setLogTail((prev) => [...prev, line].slice(-8))
    });
    return dispose;
  }, [token, id]);

  useEffect(() => {
    if (tailRef.current) tailRef.current.scrollTop = tailRef.current.scrollHeight;
  }, [logTail]);

  const power = async (action: 'START' | 'STOP' | 'RESTART') => {
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>(`/servers/${id}/power`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      notify(res.success ? `${action} accepted.` : res.message || `${action} not executed (agent offline).`);
      load();
    } catch (e) {
      notify(`${action} failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  };

  const backup = async () => {
    try {
      const res = await apiFetch<{ backup: { filename: string; status: string } }>(`/backups`, {
        method: 'POST',
        body: JSON.stringify({ serverId: id, isManual: true })
      });
      notify(`Backup ${res.backup.status.toLowerCase()} (${res.backup.filename}).`);
    } catch (e) {
      notify(`Backup: ${e instanceof Error ? e.message : 'error'}`);
    }
  };

  const pinBdsVersion = async () => {
    if (!pinVersion) return;
    setPinning(true);
    try {
      const res = await apiFetch<{
        result: { version: string; previousVersion: string };
        check: VersionCheck;
        backup?: { filename: string };
      }>(`/versions/servers/${id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ version: pinVersion, backupBefore: true })
      });
      setVersionCheck(res.check);
      notify(
        `Pinned BDS ${res.result.version}` +
          (res.backup ? ` (pre-update backup ${res.backup.filename})` : '') +
          '.'
      );
      await load();
    } catch (e) {
      notify(`Pin failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setPinning(false);
    }
  };

  const memPct = metrics && metrics.totalMemoryMb ? Math.round((metrics.memoryMb / metrics.totalMemoryMb) * 100) : 0;

  return (
    <AppShell active="dashboard" topRight={<Link href="/console" style={{ color: c.tertiary, fontFamily: THEME.fonts.mono, fontSize: 12, textDecoration: 'none' }}>Live Console →</Link>}>
      {notice && <div style={{ background: c.primaryContainer, color: c.onPrimary, border: `2px solid ${c.primary}`, borderRadius: THEME.radius.md, padding: '10px 14px', fontFamily: THEME.fonts.mono, fontSize: 13 }}>✓ {notice}</div>}
      {error && <div style={{ color: c.error }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/" style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 12, textDecoration: 'none' }}>← Realms</Link>
          <h1 style={{ fontFamily: THEME.fonts.heading, fontSize: 30, fontWeight: 700, margin: '4px 0 0' }}>{server?.name || id}</h1>
          <div style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 12 }}>
            {server ? <>● {server.status} · v{server.version} · {server.host}:{server.port}</> : 'Loading…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => power('START')} style={ghost(c.primary)}>▶ Start</button>
          <button onClick={() => power('RESTART')} style={ghost(c.tertiary)}>⟳ Restart</button>
          <button onClick={() => power('STOP')} style={ghost(c.error)}>■ Stop</button>
        </div>
      </div>

      {/* Metric gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: THEME.space.sm }}>
        <Gauge label="UPTIME" value={fmtUptime(metrics?.uptimeSeconds || 0)} pct={metrics?.uptimeSeconds ? 100 : 0} color={c.primary} />
        <Gauge label="CPU LOAD" value={`${metrics?.cpuPercent ?? 0}%`} pct={metrics?.cpuPercent ?? 0} color={c.tertiary} />
        <Gauge label="MEMORY" value={`${((metrics?.memoryMb ?? 0) / 1024).toFixed(1)} GB`} pct={memPct} color={c.primary} />
        <Gauge label="PLAYERS" value={`${metrics?.activePlayers ?? 0}/${server?.maxPlayers ?? 0}`} pct={server?.maxPlayers ? Math.round(((metrics?.activePlayers ?? 0) / server.maxPlayers) * 100) : 0} color={c.tertiary} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: THEME.space.md }}>
        {/* Active players */}
        <Panel title={`👥 Tracked Players (${players.length})`}>
          {players.length === 0 && <div style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 12 }}>No tracked players for this realm yet.</div>}
          {players.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${c.outline}` }}>
              <div>
                <Link href={`/players/${encodeURIComponent(p.gamertag)}`} style={{ color: c.onSurface, fontWeight: 700, fontFamily: THEME.fonts.mono, fontSize: 13, textDecoration: 'none' }}>{p.gamertag}</Link>
                <div style={{ color: c.onSurfaceVariant, fontSize: 11, fontFamily: THEME.fonts.mono }}>xuid {p.xuid} · {p.joinCount} joins</div>
              </div>
              <Link href={`/players/${encodeURIComponent(p.gamertag)}`} style={ghostLink(c.secondary)}>Profile →</Link>
            </div>
          ))}
        </Panel>

        {/* Live console preview + quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: THEME.space.md }}>
          <Panel title="▧ Live Console" action={<Link href="/console" style={ghostLink(c.tertiary)}>View Full →</Link>}>
            <div ref={tailRef} style={{ background: c.surfaceContainerLowest, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: 10, height: 140, overflowY: 'auto', fontFamily: THEME.fonts.mono, fontSize: 11, lineHeight: '18px' }}>
              {logTail.length === 0 && <span style={{ color: c.onSurfaceVariant }}>Waiting for live log lines…</span>}
              {logTail.map((l, i) => <div key={i} style={{ color: c.logInfo }}>{l}</div>)}
            </div>
          </Panel>
          <Panel title="⚙ Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={backup} style={quick()}>⛃ Backup</button>
              <Link href="/console" style={{ ...quick(), textAlign: 'center', textDecoration: 'none' }}>▧ Console</Link>
              <button onClick={() => power('RESTART')} style={quick()}>⟳ Restart</button>
              <button onClick={load} style={quick()}>↻ Refresh</button>
            </div>
          </Panel>

          <Panel title="⧉ BDS Version">
            {versionCheck && (
              <div style={{ marginBottom: 12, fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>
                <div>Pinned: <strong style={{ color: c.onSurface }}>{versionCheck.pinnedVersion}</strong>
                  {versionCheck.isLatest ? ' · latest' : versionCheck.latestVersion ? ` · latest ${versionCheck.latestVersion}` : ''}
                </div>
                {versionCheck.warning && (
                  <div style={{ marginTop: 6, color: c.tertiary, borderLeft: `3px solid ${c.tertiary}`, paddingLeft: 8 }}>
                    {versionCheck.warning}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={pinVersion}
                onChange={(e) => setPinVersion(e.target.value)}
                style={{
                  flex: 1,
                  background: c.surfaceContainerLowest,
                  color: c.onSurface,
                  border: `2px solid ${c.outline}`,
                  borderRadius: THEME.radius.md,
                  padding: '8px 10px',
                  fontFamily: THEME.fonts.mono,
                  fontSize: 12
                }}
              >
                {catalog.map((v) => (
                  <option key={v.id} value={v.version}>
                    {v.version}{v.isLatest ? ' (latest)' : ''}{!v.isSupported ? ' (unsupported)' : ''}
                  </option>
                ))}
              </select>
              <button onClick={pinBdsVersion} disabled={pinning || !pinVersion} style={ghost(c.primary)}>
                {pinning ? '…' : 'Pin'}
              </button>
            </div>
            <div style={{ marginTop: 8, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 11 }}>
              Pin takes a safety backup first, then updates the realm version pin.
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Gauge({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  const blocks = 12;
  const filled = Math.max(0, Math.min(blocks, Math.round((pct / 100) * blocks)));
  return (
    <div style={{ background: c.surfaceContainer, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: THEME.space.sm }}>
      <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, fontWeight: 700, color: c.onSurfaceVariant }}>{label}</div>
      <div style={{ fontFamily: THEME.fonts.heading, fontSize: 24, fontWeight: 700, margin: '4px 0 8px' }}>{value}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: i < filled ? color : c.surfaceContainerHighest }} />
        ))}
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: c.dirt, padding: '10px 14px' }}>
        <span style={{ fontFamily: THEME.fonts.heading, fontWeight: 600, fontSize: 15 }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: THEME.space.sm }}>{children}</div>
    </div>
  );
}

function ghost(accent: string): React.CSSProperties {
  return { background: 'transparent', color: accent, border: `2px solid ${accent}`, borderRadius: THEME.radius.md, padding: '8px 14px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}
function ghostLink(accent: string): React.CSSProperties {
  return { color: accent, border: `2px solid ${accent}`, borderRadius: THEME.radius.sm, padding: '4px 8px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 11, textDecoration: 'none' };
}
function quick(): React.CSSProperties {
  return { background: c.surfaceContainerHigh, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '12px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}
