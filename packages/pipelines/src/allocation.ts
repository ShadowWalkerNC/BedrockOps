import { createHash, randomBytes } from 'crypto';

export type DnsRecordType = 'A' | 'SRV';

export interface DnsRecord {
  id: string;
  subdomain: string;
  fqdn: string;
  type: DnsRecordType;
  content: string;
  port?: number;
  target?: string;
  ttl: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDnsRecordParams {
  subdomain: string;
  type: DnsRecordType;
  content: string;
  port?: number;
  target?: string;
  ttl?: number;
  domainSuffix?: string;
}

export interface SubdomainProvisionResult {
  subdomain: string;
  fqdn: string;
  aRecord: DnsRecord;
  srvRecord: DnsRecord;
  allocatedPort: number;
  stub: boolean;
  /** Present when a live Cloudflare attempt was skipped or failed. */
  liveError?: string;
}

export interface PortLease {
  port: number;
  serverId: string;
  allocatedAt: Date;
}

const DEFAULT_PORT_MIN = 19132;
const DEFAULT_PORT_MAX = 19999;

/**
 * R5.1 — UDP port pool reservation (19132–19999).
 */
export class PortPool {
  private leases = new Map<number, PortLease>();

  constructor(
    private readonly minPort = DEFAULT_PORT_MIN,
    private readonly maxPort = DEFAULT_PORT_MAX
  ) {
    if (minPort > maxPort) {
      throw new Error('PortPool minPort must be <= maxPort');
    }
  }

  public allocate(serverId: string, preferred?: number): PortLease {
    if (preferred !== undefined) {
      this.assertInRange(preferred);
      if (this.leases.has(preferred)) {
        throw new Error(`Port ${preferred} is already allocated`);
      }
      const lease: PortLease = { port: preferred, serverId, allocatedAt: new Date() };
      this.leases.set(preferred, lease);
      return lease;
    }

    for (let port = this.minPort; port <= this.maxPort; port++) {
      if (!this.leases.has(port)) {
        const lease: PortLease = { port, serverId, allocatedAt: new Date() };
        this.leases.set(port, lease);
        return lease;
      }
    }
    throw new Error(`Port pool exhausted (${this.minPort}-${this.maxPort})`);
  }

  public release(port: number): boolean {
    return this.leases.delete(port);
  }

  public releaseByServer(serverId: string): number {
    let count = 0;
    for (const [port, lease] of this.leases.entries()) {
      if (lease.serverId === serverId) {
        this.leases.delete(port);
        count += 1;
      }
    }
    return count;
  }

  public isAvailable(port: number): boolean {
    this.assertInRange(port);
    return !this.leases.has(port);
  }

  public getLease(port: number): PortLease | undefined {
    return this.leases.get(port);
  }

  public listLeases(): PortLease[] {
    return Array.from(this.leases.values());
  }

  public remaining(): number {
    return this.maxPort - this.minPort + 1 - this.leases.size;
  }

  private assertInRange(port: number): void {
    if (port < this.minPort || port > this.maxPort) {
      throw new Error(`Port ${port} outside pool range ${this.minPort}-${this.maxPort}`);
    }
  }
}

export const defaultPortPool = new PortPool();

/**
 * Generate a short playable subdomain label (e.g. abc123).
 */
export function generateSubdomain(seed?: string): string {
  if (seed) {
    return createHash('sha1').update(seed).digest('hex').slice(0, 6);
  }
  return randomBytes(3).toString('hex');
}

/**
 * R5.1 — DNS provider for play.* subdomain A + Minecraft SRV records.
 * Without Cloudflare credentials this is an honest in-memory stub.
 * When CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID are set, provisionSubdomain
 * POSTs real DNS records to the Cloudflare API (never pretends success on failure).
 */
export class DnsProvider {
  private records = new Map<string, DnsRecord>();

  constructor(
    private readonly baseDomain = 'play.bedrockops.io',
    private readonly cloudflareToken?: string,
    private readonly cloudflareZoneId?: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): DnsProvider {
    return new DnsProvider(
      env.PLAY_BASE_DOMAIN || 'play.bedrockops.io',
      env.CLOUDFLARE_API_TOKEN,
      env.CLOUDFLARE_ZONE_ID
    );
  }

  public isLive(): boolean {
    return !!this.cloudflareToken && !!this.cloudflareZoneId;
  }

