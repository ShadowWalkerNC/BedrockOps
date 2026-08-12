import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { AppShell } from '../components/AppShell';
import { Card, Button, Modal } from '@mc-admin/ui';
import { apiFetch, getAuthToken } from '../lib/api-client';

interface AddonPack {
  id: string;
  name: string;
  version: string;
  author: string;
  category: 'endstone' | 'behavior' | 'resource' | 'pocketmine';
  description: string;
  downloads: number;
  rating: number;
  icon: string;
  fileExtension: '.whl' | '.mcpack' | '.phar';
  tags: string[];
}

const FEATURED_PACKS: AddonPack[] = [
  {
    id: 'pack_chat_guard',
    name: 'Endstone ChatGuard',
    version: '1.4.0',
    author: 'BedrockOps Team',
    category: 'endstone',
    description: 'Advanced Python-powered chat filter, spam rate-limiting, and bad word censorship for Endstone BDS.',
    downloads: 14200,
    rating: 4.9,
    icon: '🛡️',
    fileExtension: '.whl',
    tags: ['endstone', 'moderation', 'security']
  },
  {
    id: 'pack_economy_plus',
    name: 'Vault Economy & Shop',
    version: '2.1.0',
    author: 'Endstone Ecosystem',
    category: 'endstone',
    description: 'Complete player-to-player trading, virtual currency system, and chest shop addon.',
    downloads: 9800,
    rating: 4.8,
    icon: '💰',
    fileExtension: '.whl',
    tags: ['endstone', 'economy', 'shop']
  },
  {
    id: 'pack_custom_survival_items',
    name: 'Survival Plus Addon',
    version: '3.0.2',
    author: 'Mojang Creator Guild',
    category: 'behavior',
    description: 'Custom weapons, armor sets, and expanded crafting recipes using standard Minecraft Script API v2.',
    downloads: 24100,
    rating: 4.7,
    icon: '⚔️',
    fileExtension: '.mcpack',
    tags: ['behavior', 'script-api', 'survival']
  },
  {
    id: 'pack_claims_protection',
    name: 'LandClaim Protection',
    version: '1.8.5',
    author: 'BedrockOps Team',
    category: 'endstone',
    description: 'Grief-prevention land claiming tool allowing players to protect build zones with golden shovels.',
    downloads: 18300,
    rating: 4.9,
    icon: '🏰',
    fileExtension: '.whl',
    tags: ['endstone', 'protection', 'grief-prevention']
  },
  {
    id: 'pack_pocketmine_essentials',
    name: 'PocketMine EssentialsPE',
    version: '2.0.0',
    author: 'PMMP Devs',
    category: 'pocketmine',
    description: 'Core player utility commands (/warp, /spawn, /home, /kit) for PocketMine-MP server runtimes.',
    downloads: 31000,
    rating: 4.6,
    icon: '⚡',
    fileExtension: '.phar',
    tags: ['pocketmine', 'essentials']
  }
];

