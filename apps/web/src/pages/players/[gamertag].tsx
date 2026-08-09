import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../../lib/api-client';

const c = THEME.colors;

interface ModerationAction {
  id: string;
  gamertag: string;
  actionType: string;
  reason: string;
  issuerName?: string;
  active: boolean;
  createdAt: string;
}

interface Tracked {
  gamertag: string;
  xuid: string;
  joinCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

const ACTIONS = ['WARN', 'NOTE', 'KICK', 'BAN'] as const;

export default function PlayerProfile() {
  const router = useRouter();
  const gamertag = typeof router.query.gamertag === 'string' ? router.query.gamertag : '';
  const [history, setHistory] = useState<ModerationAction[]>([]);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const [action, setAction] = useState<string>('WARN');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notify = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 4000);
  };

  const load = useCallback(async () => {
    if (!gamertag) return;
    try {
      const res = await apiFetch<{ history: ModerationAction[]; tracked: Tracked | null }>(`/moderation/players/${encodeURIComponent(gamertag)}/history`);
      setHistory(res.history);
      setTracked(res.tracked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load player');
    }
  }, [gamertag]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureAuthenticated().catch(() => '');
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      notify('A reason is required.');
      return;
    }
    try {
      await apiFetch('/moderation', {
        method: 'POST',
        body: JSON.stringify({ gamertag, actionType: action, reason, playerXuid: tracked?.xuid })
      });
      notify(`Recorded ${action} for ${gamertag}.`);
      setReason('');
      load();
    } catch (e) {
      notify(`Failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  };

  const restrictions = history.filter((h) => h.active && (h.actionType === 'BAN' || h.actionType === 'MUTE'));
  const isBanAction = action === 'BAN' || action === 'KICK';

  return (
    <AppShell active="players">
      {notice && <div style={{ background: c.primaryContainer, color: c.onPrimary, border: `2px solid ${c.primary}`, borderRadius: THEME.radius.md, padding: '10px 14px', fontFamily: THEME.fonts.mono, fontSize: 13 }}>✓ {notice}</div>}
      {error && <div style={{ color: c.error }}>{error}</div>}

      <Link href="/players" style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 12, textDecoration: 'none' }}>← Players</Link>

      {/* Header */}
      <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: THEME.space.md, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: THEME.radius.md, background: c.surfaceContainerHighest, display: 'grid', placeItems: 'center', fontSize: 28 }}>🧊</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: THEME.fonts.heading, fontSize: 28, fontWeight: 700, margin: 0 }}>{gamertag}</h1>
            <span style={{ fontFamily: THEME.fonts.mono, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: THEME.radius.sm, background: tracked ? c.primaryContainer : c.surfaceContainerHigh, color: tracked ? c.onPrimary : c.onSurfaceVariant, border: `2px solid ${tracked ? c.primary : c.outline}` }}>
              {tracked ? 'TRACKED' : 'NO IDENTITY'}
            </span>
          </div>
          <div style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant, marginTop: 4 }}>
            XUID: {tracked?.xuid || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: THEME.space.md }}>
        {/* Stats */}
        <Panel title="📊 Player Stats">
          <Stat label="First Seen" value={tracked ? new Date(tracked.firstSeenAt).toLocaleString() : '—'} />
          <Stat label="Last Seen" value={tracked ? new Date(tracked.lastSeenAt).toLocaleString() : '—'} />
          <Stat label="Sessions" value={tracked ? String(tracked.joinCount) : '0'} accent={c.tertiary} />
          <Stat label="Infractions" value={String(history.length)} accent={history.length ? c.warning : c.onSurface} />
        </Panel>

        {/* Moderation */}
        <Panel title="⚔ Moderation">
          {restrictions.length === 0 ? (
            <div style={{ borderLeft: `4px solid ${c.primary}`, background: c.surfaceContainer, padding: '12px 14px', borderRadius: THEME.radius.sm, marginBottom: 12 }}>
              <div style={{ fontFamily: THEME.fonts.heading, fontWeight: 600 }}>No active restrictions</div>
              <div style={{ color: c.onSurfaceVariant, fontSize: 13 }}>Player is in good standing.</div>
            </div>
          ) : (
            <div style={{ borderLeft: `4px solid ${c.error}`, background: c.errorContainer, padding: '12px 14px', borderRadius: THEME.radius.sm, marginBottom: 12, color: c.error }}>
              <div style={{ fontFamily: THEME.fonts.heading, fontWeight: 600 }}>{restrictions.length} active restriction(s)</div>
              <div style={{ fontSize: 13 }}>{restrictions.map((r) => r.actionType).join(', ')}</div>
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  style={{
                    padding: '12px 8px',
                    borderRadius: THEME.radius.md,
                    cursor: 'pointer',
                    fontFamily: THEME.fonts.mono,
                    fontWeight: 700,
                    fontSize: 12,
                    background: action === a ? (a === 'BAN' ? c.errorContainer : c.primaryContainer) : c.surfaceContainerHigh,
                    color: action === a ? (a === 'BAN' ? c.error : c.onPrimary) : c.onSurfaceVariant,
                    border: `2px solid ${action === a ? (a === 'BAN' ? c.error : c.primary) : c.outline}`
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / evidence…" style={{ background: c.surfaceContainerLowest, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '10px 12px', fontFamily: THEME.fonts.mono, fontSize: 13, outline: 'none' }} />
            <button type="submit" style={{ background: isBanAction ? c.errorContainer : c.primary, color: isBanAction ? c.error : c.onPrimary, border: `2px solid ${isBanAction ? c.error : c.primary}`, borderRadius: THEME.radius.md, padding: '10px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Record {action}
            </button>
          </form>
        </Panel>
      </div>

      {/* Activity timeline */}
      <Panel title="🕑 Recent Activity">
        {history.length === 0 && <div style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 12 }}>No moderation activity recorded.</div>}
        {history.slice().reverse().map((h) => {
          const severe = h.actionType === 'BAN' || h.actionType === 'KICK';
          return (
            <div key={h.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${c.outline}` }}>
              <div style={{ width: 6, borderRadius: 3, background: severe ? c.error : c.warning }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: THEME.fonts.mono, fontWeight: 700, color: severe ? c.error : c.onSurface }}>{h.actionType}</div>
                <div style={{ color: c.onSurfaceVariant, fontSize: 13 }}>“{h.reason}” — {h.issuerName || 'staff'}</div>
              </div>
              <div style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 11 }}>{new Date(h.createdAt).toLocaleString()}</div>
            </div>
          );
        })}
        {tracked && (
          <div style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
            <div style={{ width: 6, borderRadius: 3, background: c.primary }} />
            <div style={{ flex: 1 }}><div style={{ fontFamily: THEME.fonts.mono, fontWeight: 700, color: c.logJoin }}>FIRST SEEN</div><div style={{ color: c.onSurfaceVariant, fontSize: 13 }}>Joined a realm</div></div>
            <div style={{ color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, fontSize: 11 }}>{new Date(tracked.firstSeenAt).toLocaleString()}</div>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
      <div style={{ background: c.dirt, padding: '10px 14px', fontFamily: THEME.fonts.heading, fontWeight: 600, fontSize: 15 }}>{title}</div>
      <div style={{ padding: THEME.space.sm }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: c.surfaceContainer, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.sm, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, fontWeight: 700, color: c.onSurfaceVariant }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: THEME.fonts.heading, fontSize: 18, fontWeight: 700, color: accent || c.onSurface, marginTop: 2 }}>{value}</div>
    </div>
  );
}
