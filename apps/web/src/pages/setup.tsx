import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@mc-admin/ui';
import { AppShell } from '../components/AppShell';
import { apiFetch, ensureAuthenticated } from '../lib/api-client';

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
  const [allocateNetwork, setAllocateNetwork] = useState(true);
  const [nodeIp, setNodeIp] = useState('127.0.0.1');
  const [subdomain, setSubdomain] = useState('');
  const [server, setServer] = useState<SetupServer | null>(null);
  const [run, setRun] = useState<PipelineRun | null>(null);

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
      .then(() => setReady(true))
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
      }>('/provisioning/setup', {
        method: 'POST',
        body: JSON.stringify({
          serverName,
          templateId: 'tmpl_vanilla_survival',
          allocateNetwork,
          nodeIp: allocateNetwork ? nodeIp : undefined,
          subdomain: allocateNetwork && subdomain.trim() ? subdomain.trim() : undefined
        })
      });
      setServer(res.server);
      setRun(res.run);
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
          Create a realm, optionally allocate a play subdomain, onboard a console player, and take a first backup.
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
          <Field label="Template">
            <input value="tmpl_vanilla_survival" disabled style={input()} />
          </Field>
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
          <button disabled={busy || !serverName.trim()} onClick={createRealm} style={primaryBtn()}>
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
              run ? `Pipeline ${run.status}` : ''
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
              backupNote || 'Backup step complete'
            ]}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/servers/${server.id}`} style={{ ...primaryBtn(), textDecoration: 'none' }}>
              Open Ops Room →
            </Link>
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