export default function MarketplacePage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPack, setSelectedPack] = useState<AddonPack | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [servers, setServers] = useState<any[]>([]);
  const [targetServerId, setTargetServerId] = useState<string>('');

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      apiFetch<{ servers: any[] }>('/servers')
        .then((res) => {
          setServers(res.servers || []);
          if (res.servers?.length > 0) setTargetServerId(res.servers[0].id);
        })
        .catch(() => {});
    }
  }, []);

  const filteredPacks = FEATURED_PACKS.filter((pack) => {
    const matchesCat = activeCategory === 'all' || pack.category === activeCategory;
    const matchesSearch =
      pack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pack.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleInstall = async (pack: AddonPack) => {
    setInstallingId(pack.id);
    setInstallSuccess(null);

    // Simulate mounting addon to local server workspace
    setTimeout(() => {
      setInstallingId(null);
      setInstallSuccess(`Successfully mounted ${pack.name} (${pack.fileExtension}) to server ${targetServerId || 'srv_bedrock_1'}!`);
      setSelectedPack(null);
    }, 800);
  };

  return (
    <AppShell title="Addon Marketplace">
      <Head>
        <title>Addon & Plugin Marketplace | BedrockOps</title>
      </Head>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 0' }}>
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1b2838 0%, #2a475e 100%)',
            padding: 32,
            borderRadius: 16,
            marginBottom: 24,
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>🛒</span> BedrockOps Addon & Plugin Marketplace
          </div>
          <div style={{ color: '#c7d5e0', fontSize: 15, maxWidth: 800 }}>
            Discover and install vetted Endstone Python plugins (<code style={{ color: '#66c0f4' }}>.whl</code>), Script API behavior packs (<code style={{ color: '#66c0f4' }}>.mcpack</code>), and PocketMine extensions with 1-click mounting to your local Bedrock server.
          </div>

          {/* Search & Filter Bar */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search plugins, addons, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: 260,
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'endstone', 'behavior', 'pocketmine'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeCategory === cat ? '#66c0f4' : 'rgba(255,255,255,0.1)',
                    color: activeCategory === cat ? '#000' : '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {installSuccess && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: 'rgba(46, 204, 113, 0.15)',
              border: '1px solid #2ecc71',
              color: '#2ecc71',
              fontWeight: 600,
              marginBottom: 20
            }}
          >
            ✓ {installSuccess}
          </div>
        )}

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {filteredPacks.map((pack) => (
            <Card
              key={pack.id}
              style={{
                background: '#16202d',
                borderColor: '#2a475e',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 20,
                borderRadius: 12
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ fontSize: 36, background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 10 }}>{pack.icon}</div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: pack.category === 'endstone' ? '#9b59b6' : pack.category === 'behavior' ? '#e67e22' : '#3498db',
                      color: '#fff',
                      textTransform: 'uppercase'
                    }}
                  >
                    {pack.category} ({pack.fileExtension})
                  </span>
                </div>

                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{pack.name}</div>
                <div style={{ fontSize: 12, color: '#8f98a0', marginBottom: 10 }}>
                  By <strong>{pack.author}</strong> · v{pack.version}
                </div>
                <div style={{ fontSize: 13, color: '#acb2b8', lineHeight: 1.5, marginBottom: 16 }}>{pack.description}</div>
              </div>

              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {pack.tags.map((t) => (
                    <span key={t} style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', color: '#8f98a0', padding: '2px 8px', borderRadius: 4 }}>
                      #{t}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#66c0f4' }}>
                    ★ {pack.rating} · {pack.downloads.toLocaleString()} downloads
                  </div>
                  <Button variant="primary" size="small" onClick={() => setSelectedPack(pack)}>
                    Mount Addon
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Modal */}
        {selectedPack && (
          <Modal title={`Mount ${selectedPack.name}`} onClose={() => setSelectedPack(null)}>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 14, color: '#c7d5e0', marginBottom: 16 }}>
                Select the target Bedrock Dedicated Server instance to mount <strong>{selectedPack.name}</strong> ({selectedPack.fileExtension}):
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#8f98a0', marginBottom: 6 }}>Target Server Instance:</label>
                <select
                  value={targetServerId}
                  onChange={(e) => setTargetServerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 6,
                    background: '#1b2838',
                    color: '#fff',
                    border: '1px solid #2a475e'
                  }}
                >
                  {servers.length > 0 ? (
                    servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id}) — {s.engine || 'BDS'}
                      </option>
                    ))
                  ) : (
                    <option value="srv_bedrock_1">Main Survival Realm (srv_bedrock_1)</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="secondary" onClick={() => setSelectedPack(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => handleInstall(selectedPack)} disabled={installingId === selectedPack.id}>
                  {installingId === selectedPack.id ? 'Mounting...' : 'Confirm Installation'}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
