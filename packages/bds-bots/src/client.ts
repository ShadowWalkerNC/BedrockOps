import bedrock, { type ClientOptions, type Version } from 'bedrock-protocol';
import { CURRENT_VERSION, Versions } from 'bedrock-protocol/src/options';
import { pickProtocolVersion } from './version';
import type { BotTarget } from './types';

export type BedrockClient = ReturnType<typeof bedrock.createClient>;

export interface SpawnedBot {
  username: string;
  client: BedrockClient;
  /** Resolves when the client reaches the spawn/join phase (or rejects on error). */
  ready: Promise<void>;
  close: () => void;
}

export async function resolveClientVersion(target: BotTarget): Promise<string> {
  if (target.version) return target.version;
  if (process.env.BDS_PROTOCOL_VERSION) return process.env.BDS_PROTOCOL_VERSION;

  const ad = await pingServer(target);
  const serverVersion = typeof ad.version === 'string' ? ad.version : '';
  const supported = Object.keys(Versions);
  const picked = serverVersion ? pickProtocolVersion(serverVersion, supported) : undefined;
  const version = picked || CURRENT_VERSION;
  console.log(
    `[bds-bots] server=${serverVersion || 'unknown'} → client protocol ${version}` +
      (picked ? '' : ' (fallback CURRENT_VERSION)')
  );
  return version;
}

function waitUntilReady(client: BedrockClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`timeout waiting for spawn/join (${timeoutMs}ms)`)), timeoutMs);

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeListener('spawn', onOk);
      client.removeListener('join', onOk);
      client.removeListener('error', onError);
      client.removeListener('kick', onKick);
      client.removeListener('disconnect', onDisconnect);
      if (err) reject(err);
      else resolve();
    };

    const onOk = () => finish();
    const onError = (err: Error) => finish(err instanceof Error ? err : new Error(String(err)));
    const onKick = (reason: unknown) =>
      finish(new Error(`kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`));
    const onDisconnect = () => finish(new Error('disconnected before ready'));

    client.once('spawn', onOk);
    client.once('join', onOk);
    client.once('error', onError);
    client.once('kick', onKick);
    client.once('disconnect', onDisconnect);
  });
}

/**
 * Create an offline Bedrock client (requires BDS `online-mode=false`).
 */
export function spawnOfflineBot(
  target: BotTarget,
  username: string,
  readyTimeoutMs = 45_000
): SpawnedBot {
  const options: ClientOptions = {
    host: target.host,
    port: target.port,
    username,
    offline: true,
    // bedrock-protocol still imports raknet-native at createClient load time;
    // run ./scripts/bds/ensure-raknet-native.sh after pnpm install if needed.
    raknetBackend: (process.env.BDS_RAKNET_BACKEND as ClientOptions['raknetBackend']) || 'raknet-native',
  };
  if (target.version) {
    options.version = target.version as Version;
  }

  const client = bedrock.createClient(options);
  const ready = waitUntilReady(client, readyTimeoutMs);
  const close = () => {
    try {
      client.close();
    } catch {
      // already closed
    }
  };

  return { username, client, ready, close };
}

export async function pingServer(target: BotTarget): Promise<{ version?: string; name?: string; motd?: unknown }> {
  const result = await bedrock.ping({
    host: target.host,
    port: target.port,
  });
  return result as { version?: string; name?: string; motd?: unknown };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sendChat(client: BedrockClient, username: string, message: string): void {
  client.queue('text', {
    type: 'chat',
    needs_translation: false,
    source_name: username,
    xuid: '',
    platform_chat_id: '',
    filtered_message: '',
    message,
  });
}
