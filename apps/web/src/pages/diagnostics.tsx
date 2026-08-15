import React, { useEffect, useState, useCallback } from 'react';
import { THEME, Button, Card, Badge } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../lib/api-client';

const c = THEME.colors;

interface RakNetData {
  latencyMs: number;
  edition: string;
  motd: string;
  protocolVersion: number;
  versionName: string;
  playerCount: number;
  maxPlayers: number;
  serverGuid: string;
  worldName: string;
  gameMode: string;
  portIpv4: number;
}

interface DiagnosticIssue {
  code: string;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  recommendation: string;
  canAutoFix: boolean;
  autoFixAction?: string;
}

interface DiagnosticReport {
  serverId: string;
  serverName: string;
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
  raknet: RakNetData | null;
  process: {
    running: boolean;
    pid?: number;
    memoryMb?: number;
  };
  network: {
    loopbackExempt: boolean;
    onlineMode: boolean;
    port: number;
    host: string;
  };
  issues: DiagnosticIssue[];
}

interface ServerSummary {
  id: string;
  name: string;
}

export default function DiagnosticsPage() {
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [fixLoading, setFixLoading] = useState<string | null>(null);

  // Simulation test inputs
  const [clientVersionInput, setClientVersionInput] = useState<string>('1.21.73');
  const [compatibilityCheckResult, setCompatibilityCheckResult] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      const data = await apiFetch<{ servers: ServerSummary[] }>('/servers');
      const list = data.servers || (data as unknown as ServerSummary[]);
      setServers(list);
      if (list.length > 0 && !selectedServerId) {
        setSelectedServerId(list[0].id);
      }
    } catch (_) {}
  }, [selectedServerId]);

  const loadDiagnostics = useCallback(async (serverId: string) => {
    if (!serverId) return;
    try {
      const data = await apiFetch<DiagnosticReport>(`/diagnostics/servers/${serverId}`);
      setReport(data);
    } catch (err) {
      // Create honest offline stub if API error
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureAuthenticated();
    void fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (selectedServerId) {
      void loadDiagnostics(selectedServerId);
    }
  }, [selectedServerId, loadDiagnostics]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !selectedServerId) return;
    const interval = setInterval(() => {
      void loadDiagnostics(selectedServerId);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedServerId, loadDiagnostics]);

  const executeRemediation = async (action: string) => {
    if (!selectedServerId) return;
    setFixLoading(action);
    setActionStatus(null);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>('/diagnostics/remediate', {
        method: 'POST',
        body: JSON.stringify({ serverId: selectedServerId, action })
      });
      setActionStatus(result.message || 'Remediation applied successfully.');
      await loadDiagnostics(selectedServerId);
    } catch (err) {
      setActionStatus(`Error applying remediation: ${String(err)}`);
    } finally {
      setFixLoading(null);
    }
  };

  const testClientCompatibility = () => {
    if (!report?.raknet) {
      setCompatibilityCheckResult('⚠️ Cannot verify: Server RakNet UDP protocol is currently unreachable.');
      return;
    }
    const serverVer = report.raknet.versionName;
    if (clientVersionInput.trim() === serverVer) {
      setCompatibilityCheckResult(`✅ PERFECT MATCH! Client ${clientVersionInput} matches server ${serverVer} (Protocol ${report.raknet.protocolVersion}). Players can connect with zero errors.`);
    } else {
      setCompatibilityCheckResult(`❌ VERSION MISMATCH! Client is ${clientVersionInput} but server is ${serverVer}. Client will receive "Outdated Server" or CHAIN_INVALID error. Use Bedrock Launcher to select ${serverVer}.`);
    }
  };

  const statusColor = (st?: string) => {
    switch (st) {
      case 'HEALTHY':
        return '#16a34a';
      case 'DEGRADED':
        return '#d97706';
      case 'CRITICAL':
      case 'OFFLINE':
      default:
        return '#dc2626';
    }
  };

  return (
    <AppShell active="diagnostics">
      <div style={{ display: 'grid', gap: THEME.space.md, padding: THEME.space.md }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28, color: c.onSurface }}>
              Server Diagnostics & Health Center
            </h1>
            <p style={{ margin: '4px 0 0', color: c.onSurfaceVariant, fontSize: 14 }}>
              Real-time RakNet UDP telemetry, protocol analysis, Windows loopback isolation tests, and 1-click issue resolver.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.onSurfaceVariant, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-poll (5s)
            </label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              style={{
                background: c.surfaceContainer,
                color: c.onSurface,
                border: `1px solid ${c.outline}`,
                borderRadius: THEME.radius.md,
                padding: '8px 12px',
                fontFamily: THEME.fonts.mono,
                fontSize: 13
              }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={() => loadDiagnostics(selectedServerId)}>
              Refresh Now
            </Button>
          </div>
        </div>

        {actionStatus && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: THEME.radius.md,
              background: actionStatus.startsWith('Error') ? c.errorContainer : '#14532d',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {actionStatus}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: c.onSurfaceVariant }}>
            Inspecting server UDP sockets and analyzing system telemetry…
          </div>
        ) : report ? (
          <>
            {/* Top Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {/* Overall Health Score */}
              <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 16 }}>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, textTransform: 'uppercase', fontWeight: 700 }}>
                  Overall Health State
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor(report.overallStatus) }} />
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: THEME.fonts.heading, color: statusColor(report.overallStatus) }}>
                    {report.overallStatus}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, marginTop: 6 }}>
                  {report.issues.length} active issue{report.issues.length === 1 ? '' : 's'} identified
                </div>
              </Card>

              {/* RakNet UDP Ping & Latency */}
              <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 16 }}>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, textTransform: 'uppercase', fontWeight: 700 }}>
                  RakNet Protocol Pulse
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: THEME.fonts.mono, marginTop: 8, color: report.raknet ? c.primary : '#ef4444' }}>
                  {report.raknet ? `${report.raknet.latencyMs} ms` : 'Unreachable'}
                </div>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, marginTop: 6 }}>
                  {report.raknet ? `Port ${report.raknet.portIpv4} (UDP) · Version ${report.raknet.versionName}` : 'Port 19132 not responding'}
                </div>
              </Card>

              {/* Process & RAM */}
              <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 16 }}>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, textTransform: 'uppercase', fontWeight: 700 }}>
                  BDS Native Process
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: THEME.fonts.mono, marginTop: 8, color: report.process.running ? '#10b981' : '#ef4444' }}>
                  {report.process.running ? `PID ${report.process.pid}` : 'OFFLINE'}
                </div>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, marginTop: 6 }}>
                  {report.process.running ? `Memory: ${report.process.memoryMb} MB RSS` : 'Process not found'}
                </div>
              </Card>

              {/* Windows Network Loopback */}
              <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 16 }}>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, textTransform: 'uppercase', fontWeight: 700 }}>
                  Local Loopback Exemption
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: THEME.fonts.mono, marginTop: 8, color: report.network.loopbackExempt ? '#10b981' : '#f59e0b' }}>
                  {report.network.loopbackExempt ? 'EXEMPT (OK)' : 'BLOCKED'}
                </div>
                <div style={{ fontSize: 12, color: c.onSurfaceVariant, marginTop: 6 }}>
                  {report.network.loopbackExempt ? 'UWP client allowed to reach 127.0.0.1' : 'Windows UWP sandboxing active'}
                </div>
              </Card>
            </div>

            {/* Active Issues & 1-Click Remediation Feed */}
            <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 20 }}>
              <h2 style={{ margin: '0 0 16px', fontFamily: THEME.fonts.heading, fontSize: 18, color: c.onSurface }}>
                🛡️ Active Diagnostic Findings & 1-Click Fixes
              </h2>

              {report.issues.length === 0 ? (
                <div style={{ padding: 16, background: '#14532d', borderRadius: THEME.radius.md, color: '#bbf7d0', fontSize: 14, fontWeight: 600 }}>
                  🎉 All diagnostics passed! Server protocol, network loopback, and memory health are 100% optimal.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {report.issues.map((issue) => (
                    <div
                      key={issue.code}
                      style={{
                        padding: 14,
                        borderRadius: THEME.radius.md,
                        background: c.surfaceContainerHighest,
                        border: `1px solid ${issue.severity === 'CRITICAL' ? '#991b1b' : issue.severity === 'WARNING' ? '#92400e' : c.outline}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 280 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge
                            status={issue.severity === 'CRITICAL' ? 'ERROR' : issue.severity === 'WARNING' ? 'PENDING' : 'INFO'}
                            label={issue.severity}
                          />
                          <strong style={{ fontSize: 14, color: c.onSurface }}>{issue.title}</strong>
                        </div>
                        <p style={{ margin: '6px 0 4px', fontSize: 13, color: c.onSurfaceVariant }}>
                          {issue.description}
                        </p>
                        <div style={{ fontSize: 12, color: c.primary, fontFamily: THEME.fonts.mono }}>
                          💡 Solution: {issue.recommendation}
                        </div>
                      </div>

                      {issue.canAutoFix && issue.autoFixAction && (
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={fixLoading === issue.autoFixAction}
                          onClick={() => executeRemediation(issue.autoFixAction!)}
                        >
                          Auto-Fix Now ⚡
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Protocol & Client Version Compatibility Sandbox */}
            <Card style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, padding: 20 }}>
              <h2 style={{ margin: '0 0 8px', fontFamily: THEME.fonts.heading, fontSize: 18, color: c.onSurface }}>
                🎮 Client Version Compatibility Simulator
              </h2>
              <p style={{ margin: '0 0 16px', color: c.onSurfaceVariant, fontSize: 13 }}>
                Test if a specific Minecraft client version will connect to this server without getting an &ldquo;Outdated Server&rdquo; or CHAIN error.
              </p>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={clientVersionInput}
                  onChange={(e) => setClientVersionInput(e.target.value)}
                  placeholder="e.g. 1.21.73 or 1.26.42"
                  style={{
                    background: c.surfaceContainerLowest,
                    color: c.onSurface,
                    border: `1px solid ${c.outline}`,
                    borderRadius: THEME.radius.md,
                    padding: '8px 12px',
                    fontFamily: THEME.fonts.mono,
                    fontSize: 13,
                    width: 220
                  }}
                />
                <Button variant="secondary" size="sm" onClick={testClientCompatibility}>
                  Test Compatibility
                </Button>
              </div>

              {compatibilityCheckResult && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: THEME.radius.md, background: c.surfaceContainerHighest, fontSize: 13, fontFamily: THEME.fonts.mono }}>
                  {compatibilityCheckResult}
                </div>
              )}
            </Card>
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: c.error }}>
            Failed to fetch server diagnostics. Please verify backend control plane is running.
          </div>
        )}
      </div>
    </AppShell>
  );
}
