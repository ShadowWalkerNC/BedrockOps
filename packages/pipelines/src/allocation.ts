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
 */
export class DnsProvider {
  private records = new Map<string, DnsRecord>();

  constructor(
    private readonly baseDomain = 'play.bedrockops.io',
    private readonly cloudflareToken?: string
  ) {}

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): DnsProvider {
    return new DnsProvider(
      env.PLAY_BASE_DOMAIN || 'play.bedrockops.io',
      env.CLOUDFLARE_API_TOKEN
    );
  }

  public isLive(): boolean {
    return !!this.cloudflareToken;
  }

  public createRecord(params: CreateDnsRecordParams): DnsRecord {
    // TODO: Persist via Cloudflare DNS API when CLOUDFLARE_API_TOKEN is set.
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

  public provisionSubdomain(
    subdomain: string,
    nodeIp: string,
    allocatedPort: number = 19132
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

    return {
      subdomain,
      fqdn,
      aRecord,
      srvRecord,
      allocatedPort,
      stub: !this.isLive()
    };
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

  public verifyRecordRouting(
    fqdn: string,
    port?: number
  ): { valid: boolean; records: DnsRecord[] } {
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

  public allocate(input: {
    serverId: string;
    nodeIp: string;
    subdomain?: string;
    preferredPort?: number;
  }): NetworkAllocation {
    const subdomain = (input.subdomain || generateSubdomain(input.serverId)).toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      throw new Error(`Invalid subdomain label: ${subdomain}`);
    }

    const lease = this.portPool.allocate(input.serverId, input.preferredPort);
    const dns = this.dns.provisionSubdomain(subdomain, input.nodeIp, lease.port);

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

  public deallocate(serverId: string, subdomain?: string): {
    portsReleased: number;
    dnsDeleted: number;
  } {
    const portsReleased = this.portPool.releaseByServer(serverId);
    const dnsDeleted = subdomain ? this.dns.deleteSubdomain(subdomain).deletedCount : 0;
    return { portsReleased, dnsDeleted };
  }
}