  public createRecord(params: CreateDnsRecordParams): DnsRecord {
    const domainSuffix = params.domainSuffix || this.baseDomain;
    const fqdn = `${params.subdomain}.${domainSuffix}`;
    const now = new Date();
    const record: DnsRecord = {
      id: `dns_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      subdomain: params.subdomain,
      fqdn,
      type: params.type,
      content: params.content,
      port: params.port,
      target: params.target,
      ttl: params.ttl || 120,
      createdAt: now,
      updatedAt: now
    };
    this.records.set(record.id, record);
    return record;
  }

  /**
   * Always writes an in-memory record. Use `provisionSubdomain` (async) for the
   * full A+SRV flow including optional Cloudflare persistence.
   */
  public provisionSubdomain(
    subdomain: string,
    nodeIp: string,
    allocatedPort = 19132
  ): SubdomainProvisionResult {
    const fqdn = `${subdomain}.${this.baseDomain}`;
    const aRecord = this.createRecord({
      subdomain,
      type: 'A',
      content: nodeIp,
      ttl: 120
    });
    const srvRecord = this.createRecord({
      subdomain: `_minecraft._udp.${subdomain}`,
      type: 'SRV',
      content: `0 5 ${allocatedPort} ${fqdn}`,
      port: allocatedPort,
      target: fqdn,
      ttl: 120
    });

    let liveError: string | undefined;
    if (!this.cloudflareToken) {
      liveError = 'CLOUDFLARE_API_TOKEN unset — DNS kept in-memory only.';
    } else if (!this.cloudflareZoneId) {
      liveError = 'CLOUDFLARE_ZONE_ID unset — DNS kept in-memory only.';
    }

    return {
      subdomain,
      fqdn,
      aRecord,
      srvRecord,
      allocatedPort,
      stub: true,
      liveError
    };
  }

  /**
   * Provision A + SRV records. Persists to Cloudflare when token+zone are set;
   * otherwise returns an honest in-memory stub (never claims live DNS succeeded).
   */
  public async provisionSubdomainLive(
    subdomain: string,
    nodeIp: string,
    allocatedPort = 19132
  ): Promise<SubdomainProvisionResult> {
    const base = this.provisionSubdomain(subdomain, nodeIp, allocatedPort);
    if (!this.cloudflareToken || !this.cloudflareZoneId) {
      return base;
    }

    try {
      const aCf = await this.postCloudflareRecord({
        type: 'A',
        name: base.aRecord.fqdn,
        content: nodeIp,
        ttl: base.aRecord.ttl
      });
      const srvCf = await this.postCloudflareRecord({
        type: 'SRV',
        name: `_minecraft._udp.${subdomain}.${this.baseDomain}`,
        data: {
          service: '_minecraft',
          proto: '_udp',
          name: subdomain,
          priority: 0,
          weight: 5,
          port: allocatedPort,
          target: base.fqdn
        },
        ttl: base.srvRecord.ttl
      });

      // Replace local ids with Cloudflare record ids when available.
      this.records.delete(base.aRecord.id);
      this.records.delete(base.srvRecord.id);
      const aRecord = { ...base.aRecord, id: aCf.id };
      const srvRecord = { ...base.srvRecord, id: srvCf.id };
      this.records.set(aRecord.id, aRecord);
      this.records.set(srvRecord.id, srvRecord);

      return {
        ...base,
        aRecord,
        srvRecord,
        stub: false,
        liveError: undefined
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...base,
        stub: true,
        liveError: `Cloudflare DNS API failed: ${message}`
      };
    }
  }

  private async postCloudflareRecord(body: Record<string, unknown>): Promise<{ id: string }> {
    const url = `https://api.cloudflare.com/client/v4/zones/${this.cloudflareZoneId}/dns_records`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cloudflareToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const json = (await res.json()) as {
      success?: boolean;
      result?: { id?: string };
      errors?: { message?: string }[];
    };
    if (!res.ok || !json.success || !json.result?.id) {
      const detail = json.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return { id: json.result.id };
  }

  public deleteSubdomain(subdomain: string): { deletedCount: number } {
    let deletedCount = 0;
    const targetFqdn = `${subdomain}.${this.baseDomain}`;
    for (const [id, record] of this.records.entries()) {
      if (
        record.subdomain === subdomain ||
        record.fqdn === targetFqdn ||
        record.subdomain.endsWith(`.${subdomain}`)
      ) {
        this.records.delete(id);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  }

  public getRecordBySubdomain(subdomain: string): DnsRecord[] {
    const targetFqdn = `${subdomain}.${this.baseDomain}`;
    return Array.from(this.records.values()).filter(
      (r) =>
        r.subdomain === subdomain ||
        r.fqdn === targetFqdn ||
        r.subdomain.endsWith(`.${subdomain}`)
    );
  }

  public verifyRecordRouting(fqdn: string, port?: number): { valid: boolean; records: DnsRecord[] } {
    const matching = Array.from(this.records.values()).filter(
      (r) => r.fqdn === fqdn || r.target === fqdn
    );
    if (matching.length === 0) return { valid: false, records: [] };
    if (port !== undefined) {
      return { valid: matching.some((r) => r.port === port), records: matching };
    }
    return { valid: true, records: matching };
  }

  public listRecords(): DnsRecord[] {
    return Array.from(this.records.values());
  }

  public clearRecords(): void {
    this.records.clear();
  }
}

export interface NetworkAllocation {
  serverId: string;
  subdomain: string;
  fqdn: string;
  port: number;
  nodeIp: string;
  dns: SubdomainProvisionResult;
  lease: PortLease;
}

/**
 * Allocate a play subdomain + UDP port for a Bedrock server.
 */
export class SubdomainAllocator {
  constructor(
    private readonly portPool: PortPool = defaultPortPool,
    private readonly dns: DnsProvider = DnsProvider.fromEnv()
  ) {}

  public async allocate(input: {
    serverId: string;
    nodeIp: string;
    subdomain?: string;
    preferredPort?: number;
  }): Promise<NetworkAllocation> {
    const subdomain = (input.subdomain || generateSubdomain(input.serverId)).toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      throw new Error(`Invalid subdomain label: ${subdomain}`);
    }

    const lease = this.portPool.allocate(input.serverId, input.preferredPort);
    const dns = await this.dns.provisionSubdomainLive(subdomain, input.nodeIp, lease.port);

    return {
      serverId: input.serverId,
      subdomain,
      fqdn: dns.fqdn,
      port: lease.port,
      nodeIp: input.nodeIp,
      dns,
      lease
    };
  }

  public deallocate(
    serverId: string,
    subdomain?: string
  ): { portsReleased: number; dnsDeleted: number } {
    const portsReleased = this.portPool.releaseByServer(serverId);
    const dnsDeleted = subdomain ? this.dns.deleteSubdomain(subdomain).deletedCount : 0;
    return { portsReleased, dnsDeleted };
  }
}
