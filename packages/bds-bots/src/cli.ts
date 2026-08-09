#!/usr/bin/env node
import { runScenario } from './scenarios';
import type { ScenarioName, ScenarioOptions } from './types';

const SCENARIOS: ScenarioName[] = ['join', 'chat', 'flood', 'churn', 'ping'];

function printHelp(): void {
  console.log(`BedrockOps offline BDS bot harness

Usage:
  pnpm --filter @mc-admin/bds-bots bot <scenario> [options]

Scenarios:
  ping    UDP status ping (server must be running)
  join    N bots join, hold, then leave
  chat    One bot joins and sends chat lines
  flood   Many bots join nearly at once (join-flood pressure)
  churn   Repeated join/leave cycles

Options:
  --host <host>           default 127.0.0.1 (or BDS_HOST)
  --port <port>           default 19132 (or BDS_PORT)
  --version <ver>         Bedrock protocol version pin (optional)
  --count <n>             bots for join/flood (default 1 / 6)
  --prefix <name>         username prefix (default Bot)
  --hold-ms <ms>          time to stay connected (default 3000)
  --stagger-ms <ms>       delay between bot spawns (default 0/150)
  --message <text>        chat message (repeatable)
  --rounds <n>            churn rounds (default 3)

Requires BDS with online-mode=false. See docs/local-bds-testing.md
`);
}

function parseArgs(argv: string[]): { scenario: ScenarioName; opts: ScenarioOptions } {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  const scenario = argv[0] as ScenarioName;
  if (!SCENARIOS.includes(scenario)) {
    console.error(`Unknown scenario '${scenario}'. Expected one of: ${SCENARIOS.join(', ')}`);
    process.exit(2);
  }

  const opts: ScenarioOptions = {
    host: process.env.BDS_HOST || '127.0.0.1',
    port: Number(process.env.BDS_PORT || 19132),
    version: process.env.BDS_PROTOCOL_VERSION || undefined,
    usernamePrefix: 'Bot',
    count: scenario === 'flood' ? 6 : 1,
    holdMs: 3000,
    chatMessages: [],
    churnRounds: 3,
    staggerMs: scenario === 'flood' ? 75 : 0,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '--host':
        opts.host = next();
        break;
      case '--port':
        opts.port = Number(next());
        break;
      case '--version':
        opts.version = next();
        break;
      case '--count':
        opts.count = Number(next());
        break;
      case '--prefix':
        opts.usernamePrefix = next();
        break;
      case '--hold-ms':
        opts.holdMs = Number(next());
        break;
      case '--stagger-ms':
        opts.staggerMs = Number(next());
        break;
      case '--message':
        opts.chatMessages.push(next());
        break;
      case '--rounds':
        opts.churnRounds = Number(next());
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(opts.port) || opts.port <= 0) throw new Error('invalid --port');
  if (!Number.isFinite(opts.count) || opts.count < 1) throw new Error('invalid --count');

  return { scenario, opts };
}

async function main(): Promise<void> {
  // pnpm forwards a lone "--" before script args; drop it.
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const { scenario, opts } = parseArgs(argv);
  console.log(`[bds-bots] scenario=${scenario} target=${opts.host}:${opts.port} count=${opts.count}`);
  const result = await runScenario(scenario, opts);
  console.log(`[bds-bots] ${result.ok ? 'OK' : 'FAIL'} — ${result.detail}`);
  if (result.joined.length) console.log(`[bds-bots] joined: ${result.joined.join(', ')}`);
  for (const err of result.errors) console.error(`[bds-bots] error: ${err}`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[bds-bots] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
