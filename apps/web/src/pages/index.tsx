import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../lib/api-client';
import { DashboardBackup, DashboardModeration, DashboardServer, toPowerAction } from '../lib/types';

const c = THEME.colors;

export default function Dashboard() {
  const [notification, setNotification] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [backups, setBackups] = useState<DashboardBackup[]>([]);
  const [moderations, setModerations] = useState<DashboardModeration[]>([]);

  const [isRegisterOpen, setRegisterOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  const [regName, setRegName] = useState('');
  const [regGameMode, setRegGameMode] = useState('survival');
  const [regDifficulty, setRegDifficulty] = useState('hard');

  const [playerQuery, setPlayerQuery] = useState('');
  const [modGamertag, setModGamertag] = useState('');
  const [modReason, setModReason] = useState('');
  const [modAction, setModAction] = useState('WARN');

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, b, m] = await Promise.all([
        apiFetch<{ servers: DashboardServer[] }>('/servers'),
        apiFetch<{ backups: DashboardBackup[] }>('/backups'),
        apiFetch<{ moderationActions: DashboardModeration[] }>('/moderation')
      ]);
      setServers(s.servers);
      setBackups(b.backups);
      setModerations(m.moderationActions);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const online = servers.filter((s) => s.status === 'ONLINE').length;
    const finished = backups.filter((b) => b.status === 'COMPLETED' || b.status === 'FAILED').length;
    const completed = backups.filter((b) => b.status === 'COMPLETED').length;
    const successRate = finished === 0 ? 100 : Math.round((completed / finished) * 100);
    return { online, total: servers.length, backupCount: backups.length, successRate, modCount: moderations.length };
  }, [servers, backups, moderations]);

  const registerServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName) return;
    try {
      const data = await apiFetch<{ server: DashboardServer }>('/servers', {
        method: 'POST',
        body: JSON.stringify({ name: regName, gameMode: regGameMode, difficulty: regDifficulty })
      });
      notify(`Server "${data.server.name}" registered.`);
      setRegisterOpen(false);
      setRegName('');
      fetchData();
    } catch (err) {
      notify(`Register failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const serverControl = async (id: string, action: 'start' | 'stop' | 'restart') => {
    const target = servers.find((s) => s.id === id);
    const run = async () => {
      try {
        const data = await apiFetch<{ success: boolean; server: DashboardServer; action: string }>(`/servers/${id}/power`, {
          method: 'POST',
          body: JSON.stringify({ action: toPowerAction(action) })
        });
        notify(data.success ? `${data.server.name}: ${data.action} accepted.` : 'Power action failed — agent may be offline.');
        fetchData();
      } catch (err) {
        notify(`Control failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    };
    if (action === 'stop') {
      setConfirm({
        title: `Stop ${target?.name || id}?`,
        desc: 'Active players will be disconnected immediately.',
        onConfirm: () => {
          setConfirm(null);
          run();
        }
      });
    } else {
      run();
    }
  };

  const triggerBackup = async (serverId: string) => {
    try {
      const data = await apiFetch<{ backup: DashboardBackup }>('/backups', {
        method: 'POST',
        body: JSON.stringify({ serverId, isManual: true })
      });
      notify(`Backup ${data.backup.status === 'PENDING' ? 'queued' : 'created'} (${data.backup.filename}).`);
      fetchData();
    } catch (err) {
      notify(`Backup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const restoreBackup = async (backupId: string, filename: string) => {
    try {
      await apiFetch(`/backups/${backupId}/restore`, { method: 'POST' });
      notify(`Restored ${filename}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      notify(msg.includes('UNAVAILABLE') || msg.includes('NOT_IMPLEMENTED') ? `Restore unavailable for ${filename} (agent/R2 required).` : `Restore failed: ${msg}`);
    }
  };

  const addModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modGamertag || !modReason) return;
    const run = async () => {
      try {
        await apiFetch('/moderation', {
          method: 'POST',
          body: JSON.stringify({ gamertag: modGamertag, actionType: modAction, reason: modReason })
        });
        notify(`Recorded ${modAction} for "${modGamertag}".`);
        setModGamertag('');
        setModReason('');
        fetchData();
      } catch (err) {
        notify(`Moderation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    };
    if (modAction === 'BAN') {
      setConfirm({
        title: `Ban ${modGamertag}?`,
        desc: `Issue a permanent BAN to ${modGamertag}. Reason: "${modReason}".`,
        onConfirm: () => {
          setConfirm(null);
          run();
        }
      });
    } else {
      run();
    }
  };

  const refreshPill = (
    <button onClick={fetchData} style={{ background: c.surfaceContainer, color: c.onSurfaceVariant, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '6px 12px', fontFamily: THEME.fonts.mono, fontSize: 12, cursor: 'pointer' }}>
      {loading ? '⟳ Syncing…' : '⟳ Sync'}
    </button>
  );

  return (
    <AppShell active="dashboard" topRight={refreshPill}>
      {notification && (
        <div style={{ background: c.primaryContainer, color: c.onPrimary, border: `2px solid ${c.primary}`, borderRadius: THEME.radius.md, padding: '10px 14px', fontFamily: THEME.fonts.mono, fontSize: 13 }}>
          ✓ {notification}
        </div>
      )}

      <div>
        <h1 style={{ fontFamily: THEME.fonts.heading, fontSize: 32, fontWeight: 700, margin: 0 }}>
          Operations Overview
        </h1>
        <p style={{ color: c.onSurfaceVariant, margin: '4px 0 0' }}>
          {stats.online} of {stats.total} realms online · {stats.successRate}% backup success
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: THEME.space.sm }}>
        <StatCard label="SERVERS" value={`${stats.total}`} sub={`${stats.online} online`} accent={c.primary} />
        <StatCard label="BACKUPS" value={`${stats.successRate}%`} sub={`${stats.backupCount} snapshots`} accent={c.tertiary} />
        <StatCard label="MODERATION" value={`${stats.modCount}`} sub="active records" accent={c.warning} />
        <StatCard label="CONSOLE" value="LIVE" sub="open live terminal →" accent={c.primary} href="/console" />
      </div>

      {/* Active Realms */}
      <Panel title="🖧 Active Realms" action={<button onClick={() => setRegisterOpen(true)} style={primaryBtn()}>+ Register Server</button>}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: THEME.fonts.mono, fontSize: 13 }}>
          <thead>
            <tr style={{ color: c.onSurfaceVariant, textAlign: 'left', borderBottom: `2px solid ${c.outline}` }}>
              <th style={th}>Realm</th><th style={th}>Status</th><th style={th}>Slots</th><th style={th}>Version</th><th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${c.outline}` }}>
                <td style={td}><Link href={`/servers/${s.id}`} style={{ color: c.primary, fontWeight: 700, textDecoration: 'none' }}>{s.name}</Link><div style={{ color: c.onSurfaceVariant, fontSize: 11 }}>{s.host}:{s.port}</div></td>
                <td style={td}><StatusDot status={s.status} /></td>
                <td style={td}>{s.maxPlayers}</td>
                <td style={td}>{s.version}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => serverControl(s.id, s.status === 'ONLINE' ? 'stop' : 'start')} style={s.status === 'ONLINE' ? ghostBtn(c.error) : ghostBtn(c.primary)}>
                      {s.status === 'ONLINE' ? '■ Stop' : '▶ Start'}
                    </button>
                    <button onClick={() => serverControl(s.id, 'restart')} style={ghostBtn(c.tertiary)}>⟳</button>
                    <button onClick={() => triggerBackup(s.id)} style={ghostBtn(c.secondary)}>⛃ Backup</button>
                  </div>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr><td style={{ ...td, color: c.onSurfaceVariant }} colSpan={5}>No realms yet — register one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>

      {/* Backups + Moderation two-up */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: THEME.space.md }}>
        <Panel title="⛃ Safety Snapshots">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: THEME.fonts.mono, fontSize: 12 }}>
            <thead>
              <tr style={{ color: c.onSurfaceVariant, textAlign: 'left', borderBottom: `2px solid ${c.outline}` }}>
                <th style={th}>Archive</th><th style={th}>Status</th><th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${c.outline}` }}>
                  <td style={{ ...td, color: c.tertiary }}>{b.filename}</td>
                  <td style={td}><StatusDot status={b.status} /></td>
                  <td style={td}><button onClick={() => restoreBackup(b.id, b.filename)} style={ghostBtn(c.secondary)}>Restore</button></td>
                </tr>
              ))}
              {backups.length === 0 && <tr><td style={{ ...td, color: c.onSurfaceVariant }} colSpan={3}>No snapshots yet.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel title="⚔ Player Moderation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="Filter gamertags…" style={inputStyle()} />
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              {moderations.filter((m) => m.gamertag.toLowerCase().includes(playerQuery.toLowerCase())).map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${c.outline}`, fontFamily: THEME.fonts.mono, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>{m.gamertag}</span>
                  <StatusDot status={m.actionType} />
                  <span style={{ color: c.onSurfaceVariant, flex: 1, textAlign: 'right' }}>{m.reason}</span>
                </div>
              ))}
              {moderations.length === 0 && <div style={{ color: c.onSurfaceVariant, fontSize: 12, padding: '6px 0' }}>No moderation records.</div>}
            </div>
            <form onSubmit={addModeration} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `2px solid ${c.outline}`, paddingTop: 10 }}>
              <input required value={modGamertag} onChange={(e) => setModGamertag(e.target.value)} placeholder="Gamertag" style={inputStyle()} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={modAction} onChange={(e) => setModAction(e.target.value)} style={{ ...inputStyle(), flex: '0 0 120px' }}>
                  {['WARN', 'MUTE', 'KICK', 'BAN', 'NOTE'].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input required value={modReason} onChange={(e) => setModReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle(), flex: 1 }} />
              </div>
              <button type="submit" style={primaryBtn()}>Record Action</button>
            </form>
          </div>
        </Panel>
      </div>

      {/* Register modal */}
      {isRegisterOpen && (
        <ModalShell title="Register New Realm" onClose={() => setRegisterOpen(false)}>
          <form onSubmit={registerServer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input required value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Realm display name" style={inputStyle()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={regGameMode} onChange={(e) => setRegGameMode(e.target.value)} style={{ ...inputStyle(), flex: 1 }}>
                {['survival', 'creative', 'adventure'].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={regDifficulty} onChange={(e) => setRegDifficulty(e.target.value)} style={{ ...inputStyle(), flex: 1 }}>
                {['peaceful', 'easy', 'normal', 'hard'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setRegisterOpen(false)} style={ghostBtn(c.onSurfaceVariant)}>Cancel</button>
              <button type="submit" style={primaryBtn()}>Create Realm</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Confirm modal */}
      {confirm && (
        <ModalShell title={confirm.title} onClose={() => setConfirm(null)} danger>
          <p style={{ color: c.onSurfaceVariant, margin: 0 }}>{confirm.desc}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={() => setConfirm(null)} style={ghostBtn(c.onSurfaceVariant)}>Cancel</button>
            <button onClick={confirm.onConfirm} style={{ ...primaryBtn(), background: c.errorContainer, color: c.error, border: `2px solid ${c.error}` }}>Confirm</button>
          </div>
        </ModalShell>
      )}
    </AppShell>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '10px' };

function StatCard({ label, value, sub, accent, href }: { label: string; value: string; sub: string; accent: string; href?: string }) {
  const body = (
    <div style={{ background: c.surfaceContainer, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: THEME.space.sm, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: THEME.fonts.mono, fontSize: 11, fontWeight: 700, color: c.onSurfaceVariant, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontFamily: THEME.fonts.heading, fontSize: 30, fontWeight: 700, color: accent }}>{value}</span>
      <span style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>{sub}</span>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: c.dirt, padding: '10px 14px' }}>
        <span style={{ fontFamily: THEME.fonts.heading, fontWeight: 600, fontSize: 15 }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: THEME.space.sm }}>{children}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = status.toUpperCase();
  const good = ['ONLINE', 'COMPLETED', 'SUCCESS'].includes(s);
  const bad = ['OFFLINE', 'FAILED', 'BAN', 'KICK', 'ERROR'].includes(s);
  const color = good ? c.primary : bad ? c.error : c.warning;
  return (
    <span style={{ fontFamily: THEME.fonts.mono, fontSize: 11, fontWeight: 700, color }}>
      ● {status}
    </span>
  );
}

function ModalShell({ title, danger, onClose, children }: { title: string; danger?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.surfaceContainer, border: `4px solid ${danger ? c.error : c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md, width: 460, maxWidth: '90vw' }}>
        <h3 style={{ fontFamily: THEME.fonts.heading, margin: '0 0 12px', fontSize: 18, color: danger ? c.error : c.onSurface }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return { background: c.surfaceContainerLowest, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '8px 10px', fontFamily: THEME.fonts.mono, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
}

function primaryBtn(): React.CSSProperties {
  return { background: c.primary, color: c.onPrimary, border: 'none', borderRadius: THEME.radius.md, padding: '8px 14px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}

function ghostBtn(accent: string): React.CSSProperties {
  return { background: 'transparent', color: accent, border: `2px solid ${accent}`, borderRadius: THEME.radius.sm, padding: '6px 10px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 12, cursor: 'pointer' };
}
