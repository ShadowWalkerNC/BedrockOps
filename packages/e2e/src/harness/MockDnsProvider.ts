/**
 * MockDnsProvider.ts
 * E2E Test Harness Mock for Cloudflare DNS Allocation & Subdomain Routing
 */

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
}

export class MockDnsProvider {
  private records: Map<string, DnsRecord> = new Map();
  private baseDomain: string;

  constructor(baseDomain: string = 'play.bedrockops.io') {
    this.baseDomain = baseDomain;
  }

  /**
   * Create a single DNS record (A or SRV)
   */
  public createRecord(params: CreateDnsRecordParams): DnsRecord {
    const domainSuffix = params.domainSuffix || this.baseDomain;
    const fqdn = `${params.subdomain}.${domainSuffix}`;
    const id = `dns-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();

    const record: DnsRecord = {
      id,
      subdomain: params.subdomain,
      fqdn,
      type: params.type,
      content: params.content,
      port: params.port,
      target: params.target,
      ttl: params.ttl || 120,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(id, record);
    return record;
  }

  /**
   * Provision both A and SRV DNS records for a server subdomain
   */
  public provisionSubdomain(
    subdomain: string,
    nodeIp: string,
    allocatedPort: number = 19132
  ): SubdomainProvisionResult {
    const fqdn = `${subdomain}.${this.baseDomain}`;

    // Create A Record: subdomain.play.bedrockops.io -> nodeIp
    const aRecord = this.createRecord({
      subdomain,
      type: 'A',
      content: nodeIp,
      ttl: 120,
    });

    // Create SRV Record: _minecraft._udp.subdomain.play.bedrockops.io -> allocatedPort
    const srvRecord = this.createRecord({
      subdomain: `_minecraft._udp.${subdomain}`,
      type: 'SRV',
      content: `0 5 ${allocatedPort} ${fqdn}`,
      port: allocatedPort,
      target: fqdn,
      ttl: 120,
    });

    return {
      subdomain,
      fqdn,
      aRecord,
      srvRecord,
      allocatedPort,
    };
  }

  /**
   * Delete all DNS records associated with a subdomain
   */
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
        deletedCount++;
      }
    }

    return { deletedCount };
  }

  /**
   * Get all DNS records matching a given subdomain prefix
   */
  public getRecordBySubdomain(subdomain: string): DnsRecord[] {
    const results: DnsRecord[] = [];
    const targetFqdn = `${subdomain}.${this.baseDomain}`;

    for (const record of this.records.values()) {
      if (
        record.subdomain === subdomain ||
        record.fqdn === targetFqdn ||
        record.subdomain.endsWith(`.${subdomain}`)
      ) {
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Get DNS record by ID
   */
  public getRecordById(id: string): DnsRecord | undefined {
    return this.records.get(id);
  }

  /**
   * List all created DNS records
   */
  public listRecords(): DnsRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Verify if FQDN and port are properly routed
   */
  public verifyRecordRouting(fqdn: string, port?: number): { valid: boolean; records: DnsRecord[] } {
    const matching = Array.from(this.records.values()).filter(
      (r) => r.fqdn === fqdn || r.target === fqdn
    );

    if (matching.length === 0) {
      return { valid: false, records: [] };
    }

    if (port !== undefined) {
      const hasPortMatch = matching.some((r) => r.port === port);
      return { valid: hasPortMatch, records: matching };
    }

    return { valid: true, records: matching };
  }

  /**
   * Clear all records
   */
  public clearRecords(): void {
    this.records.clear();
  }
}
