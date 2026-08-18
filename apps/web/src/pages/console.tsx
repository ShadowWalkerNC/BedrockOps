import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../lib/api-client';
import { openServerStream, StreamStatus } from '../lib/ws-client';
import { DashboardServer } from '../lib/types';

type LogCategory = 'info' | 'warning' | 'player' | 'command';

interface LogEntry {
  id: number;
  ts: string;
  text: string;
  category: LogCategory;
}

type FilterKey = 'all' | 'warning' | 'player' | 'command';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'warning', label: 'Warnings' },
  { key: 'player', label: 'Player Activity' },
  { key: 'command', label: 'Commands' }
];

const QUICK_COMMANDS = ['/list', '/status', '/help', '/save-all', '/kick <player>', '/broadcast <msg>', '/stop'];

function classify(line: string): LogCategory {
  const l = line.toLowerCase();
  if (l.includes('warn') || l.includes("can't keep up") || l.includes('error') || l.includes('fail')) return 'warning';
  if (l.includes('joined') || l.includes('connected') || l.includes('disconnected') || l.includes('player') || l.includes('achievement')) return 'player';
  return 'info';
}

const c = THEME.colors;

function categoryColor(category: LogCategory): string {
  switch (category) {
    case 'warning':
      return c.logWarn;
    case 'player':
      return c.logJoin;
    case 'command':
      return c.tertiary;
    default:
      return c.logInfo;
  }
}

