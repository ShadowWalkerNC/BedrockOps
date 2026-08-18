import * as fs from 'fs';
import * as path from 'path';
import type { MemoryDatabase } from './index';

const DEFAULT_STORE_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'bedrockops-store.json')
  : path.join(process.cwd(), 'data', 'bedrockops-store.json');

/**
 * LocalFileStore automatically syncs in-memory state with a persistent local JSON file.
 * Enables 100% zero-configuration persistence across app restarts.
 */
export class LocalFileStore {
  private static filePath: string = DEFAULT_STORE_PATH;
  private static debounceTimer: NodeJS.Timeout | null = null;

  public static setFilePath(customPath: string) {
    this.filePath = customPath;
  }

  public static getFilePath(): string {
    return this.filePath;
  }

  public static load(db: MemoryDatabase): boolean {
    try {
      if (!fs.existsSync(this.filePath)) {
        return false;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      if (!raw || !raw.trim()) {
        return false;
      }
      const data = JSON.parse(raw);

      if (Array.isArray(data.users)) db.users = data.users;
      if (Array.isArray(data.agentNodes)) db.agentNodes = data.agentNodes;
      if (Array.isArray(data.connectionKeys)) db.connectionKeys = data.connectionKeys;
      if (Array.isArray(data.serverMembers)) db.serverMembers = data.serverMembers;
      if (Array.isArray(data.servers)) db.servers = data.servers;
      if (Array.isArray(data.backups)) db.backups = data.backups;
      if (Array.isArray(data.moderationActions)) db.moderationActions = data.moderationActions;
      if (Array.isArray(data.templates)) db.templates = data.templates;
      if (Array.isArray(data.pipelines)) db.pipelines = data.pipelines;
      if (Array.isArray(data.pipelineRuns)) db.pipelineRuns = data.pipelineRuns;
      if (Array.isArray(data.auditLogs)) db.auditLogs = data.auditLogs;
      if (Array.isArray(data.bdsVersions)) db.bdsVersions = data.bdsVersions;
      if (Array.isArray(data.endstonePlugins)) db.endstonePlugins = data.endstonePlugins;

      return true;
    } catch (err) {
      console.warn('[LocalFileStore] Failed to load local state file:', err);
      return false;
    }
  }

  public static save(db: MemoryDatabase): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const snapshot = {
        users: db.users,
        agentNodes: db.agentNodes,
        connectionKeys: db.connectionKeys,
        serverMembers: db.serverMembers,
        servers: db.servers,
        backups: db.backups,
        moderationActions: db.moderationActions,
        templates: db.templates,
        pipelines: db.pipelines,
        pipelineRuns: db.pipelineRuns,
        auditLogs: db.auditLogs,
        bdsVersions: db.bdsVersions,
        endstonePlugins: db.endstonePlugins,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.error('[LocalFileStore] Failed to persist state:', err);
    }
  }

  public static saveDebounced(db: MemoryDatabase, delayMs: number = 300): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.save(db);
      this.debounceTimer = null;
    }, delayMs);
  }
}
