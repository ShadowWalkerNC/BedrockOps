import {
  pingServer,
  resolveClientVersion,
  sendChat,
  sleep,
  spawnOfflineBot,
  type SpawnedBot,
} from './client';
import type { ScenarioName, ScenarioOptions, ScenarioResult } from './types';

function botName(prefix: string, index: number): string {
  return `${prefix}${index + 1}`;
}

async function withResolvedVersion(opts: ScenarioOptions): Promise<ScenarioOptions> {
  const version = await resolveClientVersion(opts);
  return { ...opts, version };
}

async function settleJoin(bot: SpawnedBot, errors: string[]): Promise<boolean> {
  try {
    await bot.ready;
    return true;
  } catch (err) {
    errors.push(`${bot.username}: ${err instanceof Error ? err.message : String(err)}`);
    bot.close();
    return false;
  }
}

export async function runPing(opts: ScenarioOptions): Promise<ScenarioResult> {
  try {
    const ad = await pingServer(opts);
    const name = typeof ad.name === 'string' ? ad.name : JSON.stringify(ad.motd ?? ad);
    return {
      scenario: 'ping',
      ok: true,
      detail: `ping ok — ${name}`,
      joined: [],
      errors: [],
    };
  } catch (err) {
    return {
      scenario: 'ping',
      ok: false,
      detail: 'ping failed (is BDS running and UDP 19132 open?)',
      joined: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export async function runJoin(opts: ScenarioOptions): Promise<ScenarioResult> {
  const errors: string[] = [];
  const joined: string[] = [];
  const bots: SpawnedBot[] = [];
  opts = await withResolvedVersion(opts);

  for (let i = 0; i < opts.count; i++) {
    const bot = spawnOfflineBot(opts, botName(opts.usernamePrefix, i));
    bots.push(bot);
    if (await settleJoin(bot, errors)) joined.push(bot.username);
    if (opts.staggerMs > 0 && i < opts.count - 1) await sleep(opts.staggerMs);
  }

  if (joined.length > 0) await sleep(opts.holdMs);
  for (const bot of bots) bot.close();

  return {
    scenario: 'join',
    ok: joined.length === opts.count,
    detail: `joined ${joined.length}/${opts.count}`,
    joined,
    errors,
  };
}

export async function runChat(opts: ScenarioOptions): Promise<ScenarioResult> {
  const errors: string[] = [];
  opts = await withResolvedVersion(opts);
  const username = botName(opts.usernamePrefix, 0);
  const bot = spawnOfflineBot(opts, username);
  const okJoin = await settleJoin(bot, errors);
  if (!okJoin) {
    return { scenario: 'chat', ok: false, detail: 'bot failed to join', joined: [], errors };
  }

  const messages = opts.chatMessages.length > 0 ? opts.chatMessages : ['hello from BedrockOps bot'];
  for (const message of messages) {
    try {
      sendChat(bot.client, username, message);
      await sleep(400);
    } catch (err) {
      errors.push(`chat: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await sleep(opts.holdMs);
  bot.close();

  return {
    scenario: 'chat',
    ok: errors.length === 0,
    detail: `sent ${messages.length} chat message(s) as ${username}`,
    joined: [username],
    errors,
  };
}

export async function runFlood(opts: ScenarioOptions): Promise<ScenarioResult> {
  const errors: string[] = [];
  const joined: string[] = [];
  const bots: SpawnedBot[] = [];
  opts = await withResolvedVersion(opts);

  // Launch nearly in parallel to stress join ingest / flood detection.
  for (let i = 0; i < opts.count; i++) {
    bots.push(spawnOfflineBot(opts, botName(opts.usernamePrefix, i)));
    if (opts.staggerMs > 0) await sleep(opts.staggerMs);
  }

  await Promise.all(
    bots.map(async (bot) => {
      if (await settleJoin(bot, errors)) joined.push(bot.username);
    })
  );

  await sleep(opts.holdMs);
  for (const bot of bots) bot.close();

  return {
    scenario: 'flood',
    ok: joined.length > 0,
    detail: `flood joined ${joined.length}/${opts.count}`,
    joined,
    errors,
  };
}

export async function runChurn(opts: ScenarioOptions): Promise<ScenarioResult> {
  const errors: string[] = [];
  const joined: string[] = [];
  opts = await withResolvedVersion(opts);

  for (let round = 0; round < opts.churnRounds; round++) {
    const username = `${opts.usernamePrefix}R${round + 1}`;
    const bot = spawnOfflineBot(opts, username);
    if (await settleJoin(bot, errors)) {
      joined.push(username);
      await sleep(Math.max(250, opts.holdMs));
    }
    bot.close();
    await sleep(Math.max(100, opts.staggerMs));
  }

  return {
    scenario: 'churn',
    ok: joined.length === opts.churnRounds,
    detail: `churn completed ${joined.length}/${opts.churnRounds} rounds`,
    joined,
    errors,
  };
}

export async function runScenario(name: ScenarioName, opts: ScenarioOptions): Promise<ScenarioResult> {
  switch (name) {
    case 'ping':
      return runPing(opts);
    case 'join':
      return runJoin(opts);
    case 'chat':
      return runChat(opts);
    case 'flood':
      return runFlood(opts);
    case 'churn':
      return runChurn(opts);
    default: {
      const _exhaustive: never = name;
      return {
        scenario: _exhaustive,
        ok: false,
        detail: `unknown scenario`,
        joined: [],
        errors: [`unknown scenario: ${String(name)}`],
      };
    }
  }
}
