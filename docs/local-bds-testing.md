# Local Bedrock Dedicated Server + fake players

This repo can drive a **real** Minecraft Bedrock Dedicated Server (BDS) and stress BedrockOps with offline fake players.

## What you get

| Piece | Purpose |
| --- | --- |
| `scripts/bds/download-bds.sh` | Fetch official Linux BDS from Mojang’s links API → `var/bds/` |
| `scripts/bds/configure-bds.sh` | Set `online-mode=false`, LAN ports, creative/peaceful for bots |
| `scripts/bds/run-bds.sh` | Run `bedrock_server` directly (no agent) |
| `scripts/start-local-bds.sh` | Full stack (API/web/agent) with `-bds-bin` live mode |
| `@mc-admin/bds-bots` | Offline bots: ping / join / chat / flood / churn |
| `scripts/bds/run-bot-e2e.sh` | One-shot: ensure BDS + run all bot scenarios (`--with-api` asserts ingest/flood) |

## Requirements

- Linux **x86_64** (official BDS binary; use WSL2 or a Linux VM on Mac/ARM)
- `curl`, `unzip`, Node 18+, pnpm, Docker (for Postgres via `start-local`)
- UDP **19132** free on localhost
- Accept Mojang’s BDS download/license terms by downloading their published zip
- Bot harness needs the `raknet-native` Node addon (`./scripts/bds/ensure-raknet-native.sh` after `pnpm install`; uses `g++`). You can set `BDS_RAKNET_BACKEND=jsp-raknet` for the connect path, but createClient still loads the native module for ping.

## 1. Download + configure BDS

For **offline bots**, prefer the bot-compat pin (matches `bedrock-protocol` today):

```bash
./scripts/bds/download-bds.sh --bot-compat
./scripts/bds/configure-bds.sh
./scripts/bds/ensure-raknet-native.sh
```

Latest stable (may require a newer `bedrock-protocol` before bots can join):

```bash
./scripts/bds/download-bds.sh
./scripts/bds/configure-bds.sh
```

Optional preview / exact pin:

```bash
./scripts/bds/download-bds.sh --preview
./scripts/bds/download-bds.sh --version 1.26.36.1
```

Install lands in `var/bds/bedrock-server-<version>/` (gitignored). `var/bds/active` points at the last download.

## 2a. One-shot bot e2e (recommended)

```bash
pnpm install
./scripts/bds/run-bot-e2e.sh              # BDS + bots only
./scripts/bds/run-bot-e2e.sh --with-api   # also assert player ingest + JOIN_FLOOD_DETECTED
```

This downloads/configures bot-compat BDS if needed, starts it when `:19132` is free, then runs ping/join/chat/flood/churn.

Manual equivalent (two terminals):

```bash
./scripts/bds/run-bds.sh
# other terminal:
pnpm --filter @mc-admin/bds-bots bot:ping
pnpm --filter @mc-admin/bds-bots bot:join
pnpm --filter @mc-admin/bds-bots bot:chat -- --message "ops check"
pnpm --filter @mc-admin/bds-bots bot:flood -- --count 8
pnpm --filter @mc-admin/bds-bots bot:churn -- --rounds 4
```

You should see `Player connected: BotN, xuid: …` style lines in the BDS console (offline XUIDs may be empty; BedrockOps synthesizes stable offline ids on ingest).

## 2b. Full BedrockOps stack against live BDS

```bash
./scripts/start-local-bds.sh
```

This starts Postgres + Prisma API + web + the Go agent in **live** mode:

```text
-bds-bin $BDS_HOME/bedrock_server
-server-path $BDS_HOME
```

Then:

1. Open `http://localhost:3000/login` (`admin@minecraft-admin.local` / `admin`)
2. Start the server from the dashboard (Power → Start) so the agent launches BDS
3. Run the bot scenarios above
4. Confirm joins appear in **Live console**, join-flood analytics, and agent logs (`/tmp/bedrockops-logs/agent.log`)

Equivalent manual agent launch:

```bash
pnpm --filter @mc-admin/agent agent:build
./apps/agent/bin/bedrock-agent \
  -control-plane http://127.0.0.1:4000 \
  -node-id node_docker_agent_1 \
  -token dev_agent_token_change_me \
  -bds-bin "$BDS_HOME/bedrock_server" \
  -server-path "$BDS_HOME"
```

## Bot scenarios (what they push)

| Scenario | Behavior | What to validate in BedrockOps |
| --- | --- | --- |
| `ping` | RakNet status ping | Server advertisement / reachability |
| `join` | N bots join → hold → leave | Log ingest (`Player connected`), session UI |
| `chat` | Bot sends chat packets | Console stream / chat-related ingest |
| `flood` | Many near-simultaneous joins | Join-flood / bot-pattern analytics + Discord alert queue |
| `churn` | Repeated join/leave | Lifecycle stability, reconnect noise |

## Important limits (honest)

1. **Offline only** — bots use `bedrock-protocol` `offline: true`. That requires BDS `online-mode=false`. Real Xbox Live players need real auth; do not expect offline bots to work against production online-mode realms.
2. **Protocol version pin** — bots auto-pick the best `bedrock-protocol` version from the server’s ping advertisement (same major.minor, highest supported patch ≤ server). Latest Mojang BDS can still be newer than the library; use `--bot-compat` or pass `--version 1.26.30` / `BDS_PROTOCOL_VERSION`.
3. **RCON** — classic Source RCON is a Java-era path. Live BDS command control is primarily stdin/console + log ingest; agent RCON may still stub/fail until a Bedrock-native command channel is wired for your build.
4. **Architecture** — Mojang’s Linux BDS is **x86_64**. ARM hosts need emulation or a remote x86 node.
5. **No fake success** — if a bot cannot join, the harness exits non-zero. Do not treat simulated agent mode as proof of live BDS behavior.

## Cleanup

```bash
# stop stack processes started by start-local*
for f in /tmp/bedrockops-logs/*.pid; do kill "$(cat "$f")" 2>/dev/null || true; done

# remove downloaded BDS (optional)
rm -rf var/bds
```
