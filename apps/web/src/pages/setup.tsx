import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../lib/api-client';

const c = THEME.colors;

type Step = 1 | 2 | 3 | 4;

interface EnvCheck {
  status: string;
  checks: {
    nodeRuntime: { status: string; version: string };
    databaseEngine: { status: string; adapter: string };
    goAgentDaemon: { status: string; connectedAgents: number; note: string };
    storageR2: { status: string; note: string };
    discordIntegrations: { status: string; note: string };
  };
}

interface SetupServer {
  id: string;
  name: string;
  host: string;
  port: number;
  type?: string;
  status: string;
}

interface DeploymentResult {
  server: SetupServer;
  network?: { fqdn: string; port: number };
  installedPlugins: string[];
  installedMods: string[];
  onboarding?: { gamertag: string; xuid: string; invite: { status: string } } | null;
  started: boolean;
}

export default function SetupWizardPage() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Step 1: Environment Check
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);

  // Step 2: Server & Customizations Configuration
  const [serverName, setServerName] = useState('My Bedrock Realm');
  const [serverType, setServerType] = useState('VANILLA');
  const [templateId, setTemplateId] = useState('tmpl_vanilla_survival');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>(['EndstoneChatGuard']);
  const [selectedMods, setSelectedMods] = useState<string[]>(['steve_alex_custom_skins']);
  const [allocateNetwork, setAllocateNetwork] = useState(true);
  const [nodeIp, setNodeIp] = useState('127.0.0.1');
  const [subdomain, setSubdomain] = useState('');
  const [gamertag, setGamertag] = useState('');

  // Step 3 & 4: Deployment & Live Server Monitoring
  const [deployment, setDeployment] = useState<DeploymentResult | null>(null);
  const [consoleCommand, setConsoleCommand] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[System] BedrockOps Control Plane initialized.',
    '[System] Ready for live BDS server deployment.'
  ]);

  useEffect(() => {
    ensureAuthenticated()
      .then(async () => {
        setReady(true);
        loadEnvironment();
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Authentication failed'));
  }, []);

  const loadEnvironment = async () => {
    try {
      const [env, tmpl] = await Promise.all([
        apiFetch<EnvCheck>('/provisioning/environment').catch(() => null),
        apiFetch<{ templates: Array<{ id: string; name: string; description: string }> }>('/templates').catch(
          () => ({ templates: [] })
        )
      ]);
      if (env) setEnvCheck(env);
      if (tmpl?.templates) setTemplates(tmpl.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load environment setup');
    }
  };

  const autoBootstrapEnv = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>('/provisioning/auto-bootstrap', { method: 'POST' });
      setNote(res.message);
      await loadEnvironment();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-bootstrap failed');
    } finally {
      setBusy(false);
    }
  };

  const executeFullStackDeploy = async () => {
    setBusy(true);
    setError(null);
    setStep(3);
    setConsoleLogs((prev) => [
      ...prev,
      `[Deploy Pipeline] Initiating full stack deployment for "${serverName}" (${serverType})...`,
      `[Deploy Pipeline] Applying mode catalog template "${templateId}"...`,
      `[Deploy Pipeline] Mounting plugins: ${selectedPlugins.join(', ') || 'none'}`,
      `[Deploy Pipeline] Mounting skins/mods: ${selectedMods.join(', ') || 'none'}`
    ]);

    try {
      const res = await apiFetch<{ success: boolean; deployment: DeploymentResult }>('/provisioning/deploy-full-stack', {
        method: 'POST',
        body: JSON.stringify({
          serverName,
          serverType,
          templateId,
          plugins: selectedPlugins,
          skinsAndMods: selectedMods,
          allocateNetwork,
          nodeIp: allocateNetwork ? nodeIp : undefined,
          subdomain: allocateNetwork && subdomain.trim() ? subdomain.trim() : undefined,
          gamertag: gamertag.trim() || undefined
        })
      });

      setDeployment(res.deployment);
      setConsoleLogs((prev) => [
        ...prev,
        `[Deploy Pipeline] Server provisioned on ${res.deployment.server.host}:${res.deployment.server.port}`,
        `[Deploy Pipeline] BDS Container status: ONLINE (strategy fallback ready)`,
        `[Deploy Pipeline] Deployment completed successfully!`
      ]);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Full stack deployment failed');
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const sendRconCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleCommand.trim() || !deployment?.server) return;
    const cmd = consoleCommand.trim();
    setConsoleCommand('');
    setConsoleLogs((prev) => [...prev, `> ${cmd}`]);

    try {
      const res = await apiFetch<{ output: string; response?: string }>(`/servers/${deployment.server.id}/rcon`, {
        method: 'POST',
        body: JSON.stringify({ command: cmd })
      });
      setConsoleLogs((prev) => [...prev, res.output || res.response || `Executed command: ${cmd}`]);
    } catch (err) {
      setConsoleLogs((prev) => [...prev, `[RCON Error] ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  const togglePower = async (action: 'START' | 'STOP' | 'RESTART') => {
    if (!deployment?.server) return;
    setBusy(true);
    setConsoleLogs((prev) => [...prev, `[Power Action] Triggering ${action} for ${deployment.server.name}...`]);
    try {
      await apiFetch(`/servers/${deployment.server.id}/power`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      setConsoleLogs((prev) => [...prev, `[Power Action] ${action} signal dispatched.`]);
    } catch (e) {
      setConsoleLogs((prev) => [...prev, `[Power Action Error] ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <AppShell active="setup">
        <p style={{ color: c.onSurfaceVariant }}>Initializing setup wizard…</p>
      </AppShell>
    );
  }

  return (
    <AppShell active="setup">
      <header style={{ marginBottom: THEME.space.md }}>
        <h1 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 28 }}>
          ⚡ BedrockOps Guided Setup & Deployment Launcher
        </h1>
        <p style={{ margin: '6px 0 0', color: c.onSurfaceVariant }}>
          All-in-One environment check, custom server configuration, plugin & skin installation, and one-click deployment.
        </p>
      </header>

      {/* Step Stepper Header */}
      <div style={{ display: 'flex', gap: 12, marginBottom: THEME.space.md }}>
        {[
          { num: 1, title: '1. Environment Check' },
          { num: 2, title: '2. Server & Customizations' },
          { num: 3, title: '3. One-Click Deploy' },
          { num: 4, title: '4. Live Monitoring Hub' }
        ].map((s) => (
          <div
            key={s.num}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: THEME.radius.md,
              background: step === s.num ? c.primaryContainer : c.surfaceContainer,
              color: step === s.num ? c.onPrimaryContainer : c.onSurfaceVariant,
              fontWeight: step === s.num ? 700 : 400,
              border: `1px solid ${step === s.num ? c.primary : c.outline}`,
              fontSize: 13,
              textAlign: 'center'
            }}
          >
            {s.title}
          </div>
        ))}
      </div>

      {note && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: THEME.radius.md, background: c.surfaceContainerHigh, color: c.onSurface, fontSize: 13 }}>
          {note}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: THEME.radius.md, background: c.errorContainer, color: c.error, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* STEP 1: Environment Diagnostics & Auto-Bootstrap */}
      {step === 1 && (
        <section style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: THEME.fonts.heading, fontSize: 20 }}>
            System Environment Diagnostics
          </h2>
          <p style={{ color: c.onSurfaceVariant, fontSize: 13, marginBottom: 16 }}>
            BedrockOps self-checks your backend services, database adapters, and Go agent daemon status.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
            {envCheck?.checks &&
              Object.entries(envCheck.checks).map(([key, info]) => (
                <div key={key} style={{ background: c.surface, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: info.status === 'OK' ? '#15803d' : '#b45309', color: '#fff' }}>
                      {info.status}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: c.onSurfaceVariant }}>
                    {'version' in info ? info.version : 'adapter' in info ? info.adapter : 'note' in info ? info.note : ''}
                  </p>
                </div>
              ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" onClick={autoBootstrapEnv} disabled={busy} style={{ background: c.secondary, color: c.onSecondary, border: 'none', padding: '10px 16px', borderRadius: THEME.radius.md, cursor: 'pointer', fontWeight: 700 }}>
              Auto-Fix & Bootstrap Environment
            </button>
            <button type="button" onClick={() => setStep(2)} style={{ background: c.primary, color: c.onPrimary, border: 'none', padding: '10px 20px', borderRadius: THEME.radius.md, cursor: 'pointer', fontWeight: 700 }}>
              Continue to Server Setup →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Server Architecture, Customizations & Mods */}
      {step === 2 && (
        <section style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md, display: 'grid', gap: 16 }}>
          <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 20 }}>
            Server Architecture & Customizations
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Core Server Config */}
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono }}>Server Realm Display Name</span>
                <input value={serverName} onChange={(e) => setServerName(e.target.value)} style={inputStyle()} />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono }}>Server Architecture Type</span>
                <select value={serverType} onChange={(e) => setServerType(e.target.value)} style={inputStyle()}>
                  <option value="VANILLA">Official Vanilla BDS (Standard Bedrock)</option>
                  <option value="ENDSTONE">⚡ Endstone (Python & C++ Plugin Framework)</option>
                  <option value="BEHAVIOR">Script API Addon Companion</option>
                  <option value="POCKETMINE">PocketMine-MP (PHP Engine)</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono }}>Mode Catalog Template</span>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={inputStyle()}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Plugins & Mods */}
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <span style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, display: 'block', marginBottom: 6 }}>
                  Plugins & Addons
                </span>
                {[
                  { id: 'EndstoneChatGuard', label: 'ChatGuard (Python Spam & Link Filter)' },
                  { id: 'EndstonePerms', label: 'PermNodes (C++ Native Permissions)' },
                  { id: 'EndstoneEconomy', label: 'Economy & Wallet Engine' },
                  { id: 'AntiCheatShield', label: 'Movement & Speed Anti-Cheat' }
                ].map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={selectedPlugins.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedPlugins((prev) => [...prev, p.id]);
                        else setSelectedPlugins((prev) => prev.filter((i) => i !== p.id));
                      }}
                    />
                    {p.label}
                  </label>
                ))}
              </div>

              <div>
                <span style={{ fontSize: 12, color: c.onSurfaceVariant, fontFamily: THEME.fonts.mono, display: 'block', marginBottom: 6 }}>
                  Skins & Resource Packs
                </span>
                {[
                  { id: 'steve_alex_custom_skins', label: 'Console Custom Player Skins' },
                  { id: 'hd_textures_v1', label: '32x HD Texture Resource Pack' },
                  { id: 'fantasy_resource_pack', label: 'Fantasy World Resource Pack' }
                ].map((m) => (
                  <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={selectedMods.includes(m.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMods((prev) => [...prev, m.id]);
                        else setSelectedMods((prev) => prev.filter((i) => i !== m.id));
                      }}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Network & Console Onboarding */}
          <div style={{ borderTop: `1px solid ${c.outline}`, paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={allocateNetwork} onChange={(e) => setAllocateNetwork(e.target.checked)} />
              Allocate DNS Subdomain & UDP Port Routing
            </label>
            <input value={gamertag} onChange={(e) => setGamertag(e.target.value)} placeholder="Console Xbox/Switch Gamertag to allowlist" style={inputStyle()} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" onClick={() => setStep(1)} style={{ background: 'transparent', color: c.onSurface, border: `1px solid ${c.outline}`, padding: '10px 16px', borderRadius: THEME.radius.md, cursor: 'pointer' }}>
              ← Back to Environment
            </button>
            <button type="button" onClick={executeFullStackDeploy} disabled={busy} style={{ background: c.primary, color: c.onPrimary, border: 'none', padding: '10px 24px', borderRadius: THEME.radius.md, cursor: 'pointer', fontWeight: 700 }}>
              Deploy Full Stack Server 🚀
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Deploy Execution Progress */}
      {step === 3 && (
        <section style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: THEME.fonts.heading, fontSize: 20 }}>
            Deploying Server & Environment Strategy Fallbacks…
          </h2>
          <p style={{ color: c.onSurfaceVariant, fontSize: 13 }}>
            Pipelining container lifecycle, mounting plugin manifests, and binding play subdomain.
          </p>

          <div style={{ background: '#090d16', border: `1px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: 14, fontFamily: THEME.fonts.mono, fontSize: 12, color: '#e2e8f0', minHeight: 180, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {consoleLogs.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </section>
      )}

      {/* STEP 4: All-in-One Control & Live BDS Server Monitoring Hub */}
      {step === 4 && deployment && (
        <div style={{ display: 'grid', gap: THEME.space.md }}>
          {/* Status & Power Bar */}
          <section style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 22 }}>
                  {deployment.server.name}
                </h2>
                <span style={{ background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                  ONLINE
                </span>
              </div>
              <p style={{ margin: '4px 0 0', color: c.tertiary, fontFamily: THEME.fonts.mono, fontSize: 13 }}>
                Connect FQDN: {deployment.server.host}:{deployment.server.port}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => togglePower('START')} style={powerBtn('#16a34a')}>Start</button>
              <button type="button" onClick={() => togglePower('RESTART')} style={powerBtn('#d97706')}>Restart</button>
              <button type="button" onClick={() => togglePower('STOP')} style={powerBtn('#dc2626')}>Stop</button>
              <Link href="/" style={{ background: c.primary, color: c.onPrimary, padding: '8px 14px', borderRadius: THEME.radius.md, textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center' }}>
                Open Main Dashboard
              </Link>
            </div>
          </section>

          {/* Embedded Live Console Log Streamer & RCON Command Shell */}
          <section style={{ background: c.surfaceContainer, border: `1px solid ${c.outline}`, borderRadius: THEME.radius.lg, padding: THEME.space.md, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontFamily: THEME.fonts.heading, fontSize: 18 }}>
              📟 Embedded Live BDS Console & RCON Command Terminal
            </h3>

            <div style={{ background: '#090d16', border: `1px solid ${c.outline}`, borderRadius: THEME.radius.md, padding: 14, fontFamily: THEME.fonts.mono, fontSize: 12, color: '#e2e8f0', height: 260, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {consoleLogs.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>

            <form onSubmit={sendRconCommand} style={{ display: 'flex', gap: 8 }}>
              <input value={consoleCommand} onChange={(e) => setConsoleCommand(e.target.value)} placeholder="Type RCON command (e.g. /list, /say Welcome!, /op PlayerName)..." style={{ ...inputStyle(), flex: 1 }} />
              <button type="submit" style={{ background: c.primary, color: c.onPrimary, border: 'none', padding: '10px 18px', borderRadius: THEME.radius.md, fontWeight: 700, cursor: 'pointer' }}>
                Send Command
              </button>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}

const inputStyle = (): React.CSSProperties => ({
  background: c.surfaceContainerLowest,
  color: c.onSurface,
  border: `1px solid ${c.outline}`,
  borderRadius: THEME.radius.md,
  padding: '10px 12px',
  fontFamily: THEME.fonts.mono,
  fontSize: 13
});

const powerBtn = (bgColor: string): React.CSSProperties => ({
  background: bgColor,
  color: '#fff',
  border: 'none',
  borderRadius: THEME.radius.md,
  padding: '8px 14px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer'
});
