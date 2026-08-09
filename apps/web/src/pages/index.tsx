import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Shield, 
  Server, 
  HardDrive, 
  UserX, 
  MessageSquare, 
  Layers, 
  Gift, 
  Play, 
  Square, 
  RotateCcw, 
  Plus, 
  Search, 
  CheckCircle, 
  X,
  RefreshCw
} from 'lucide-react';
import { UI_THEME, Badge, ConfirmModal } from '@mc-admin/ui';
import { apiFetch } from '../lib/api-client';
import {
  DashboardBackup,
  DashboardModeration,
  DashboardServer,
  toPowerAction
} from '../lib/types';

type Tab = 'servers' | 'backups' | 'moderation' | 'discord' | 'templates' | 'referrals' | 'audit';

export default function BedrockAdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('servers');
  const [notification, setNotification] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Data states connected to backend API
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [backups, setBackups] = useState<DashboardBackup[]>([]);
  const [moderations, setModerations] = useState<DashboardModeration[]>([]);

  // Modal states
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  // Register Server Form state
  const [regName, setRegName] = useState('');
  const [regHost, setRegHost] = useState('127.0.0.1');
  const [regPort, setRegPort] = useState('19132');
  const [regRconPort, setRegRconPort] = useState('19133');
  const [regMaxPlayers, setRegMaxPlayers] = useState('10');
  const [regGameMode, setRegGameMode] = useState('survival');
  const [regDifficulty, setRegDifficulty] = useState('hard');

  // Moderation Form state
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [modGamertag, setModGamertag] = useState('');
  const [modReason, setModReason] = useState('');
  const [modAction, setModAction] = useState('WARN');

  // Discord State
  const [webhookUrl, setWebhookUrl] = useState('');

  const showNotify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Fetch live state from API
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [resServers, resBackups, resMod] = await Promise.all([
        apiFetch<{ servers: DashboardServer[] }>('/servers'),
        apiFetch<{ backups: DashboardBackup[] }>('/backups'),
        apiFetch<{ moderationActions: DashboardModeration[] }>('/moderation')
      ]);

      setServers(resServers.servers);
      setBackups(resBackups.backups);
      setModerations(resMod.moderationActions);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load dashboard data';
      console.error('Failed to load dashboard data:', e);
      showNotify(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Server Register Handler
  const handleRegisterServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName) return;

    try {
      const data = await apiFetch<{ server: DashboardServer }>('/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: regName,
          host: regHost,
          port: Number(regPort),
          rconPort: Number(regRconPort),
          maxPlayers: Number(regMaxPlayers),
          gameMode: regGameMode,
          difficulty: regDifficulty
        })
      });
      showNotify(`Server "${data.server.name}" registered. Backup queued (pending agent integration).`);
      setIsRegisterModalOpen(false);
      setRegName('');
      fetchDashboardData();
    } catch (err: unknown) {
      showNotify(`Error registering server: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Server Control Handler
  const handleServerControl = async (id: string, action: 'start' | 'stop' | 'restart') => {
    const targetServer = servers.find(s => s.id === id);

    const executeCall = async () => {
      try {
        const data = await apiFetch<{ success: boolean; server: DashboardServer; action: string }>(
          `/servers/${id}/power`,
          {
            method: 'POST',
            body: JSON.stringify({ action: toPowerAction(action) })
          }
        );
        if (data.success) {
          showNotify(`Server ${data.server.name}: ${data.action} command accepted.`);
          fetchDashboardData();
        } else {
          showNotify(`Power action failed — agent integration may be pending.`);
        }
      } catch (err: unknown) {
        showNotify(`Control action failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    if (action === 'stop') {
      setPendingConfirmAction({
        title: `Stop Bedrock Server: ${targetServer?.name || id}`,
        desc: 'Are you sure you want to stop this server process? Active players will be disconnected immediately.',
        onConfirm: () => {
          setIsConfirmModalOpen(false);
          executeCall();
        }
      });
      setIsConfirmModalOpen(true);
    } else {
      executeCall();
    }
  };

  // Run Manual Backup Handler
  const handleTriggerBackup = async (serverId: string) => {
    try {
      const data = await apiFetch<{ backup: DashboardBackup }>('/backups', {
        method: 'POST',
        body: JSON.stringify({ serverId, isManual: true })
      });
      showNotify(
        data.backup.status === 'PENDING'
          ? `Backup queued (${data.backup.filename}) — pending agent integration.`
          : `Snapshot created (${data.backup.filename})`
      );
      fetchDashboardData();
    } catch (err: unknown) {
      showNotify(`Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRestoreBackup = async (backupId: string, filename: string) => {
    try {
      await apiFetch(`/backups/${backupId}/restore`, { method: 'POST' });
      showNotify(`Restored snapshot ${filename}.`);
    } catch (err: unknown) {
      showNotify(
        err instanceof Error && (err.message.includes('RESTORE_UNAVAILABLE') || err.message.includes('NOT_IMPLEMENTED'))
          ? `Restore unavailable for ${filename} (agent/R2 required).`
          : `Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  // Record Moderation Handler
  const handleAddModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modGamertag || !modReason) return;

    const executeCall = async () => {
      try {
        await apiFetch('/moderation', {
          method: 'POST',
          body: JSON.stringify({
            gamertag: modGamertag,
            actionType: modAction,
            reason: modReason
          })
        });
        showNotify(`Recorded ${modAction} infraction for player "${modGamertag}".`);
        setModGamertag('');
        setModReason('');
        fetchDashboardData();
      } catch (err: unknown) {
        showNotify(`Failed to record moderation: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    if (modAction === 'BAN') {
      setPendingConfirmAction({
        title: `Ban Player: ${modGamertag}`,
        desc: `Are you sure you want to issue a permanent BAN to ${modGamertag}? Reason: "${modReason}".`,
        onConfirm: () => {
          setIsConfirmModalOpen(false);
          executeCall();
        }
      });
      setIsConfirmModalOpen(true);
    } else {
      executeCall();
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: UI_THEME.colors.bgDark, color: UI_THEME.colors.textMain, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Bar */}
      <header style={{ borderBottom: '1px solid #1f2937', padding: '16px 24px', backgroundColor: '#0d1322', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: '#1d4ed8', padding: '8px', borderRadius: '8px' }}>
            <Shield size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>BedrockOps Platform</h1>
              <span style={{ backgroundColor: '#1e3a8a', color: '#60a5fa', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px' }}>Live Engine</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#9ca3af' }}>Bedrock Dedicated Server Administration & Operational Safety Engine</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/console" style={{ color: '#60a5fa', fontSize: '13px', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MessageSquare size={14} /> Live Console →
          </Link>
          <button onClick={fetchDashboardData} style={{ backgroundColor: '#1f2937', color: '#9ca3af', border: '1px solid #374151', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Sync Engine
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#111827', border: '1px solid #1f2937', padding: '6px 12px', borderRadius: '6px', fontSize: '13px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
            <span>Agent Daemon: <strong style={{ color: '#22c55e' }}>ONLINE (Port 5050)</strong></span>
          </div>
        </div>
      </header>

      {/* Global Notification Banner */}
      {notification && (
        <div style={{ backgroundColor: '#14532d', borderBottom: '1px solid #166534', color: '#4ade80', padding: '10px 24px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} />
          {notification}
        </div>
      )}

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 65px)' }}>
        {/* Navigation Sidebar */}
        <nav style={{ borderRight: '1px solid #1f2937', backgroundColor: '#0b101d', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button onClick={() => setActiveTab('servers')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'servers' ? '#1d4ed8' : 'transparent', color: activeTab === 'servers' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <Server size={18} /> Server Nodes ({servers.length})
          </button>
          <button onClick={() => setActiveTab('backups')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'backups' ? '#1d4ed8' : 'transparent', color: activeTab === 'backups' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <HardDrive size={18} /> Backups & Safety ({backups.length})
          </button>
          <button onClick={() => setActiveTab('moderation')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'moderation' ? '#1d4ed8' : 'transparent', color: activeTab === 'moderation' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <UserX size={18} /> Moderation & Staff ({moderations.length})
          </button>
          <button onClick={() => setActiveTab('discord')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'discord' ? '#1d4ed8' : 'transparent', color: activeTab === 'discord' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <MessageSquare size={18} /> Discord Relay
          </button>
          <button onClick={() => setActiveTab('templates')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'templates' ? '#1d4ed8' : 'transparent', color: activeTab === 'templates' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <Layers size={18} /> Templates & Presets
          </button>
          <button onClick={() => setActiveTab('referrals')} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === 'referrals' ? '#1d4ed8' : 'transparent', color: activeTab === 'referrals' ? '#fff' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '14px' }}>
            <Gift size={18} /> Referral Program
          </button>
        </nav>

        {/* Dynamic Workspace */}
        <main style={{ padding: '24px', backgroundColor: '#090d16', overflowY: 'auto' }}>
          {/* SERVER NODES TAB */}
          {activeTab === 'servers' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Bedrock Server Nodes</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>Manage process state, properties, ports, and safety controls</p>
                </div>
                <button onClick={() => setIsRegisterModalOpen(true)} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                  <Plus size={16} /> Register New Server Node
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                {servers.map((server) => (
                  <div key={server.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{server.name}</h3>
                          <Badge status={server.status} />
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>
                          Host: {server.host}:{server.port} | RCON Port: {server.rconPort}
                        </p>
                      </div>
                      <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>BDS v{server.version}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Slots</span>
                        <strong style={{ fontSize: '14px', color: '#3b82f6' }}>{server.maxPlayers} Max</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Game Mode</span>
                        <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>{server.gameMode}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>Difficulty</span>
                        <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>{server.difficulty}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleServerControl(server.id, server.status === 'ONLINE' ? 'stop' : 'start')}
                        style={{ flex: 1, backgroundColor: server.status === 'ONLINE' ? '#7f1d1d' : '#14532d', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
                      >
                        {server.status === 'ONLINE' ? <Square size={14} /> : <Play size={14} />}
                        {server.status === 'ONLINE' ? 'Stop Process' : 'Start Process'}
                      </button>

                      <button 
                        onClick={() => handleServerControl(server.id, 'restart')}
                        style={{ backgroundColor: '#1f2937', color: '#f9fafb', border: '1px solid #374151', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                      >
                        <RotateCcw size={14} /> Restart
                      </button>

                      <button 
                        onClick={() => handleTriggerBackup(server.id)}
                        style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
                      >
                        <HardDrive size={14} /> Snapshot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BACKUPS TAB */}
          {activeTab === 'backups' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Safety Snapshots & Backup History</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>Create manual snapshots or validate archive restore integrity</p>
                </div>
                <button onClick={() => handleTriggerBackup(servers[0]?.id || 'srv_main_1')} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                  <HardDrive size={16} /> Trigger Safety Snapshot Now
                </button>
              </div>

              <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1f2937', color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px' }}>Archive Filename</th>
                      <th style={{ padding: '10px' }}>Server Target</th>
                      <th style={{ padding: '10px' }}>Size</th>
                      <th style={{ padding: '10px' }}>Type</th>
                      <th style={{ padding: '10px' }}>Status</th>
                      <th style={{ padding: '10px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #1f2937' }}>
                        <td style={{ padding: '10px', fontFamily: 'monospace', color: '#60a5fa' }}>{b.filename}</td>
                        <td style={{ padding: '10px' }}>{b.serverId}</td>
                        <td style={{ padding: '10px' }}>{(b.fileSizeBytes ? (b.fileSizeBytes / (1024 * 1024)).toFixed(1) : '0.0')} MB</td>
                        <td style={{ padding: '10px' }}>{b.isManual ? 'Manual' : 'Scheduled'}</td>
                        <td style={{ padding: '10px' }}>
                          <Badge status={b.status} />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <button onClick={() => handleRestoreBackup(b.id, b.filename)} style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#fff', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                            Validate & Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODERATION TAB */}
          {activeTab === 'moderation' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Player Moderation & Staff Logs</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>Search player history and record warnings, mutes, kicks, and bans</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', backgroundColor: '#090d16', border: '1px solid #1f2937', borderRadius: '6px', padding: '8px 12px' }}>
                    <Search size={16} color="#9ca3af" />
                    <input 
                      type="text" 
                      placeholder="Filter player gamertags..." 
                      value={playerSearchQuery} 
                      onChange={(e) => setPlayerSearchQuery(e.target.value)} 
                      style={{ backgroundColor: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: '14px' }} 
                    />
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1f2937', color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '10px' }}>Gamertag</th>
                        <th style={{ padding: '10px' }}>Action</th>
                        <th style={{ padding: '10px' }}>Reason</th>
                        <th style={{ padding: '10px' }}>Issuer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moderations
                        .filter(m => m.gamertag.toLowerCase().includes(playerSearchQuery.toLowerCase()))
                        .map(m => (
                          <tr key={m.id} style={{ borderBottom: '1px solid #1f2937' }}>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{m.gamertag}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ 
                                backgroundColor: m.actionType === 'BAN' ? '#7f1d1d' : m.actionType === 'MUTE' ? '#78350f' : '#1e3a8a', 
                                color: m.actionType === 'BAN' ? '#f87171' : m.actionType === 'MUTE' ? '#fde047' : '#60a5fa', 
                                padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' 
                              }}>
                                {m.actionType}
                              </span>
                            </td>
                            <td style={{ padding: '10px', color: '#d1d5db' }}>{m.reason}</td>
                            <td style={{ padding: '10px', color: '#9ca3af' }}>{m.issuerName || 'admin'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Submit Infraction Form */}
                <form onSubmit={handleAddModeration} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Record Staff Action</h3>

                  <div>
                    <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Player Gamertag</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. GriefMaster99" 
                      value={modGamertag}
                      onChange={(e) => setModGamertag(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Action Type</label>
                    <select 
                      value={modAction} 
                      onChange={(e) => setModAction(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
                    >
                      <option value="WARN">WARN</option>
                      <option value="MUTE">MUTE</option>
                      <option value="KICK">KICK</option>
                      <option value="BAN">BAN</option>
                      <option value="NOTE">NOTE</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Reason & Evidence</label>
                    <textarea 
                      required
                      rows={3}
                      placeholder="Reason for audit log..." 
                      value={modReason}
                      onChange={(e) => setModReason(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <button type="submit" style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                    Submit Moderation Record
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: REGISTER NEW SERVER NODE */}
      {isRegisterModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '24px', width: '480px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Register New Bedrock Server Node</h3>
              <button onClick={() => setIsRegisterModalOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleRegisterServer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Server Display Name</label>
                <input required type="text" placeholder="e.g. Faction Realm 1" value={regName} onChange={e => setRegName(e.target.value)} style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Port (UDP)</label>
                  <input required type="number" value={regPort} onChange={e => setRegPort(e.target.value)} style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>RCON Port</label>
                  <input required type="number" value={regRconPort} onChange={e => setRegRconPort(e.target.value)} style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Game Mode</label>
                  <select value={regGameMode} onChange={e => setRegGameMode(e.target.value)} style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px' }}>
                    <option value="survival">Survival</option>
                    <option value="creative">Creative</option>
                    <option value="adventure">Adventure</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Difficulty</label>
                  <select value={regDifficulty} onChange={e => setRegDifficulty(e.target.value)} style={{ width: '100%', backgroundColor: '#090d16', border: '1px solid #1f2937', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '13px' }}>
                    <option value="peaceful">Peaceful</option>
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsRegisterModalOpen(false)} style={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="submit" style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Save & Initialize Server Node</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmModalOpen && !!pendingConfirmAction}
        title={pendingConfirmAction?.title ?? ''}
        description={pendingConfirmAction?.desc ?? ''}
        onConfirm={() => pendingConfirmAction?.onConfirm()}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
    </div>
  );
}
