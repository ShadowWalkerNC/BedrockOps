import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../../lib/api-client';

const c = THEME.colors;

interface TrackedPlayer {
  id: string;
  gamertag: string;
  xuid: string;
  serverId?: string;
  joinCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function PlayersList() {
  const [query, setQuery] = useState('');
  const [tracked, setTracked] = useState<TrackedPlayer[]>([]);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    try {
      const res = await apiFetch<{ players: string[]; tracked: TrackedPlayer[] }>(`/moderation/players/search?q=${encodeURIComponent(q)}`);
      setTracked(res.tracked);
      // Gamertags that have moderation records but are not currently tracked.
      const trackedNames = new Set(res.tracked.map((t) => t.gamertag.toLowerCase()));
      setFlagged(res.players.filter((p) => !trackedNames.has(p.toLowerCase())));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load players');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureAuthenticated().catch(() => '');
      if (!cancelled) await search('');
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <AppShell active="players">
      <div>
        <h1 style={{ fontFamily: THEME.fonts.heading, fontSize: 30, fontWeight: 700, margin: 0 }}>Players</h1>
        <p style={{ color: c.onSurfaceVariant, margin: '4px 0 0' }}>Tracked identities and moderation history</p>
      </div>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        placeholder="Search gamertag or XUID…"
        style={{ background: c.surfaceContainerLowest, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '10px 12px', fontFamily: THEME.fonts.mono, fontSize: 13, outline: 'none', maxWidth: 440 }}
      />

      {error && <div style={{ color: c.error }}>{error}</div>}

      <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
        <div style={{ background: c.dirt, padding: '10px 14px', fontFamily: THEME.fonts.heading, fontWeight: 600 }}>👥 Tracked Players ({tracked.length})</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: THEME.fonts.mono, fontSize: 13 }}>
          <thead>
            <tr style={{ color: c.onSurfaceVariant, textAlign: 'left', borderBottom: `2px solid ${c.outline}` }}>
              <th style={th}>Gamertag</th><th style={th}>XUID</th><th style={th}>Joins</th><th style={th}>Last Seen</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {tracked.map((p) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${c.outline}` }}>
                <td style={td}><Link href={`/players/${encodeURIComponent(p.gamertag)}`} style={{ color: c.primary, fontWeight: 700, textDecoration: 'none' }}>{p.gamertag}</Link></td>
                <td style={{ ...td, color: c.onSurfaceVariant }}>{p.xuid}</td>
                <td style={td}>{p.joinCount}</td>
                <td style={{ ...td, color: c.onSurfaceVariant }}>{new Date(p.lastSeenAt).toLocaleString()}</td>
                <td style={td}><Link href={`/players/${encodeURIComponent(p.gamertag)}`} style={ghostLink(c.secondary)}>Profile →</Link></td>
              </tr>
            ))}
            {tracked.length === 0 && <tr><td style={{ ...td, color: c.onSurfaceVariant }} colSpan={5}>No tracked players yet — they appear here after joining a realm.</td></tr>}
          </tbody>
        </table>
      </div>

      {flagged.length > 0 && (
        <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
          <div style={{ background: c.dirt, padding: '10px 14px', fontFamily: THEME.fonts.heading, fontWeight: 600 }}>⚔ Players with moderation records</div>
          <div style={{ padding: THEME.space.sm, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {flagged.map((g) => (
              <Link key={g} href={`/players/${encodeURIComponent(g)}`} style={{ ...ghostLink(c.warning), padding: '6px 10px' }}>{g}</Link>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '10px' };

function ghostLink(accent: string): React.CSSProperties {
  return { color: accent, border: `2px solid ${accent}`, borderRadius: THEME.radius.sm, padding: '4px 8px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 11, textDecoration: 'none' };
}