function nowClock(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

let logSeq = 0;

export default function LiveConsolePage() {
  const [token, setToken] = useState<string>('');
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [command, setCommand] = useState('');
  const [error, setError] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId);

  const appendLog = useCallback((text: string, category?: LogCategory) => {
    setLogs((prev) => [...prev, { id: ++logSeq, ts: nowClock(), text, category: category ?? classify(text) }].slice(-500));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await ensureAuthenticated();
        if (cancelled) return;
        setToken(t);
        const res = await apiFetch<{ servers: DashboardServer[] }>('/servers');
        if (cancelled) return;
        setServers(res.servers);
        if (res.servers.length > 0) setActiveServerId(res.servers[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to initialize console');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token || !activeServerId) return;
    setLogs([]);
    appendLog(`Connecting to live stream for ${activeServerId}...`, 'info');
    const dispose = openServerStream(token, activeServerId, ['LOGS', 'METRICS'], {
      onLog: (line) => appendLog(line),
      onStatus: (s) => setStatus(s)
    });
    return dispose;
  }, [token, activeServerId, appendLog]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const visibleLogs = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.category === filter)),
    [logs, filter]
  );

  const sendCommand = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd || !activeServerId) return;
      appendLog(`> ${cmd}`, 'command');
      setCommand('');
      try {
        const res = await apiFetch<{ success: boolean; output: string }>(`/servers/${activeServerId}/rcon`, {
          method: 'POST',
          body: JSON.stringify({ command: cmd.replace(/^\//, '') })
        });
        appendLog(res.output || '(no output)', 'command');
      } catch (e) {
        appendLog(`RCON failed: ${e instanceof Error ? e.message : 'unknown error'}`, 'warning');
      }
    },
    [activeServerId, appendLog]
  );

  const power = useCallback(
    async (action: 'START' | 'STOP' | 'RESTART') => {
      if (!activeServerId) return;
      appendLog(`> power ${action}`, 'command');
      try {
        const res = await apiFetch<{ success: boolean; message?: string }>(`/servers/${activeServerId}/power`, {
          method: 'POST',
          body: JSON.stringify({ action })
        });
        if (!res.success) appendLog(res.message || `Power ${action} not executed (agent offline).`, 'warning');
      } catch (e) {
        appendLog(`Power ${action} failed: ${e instanceof Error ? e.message : 'unknown error'}`, 'warning');
      }
    },
    [activeServerId, appendLog]
  );

  const connected = status === 'open';

  const statusPill = (
    <span
      style={{
        fontFamily: THEME.fonts.mono,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 9999,
        background: connected ? c.primaryContainer : c.errorContainer,
        color: connected ? c.onPrimary : c.error,
        border: `2px solid ${connected ? c.primary : c.error}`
      }}
    >
      ● {connected ? 'CONNECTED' : status.toUpperCase()}
    </span>
  );

  const stopAll = useCallback(async () => {
    appendLog('> system emergency stop-all', 'command');
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>('/system/stop-all', {
        method: 'POST'
      });
      appendLog(res.message || 'All servers and processes stopped.', 'warning');
    } catch (e) {
      appendLog(`Stop-all failed: ${e instanceof Error ? e.message : 'unknown error'}`, 'warning');
    }
  }, [appendLog]);

  return (
    <AppShell active="console" topRight={statusPill}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: THEME.fonts.heading, fontSize: 24, fontWeight: 600 }}>▧ Live Terminal</span>
          {servers.length > 1 && (
            <select
              value={activeServerId}
              onChange={(e) => setActiveServerId(e.target.value)}
              style={{ background: c.surfaceContainerLowest, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '6px 10px', fontFamily: THEME.fonts.mono, fontSize: 12 }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => power('START')} style={ghostButton(c.primary)}>▶ Start</button>
          <button onClick={() => power('RESTART')} style={ghostButton(c.tertiary)}>⟳ Restart</button>
          <button onClick={() => power('STOP')} style={ghostButton(c.error)}>■ Stop</button>
          <button onClick={stopAll} style={{ ...ghostButton(c.error), background: '#ef4444', color: '#ffffff', borderColor: '#b91c1c' }}>🛑 Kill All Processes</button>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const activeChip = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontFamily: THEME.fonts.mono,
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: THEME.radius.md,
                cursor: 'pointer',
                background: activeChip ? c.primary : c.surfaceContainer,
                color: activeChip ? c.onPrimary : c.onSurfaceVariant,
                border: `2px solid ${activeChip ? c.primary : c.outline}`
              }}
            >
              {f.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>
          {activeServer ? `${activeServer.name} · ${activeServer.host}:${activeServer.port}` : ''}
        </span>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          minHeight: 380,
          background: c.surfaceContainerLowest,
          border: `2px solid ${c.outline}`,
          borderRadius: THEME.radius.md,
          padding: THEME.space.sm,
          overflowY: 'auto',
          fontFamily: THEME.fonts.mono,
          fontSize: 13,
          lineHeight: '22px'
        }}
      >
        {error && <div style={{ color: c.error }}>{error}</div>}
        {visibleLogs.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', gap: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ color: c.outlineStrong }}>[{entry.ts}]</span>
            <span style={{ color: categoryColor(entry.category), flex: 1 }}>{entry.text}</span>
          </div>
        ))}
        {visibleLogs.length === 0 && !error && (
          <div style={{ color: c.onSurfaceVariant }}>Waiting for live events… trigger a power action or send a command.</div>
        )}
      </div>

      {/* Quick commands */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>Quick:</span>
        {QUICK_COMMANDS.map((q) => (
          <button
            key={q}
            onClick={() => {
              if (q.includes('<')) {
                setCommand(q);
              } else {
                sendCommand(q);
              }
            }}
            style={{ fontFamily: THEME.fonts.mono, fontSize: 12, padding: '4px 10px', borderRadius: THEME.radius.sm, cursor: 'pointer', background: c.surfaceContainer, color: c.onSurfaceVariant, border: `2px solid ${c.outline}` }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Command input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCommand(command);
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}
      >
        <span style={{ display: 'grid', placeItems: 'center', padding: '0 12px', background: c.surfaceContainerLowest, color: c.primary, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, fontFamily: THEME.fonts.mono }}>&gt;_</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Enter command…"
          style={{ flex: 1, background: c.surfaceContainerLowest, color: c.onSurface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: '10px 12px', fontFamily: THEME.fonts.mono, fontSize: 13, outline: 'none' }}
        />
        <button type="submit" style={{ background: c.primary, color: c.onPrimary, border: 'none', borderRadius: THEME.radius.md, padding: '10px 18px', fontFamily: THEME.fonts.mono, fontWeight: 700, fontSize: 13, cursor: 'pointer', minWidth: 110 }}>SEND ▷</button>
      </form>
    </AppShell>
  );
}

function ghostButton(accent: string): React.CSSProperties {
  return {
    background: 'transparent',
    color: accent,
    border: `2px solid ${accent}`,
    borderRadius: THEME.radius.md,
    padding: '8px 14px',
    fontFamily: THEME.fonts.mono,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer'
  };
}
