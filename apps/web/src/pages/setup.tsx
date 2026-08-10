import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ApiError, ensureAuthenticated } from '../lib/api-client';

const c = THEME.colors;

type Step = 1 | 2 | 3 | 4;

interface SetupServer {
  id: string;
  name: string;
  host: string;
  port: number;
  version: string;
  status: string;
}

interface PipelineRun {
  id: string;
  status: string;
  logs: string[];
}

export default function SetupWizardPage() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — create realm via setup pipeline
  const [serverName, setServerName] = useState('My New Realm');
  const [templateId, setTemplateId] = useState('tmpl_vanilla_survival');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [allocateNetwork, setAllocateNetwork] = useState(true);
  const [nodeIp, setNodeIp] = useState('127.0.0.1');
  const [subdomain, setSubdomain] = useState('');
  const [server, setServer] = useState<SetupServer | null>(null);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [propertiesNote, setPropertiesNote] = useState<string | null>(null);
  const [propertiesPending, setPropertiesPending] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);

  // Step 2 — console onboarding
  const [gamertag, setGamertag] = useState('');
  const [onboarding, setOnboarding] = useState<{
    gamertag: string;
    xuid: string;
    invite: { status: string; stub: boolean };
    stub: boolean;
  } | null>(null);

  // Step 3 — first host backup attempt
  const [backupNote, setBackupNote] = useState<string | null>(null);

  useEffect(() => {
    ensureAuthenticated()
      .then(async () => {
        setReady(true);
        try {
          const [tmpl, status] = await Promise.all([
            apiFetch<{ templates: Array<{ id: string; name: string; description: string }> }>('/templates'),
            apiFetch<{ agents?: { connectedCount: number } }>('/system/status').catch(() => null)
          ]);
          setTemplates(tmpl.templates);
          if (tmpl.templates.some((t) => t.id === 'tmpl_vanilla_survival')) {
            setTemplateId('tmpl_vanilla_survival');
          } else if (tmpl.templates[0]) {
            setTemplateId(tmpl.templates[0].id);
          }
          if (status?.agents) {
            setAgentConnected(status.agents.connectedCount > 0);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to load templates');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Auth failed'));
  }, []);

  const createRealm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        server: SetupServer;
        run: PipelineRun;
        network?: { fqdn: string; port: number; dns?: { stub?: boolean } };
        propertiesWrite?: { success: boolean; stub?: boolean; path?: string; error?: string };
      }>('/provisioning/setup', {
        method: 'POST',
        body: JSON.stringify({
          serverName,
          templateId,
          allocateNetwork,
          nodeIp: allocateNetwork ? nodeIp : undefined,
          subdomain: allocateNetwork && subdomain.trim() ? subdomain.trim() : undefined
        })
      });
      setServer(res.server);
      setRun(res.run);
      if (res.propertiesWrite?.success) {
        setPropertiesNote(`Wrote ${res.propertiesWrite.path}`);
        setPropertiesPending(false);
      } else if (res.propertiesWrite?.stub || res.propertiesWrite?.error) {
        setPropertiesNote(
          res.propertiesWrite.error ||
            'server.properties prepared but agent offline — Start after pairing the Go agent.'
        );
        setPropertiesPending(true);
      } else {
        setPropertiesNote(null);
        setPropertiesPending(false);
      }
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup pipeline failed');
    } finally {
      setBusy(false);
    }
  };

  const onboardConsole = async () => {
    if (!server || !gamertag.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        onboarding: {
          gamertag: string;
          xuid: string;
          invite: { status: string; stub: boolean };
          stub: boolean;
        };
      }>('/provisioning/onboarding/console', {
        method: 'POST',
        body: JSON.stringify({
          gamertag: gamertag.trim(),
          serverId: server.id,
          autoAcceptInvite: true
        })
      });
      setOnboarding(res.onboarding);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Console onboarding failed');
    } finally {
      setBusy(false);
    }
  };

  const firstBackup = async () => {
    if (!server) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        success?: boolean;
        stub?: boolean;
        backup?: { filename: string; status: string };
        message?: string;
      }>('/backups', {
        method: 'POST',
        body: JSON.stringify({ serverId: server.id, isManual: true, notes: 'First setup wizard backup' })
      });
      const filename = res.backup?.filename || 'backup';
      const status = res.backup?.status || (res.success ? 'COMPLETED' : 'FAILED');
      setBackupNote(
        res.stub || !res.success
          ? `${filename} → ${status}. Agent/R2 offline — honest stub (pair a Go agent to run a real archive).`
          : `${filename} → ${status}.`
      );
      setStep(4);
    } catch (e) {
      // API returns 503 with body when agent offline — surface that as a completed step with stub note.
      const msg = e instanceof Error ? e.message : 'Backup failed';
      setBackupNote(`${msg} — pair a Go agent + configure R2 for a live archive.`);
      setStep(4);
    } finally {
      setBusy(false);
    }
  };

  const retryWriteProperties = async () => {
    if (!server || !templateId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        success?: boolean;
        propertiesWrite?: { success: boolean; stub?: boolean; path?: string; error?: string };
        message?: string;
      }>('/provisioning/apply-template', {
        method: 'POST',
        body: JSON.stringify({ serverId: server.id, templateId })
      });
      if (res.propertiesWrite?.success || res.success) {
        setPropertiesNote(`Wrote ${res.propertiesWrite?.path || 'server.properties'}`);
        setPropertiesPending(false);
      } else {
        setPropertiesNote(res.propertiesWrite?.error || res.message || 'Properties write still deferred');
        setPropertiesPending(true);
      }
    } catch (e) {
      const body =
        e instanceof ApiError && e.body && typeof e.body === 'object'
          ? (e.body as { propertiesWrite?: { error?: string }; message?: string })
          : null;
      setPropertiesNote(
        body?.propertiesWrite?.error || body?.message || (e instanceof Error ? e.message : 'Properties write failed')
      );
      setPropertiesPending(true);
    } finally {
      setBusy(false);
    }
  };

  if (!ready && !error) {
    return (
      <AppShell active="setup">
        <div style={{ fontFamily: THEME.fonts.mono, color: c.onSurfaceVariant }}>Authenticating…</div>
      </AppShell>
    );
  }

  return (
    <AppShell active="setup">
      <div>
        <h1 style={{ fontFamily: THEME.fonts.heading, fontSize: 30, fontWeight: 700, margin: 0 }}>Realm Setup</h1>
        <p style={{ color: c.onSurfaceVariant, marginTop: 6, maxWidth: 560 }}>
          Pick a game mode, create a realm, onboard a console player, and take a first backup. Packs/addons are Wave D.
        </p>
      </div>

      <StepRail step={step} />

      {error && (
        <div style={{ color: c.error, fontFamily: THEME.fonts.mono, fontSize: 13, border: `2px solid ${c.error}`, borderRadius: THEME.radius.md, padding: '10px 14px' }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <Card title="1 · Create realm">
          <Field label="Realm name">
            <input value={serverName} onChange={(e) => setServerName(e.target.value)} style={input()} />
          </Field>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, color: c.onSurfaceVariant, marginBottom: 8 }}>
              Game mode
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(templates.length
                ? templates
                : [
                    {
                      id: 'tmpl_vanilla_survival',
                      name: 'Vanilla Hard Survival',
                      description: 'Classic hard survival'
                    }
                  ]
              ).map((t) => {
                const selected = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    style={{
                      textAlign: 'left',
                      background: selected ? c.primaryContainer : c.surfaceContainerLowest,
                      color: selected ? c.onPrimary : c.onSurface,
                      border: `2px solid ${selected ? c.primary : c.outline}`,
                      borderRadius: THEME.radius.md,
                      padding: '10px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontFamily: THEME.fonts.heading, fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant }}>
            {agentConnected === true
              ? 'Go agent connected — server.properties will write on create.'
              : agentConnected === false
                ? 'Go agent offline — realm is created; properties write waits until the agent connects.'
                : 'Checking agent…'}
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: THEME.fonts.mono, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={allocateNetwork} onChange={(e) => setAllocateNetwork(e.target.checked)} />
            Allocate play subdomain + UDP port
          </label>
          {allocateNetwork && (
            <>
              <Field label="Node IP (A record target)">
                <input value={nodeIp} onChange={(e) => setNodeIp(e.target.value)} style={input()} />
              </Field>
              <Field label="Subdomain (optional)">
                <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="auto-generated if empty" style={input()} />
              </Field>
            </>
          )}
          <button disabled={busy || !serverName.trim() || !templateId} onClick={createRealm} style={primaryBtn()}>
            {busy ? 'Running pipeline…' : 'Create realm →'}
          </button>
        </Card>
      )}

      {step === 2 && server && (
        <Card title="2 · Console player onboarding">
          <Summary
            lines={[
              `Realm ${server.name} (${server.id})`,
              `Address ${server.host}:${server.port}`,
              run ? `Pipeline ${run.status}` : '',
              propertiesNote ? `Properties: ${propertiesNote}` : ''
            ].filter(Boolean)}
          />
          {run?.logs?.length ? (
            <pre style={logBox()}>{run.logs.slice(-6).join('\n')}</pre>
          ) : null}
          <Field label="Gamertag">
            <input value={gamertag} onChange={(e) => setGamertag(e.target.value)} placeholder="ConsoleKid123" style={input()} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || !gamertag.trim()} onClick={onboardConsole} style={primaryBtn()}>
              {busy ? 'Onboarding…' : 'Onboard player →'}
            </button>
            <button disabled={busy} onClick={() => setStep(3)} style={ghostBtn()}>
              Skip
            </button>
          </div>
        </Card>
      )}

      {step === 3 && server && (
        <Card title="3 · First backup">
          <Summary
            lines={[
              `Realm ${server.name}`,
              onboarding
                ? `Player ${onboarding.gamertag} · xuid ${onboarding.xuid} · invite ${onboarding.invite.status}${onboarding.stub ? ' (stub)' : ''}`
                : 'Console onboarding skipped'
            ]}
          />
          <p style={{ color: c.onSurfaceVariant, fontSize: 13, marginTop: 0 }}>
            Triggers a streaming backup through the host agent. Without an agent or R2 credentials the API reports an honest stub/failure — never a fake success.
          </p>
          <button disabled={busy} onClick={firstBackup} style={primaryBtn()}>
            {busy ? 'Backing up…' : 'Run first backup →'}
          </button>
        </Card>
      )}

      {step === 4 && server && (
        <Card title="4 · Done">
          <Summary
            lines={[
              `Realm ready: ${server.name}`,
              `${server.host}:${server.port}`,
              backupNote || 'Backup step complete',
              propertiesNote ? `Properties: ${propertiesNote}` : ''
            ].filter(Boolean)}
          />
          {agentConnected === false || propertiesPending ? (
            <p
              style={{
                margin: '0 0 12px',
                padding: '10px 12px',
                borderRadius: THEME.radius.md,
                border: `2px solid ${c.outline}`,
                background: c.surfaceContainerHigh,
                fontFamily: THEME.fonts.mono,
                fontSize: 12,
                color: c.onSurface
              }}
            >
              {agentConnected === false
                ? 'Go agent is offline — Start/backup/properties stay honest stubs until you pair an agent. Open Settings to confirm tunnel status.'
                : 'server.properties was not written yet. Retry after the agent is connected.'}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/servers/${server.id}`} style={{ ...primaryBtn(), textDecoration: 'none' }}>
              Open Ops Room →
            </Link>
            <Link href="/" style={{ ...ghostBtn(), textDecoration: 'none' }}>
              Dashboard (Start server)
            </Link>
            {propertiesPending ? (
              <button type="button" disabled={busy} onClick={retryWriteProperties} style={primaryBtn()}>
                {busy ? 'Writing…' : 'Retry write properties'}
              </button>
            ) : null}
            {agentConnected === false ? (
              <Link href="/settings" style={{ ...ghostBtn(), textDecoration: 'none' }}>
                Pair agent (Settings)
              </Link>
            ) : null}
            <Link href="/console" style={{ ...ghostBtn(), textDecoration: 'none' }}>
              Live Console
            </Link>
            <button
              onClick={() => {
                setStep(1);
                setServer(null);
                setRun(null);
                setOnboarding(null);
                setBackupNote(null);
                setPropertiesNote(null);
                setPropertiesPending(false);
                setGamertag('');
                setError(null);
              }}
              style={ghostBtn()}
            >
              Start another
            </button>
          </div>
        </Card>
      )}
    </AppShell>
  );
}

function StepRail({ step }: { step: Step }) {
  const labels = ['Create', 'Onboard', 'Backup', 'Done'];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div
            key={label}
            style={{
              padding: '6px 12px',
              borderRadius: THEME.radius.md,
              border: `2px solid ${active ? c.primary : c.outline}`,
              background: done ? c.primaryContainer : active ? c.surfaceContainerHigh : c.surfaceContainer,
              color: done ? c.onPrimary : c.onSurface,
              fontFamily: THEME.fonts.mono,
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {n}. {label}
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: c.surface, border: `2px solid ${c.outline}`, borderRadius: THEME.radius.md, overflow: 'hidden', maxWidth: 640 }}>
      <div style={{ background: c.dirt, padding: '10px 14px', fontFamily: THEME.fonts.heading, fontWeight: 600 }}>{title}</div>
      <div style={{ padding: THEME.space.md }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontFamily: THEME.fonts.mono, fontSize: 11, color: c.onSurfaceVariant, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Summary({ lines }: { lines: string[] }) {
  return (
    <div style={{ marginBottom: 14, fontFamily: THEME.fonts.mono, fontSize: 12, color: c.onSurfaceVariant, display: 'grid', gap: 4 }}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

function input(): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    background: c.surfaceContainerLowest,
    color: c.onSurface,
    border: `2px solid ${c.outline}`,
    borderRadius: THEME.radius.md,
    padding: '10px 12px',
    fontFamily: THEME.fonts.mono,
    fontSize: 13
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    background: c.primary,
    color: c.onPrimary,
    border: `2px solid ${c.primary}`,
    borderRadius: THEME.radius.md,
    padding: '10px 16px',
    fontFamily: THEME.fonts.mono,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-block'
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    background: 'transparent',
    color: c.onSurface,
    border: `2px solid ${c.outline}`,
    borderRadius: THEME.radius.md,
    padding: '10px 16px',
    fontFamily: THEME.fonts.mono,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-block'
  };
}

function logBox(): React.CSSProperties {
  return {
    background: c.surfaceContainerLowest,
    border: `2px solid ${c.outline}`,
    borderRadius: THEME.radius.md,
    padding: 10,
    fontFamily: THEME.fonts.mono,
    fontSize: 11,
    color: c.logInfo,
    overflowX: 'auto',
    marginBottom: 12
  };
}
