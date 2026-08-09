import { NotificationDispatcher, WebhookSendResult } from '@mc-admin/notifications';

export type SlashCommandName = 'status' | 'backup' | 'players';

export interface SlashCommandDef {
  name: SlashCommandName;
  description: string;
}

export interface SlashRegistrationResult {
  registered: boolean;
  stub: boolean;
  commandCount: number;
  message: string;
  status?: number;
}

export interface ChannelMap {
  /** Discord channel snowflake → BedrockOps server id */
  [channelId: string]: string;
}

const DEFAULT_COMMANDS: SlashCommandDef[] = [
  { name: 'status', description: 'Show BedrockOps realm status for this channel' },
  { name: 'backup', description: 'Trigger a backup for the mapped realm' },
  { name: 'players', description: 'List recently tracked players for the mapped realm' }
];

/**
 * Discord integration: webhook alerts (always) + optional slash-command registration
 * via Discord REST when DISCORD_BOT_TOKEN + DISCORD_APPLICATION_ID are set.
 * Never pretends slash commands are live when the bot token is missing.
 */
export class DiscordBotService {
  public static DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
  public static DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID || '';
  public static DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';

  /** channelId → serverId mapping (loaded from env JSON or set at runtime). */
  public static channelMap: ChannelMap = DiscordBotService.loadChannelMap();

  public static loadChannelMap(env: NodeJS.ProcessEnv = process.env): ChannelMap {
    const raw = env.DISCORD_CHANNEL_MAP_JSON || '';
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw) as ChannelMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      console.warn('[Discord Bot Service] DISCORD_CHANNEL_MAP_JSON is invalid JSON — ignoring.');
      return {};
    }
  }

  public static async initializeBot(): Promise<SlashRegistrationResult> {
    console.log('[Discord Bot Service] Initializing Discord Bot command handler & webhook dispatcher...');
    this.DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
    this.DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID || '';
    this.DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';
    this.channelMap = this.loadChannelMap();

    if (!this.DISCORD_BOT_TOKEN) {
      const message =
        '[STUB] DISCORD_BOT_TOKEN not provided — webhook-only mode (slash commands not registered).';
      console.log(`[Discord Bot Service Warning] ${message}`);
      return { registered: false, stub: true, commandCount: 0, message };
    }

    return this.registerSlashCommands(DEFAULT_COMMANDS);
  }

  /**
   * Register guild-scoped slash commands via Discord REST.
   * Guild registration is used so commands appear immediately in the ops guild.
   */
  public static async registerSlashCommands(
    commands: SlashCommandDef[] = DEFAULT_COMMANDS,
    options: { fetchImpl?: typeof fetch } = {}
  ): Promise<SlashRegistrationResult> {
    const token = this.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || '';
    const appId = this.DISCORD_APPLICATION_ID || process.env.DISCORD_APPLICATION_ID || '';
    const guildId = this.DISCORD_GUILD_ID || process.env.DISCORD_GUILD_ID || '';
    const fetchImpl = options.fetchImpl || fetch;

    if (!token || !appId) {
      return {
        registered: false,
        stub: true,
        commandCount: 0,
        message:
          '[STUB] Slash registration skipped — set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID.'
      };
    }
    if (!guildId) {
      return {
        registered: false,
        stub: true,
        commandCount: 0,
        message: '[STUB] Slash registration skipped — set DISCORD_GUILD_ID for guild command sync.'
      };
    }

    const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
    try {
      const res = await fetchImpl(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          commands.map((c) => ({
            name: c.name,
            description: c.description,
            type: 1
          }))
        )
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          registered: false,
          stub: false,
          commandCount: 0,
          status: res.status,
          message: `Discord slash registration failed (HTTP ${res.status}): ${text.slice(0, 200)}`
        };
      }
      return {
        registered: true,
        stub: false,
        commandCount: commands.length,
        status: res.status,
        message: `Registered ${commands.length} guild slash commands.`
      };
    } catch (err) {
      return {
        registered: false,
        stub: false,
        commandCount: 0,
        message: `Discord slash registration error: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /** Resolve the BedrockOps server id mapped to a Discord channel. */
  public static resolveServerForChannel(channelId: string): string | undefined {
    return this.channelMap[channelId];
  }

  public static mapChannel(channelId: string, serverId: string): void {
    this.channelMap[channelId] = serverId;
  }

  public static async dispatchAlert(
    webhookUrl: string,
    title: string,
    message: string
  ): Promise<WebhookSendResult> {
    return NotificationDispatcher.sendWebhook(webhookUrl, {
      username: 'Minecraft Ops Alert',
      embeds: [
        {
          title,
          description: message,
          color: 0x3b82f6,
          timestamp: new Date().toISOString()
        }
      ]
    });
  }
}

if (require.main === module) {
  DiscordBotService.initializeBot().then((result) => {
    console.log('[Discord Bot Service]', result.message);
  });
}
