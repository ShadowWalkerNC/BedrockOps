import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiscordBotService } from './index';
import { NotificationDispatcher } from '@mc-admin/notifications';

describe('DiscordBotService App', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    NotificationDispatcher.sentMessages = [];
    process.env = { ...prev };
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_CHANNEL_MAP_JSON;
    DiscordBotService.DISCORD_BOT_TOKEN = '';
    DiscordBotService.DISCORD_APPLICATION_ID = '';
    DiscordBotService.DISCORD_GUILD_ID = '';
    DiscordBotService.channelMap = {};
  });

  afterEach(() => {
    process.env = prev;
  });

  it('dispatches alerts via webhook (honest stub in test mode)', async () => {
    const result = await DiscordBotService.dispatchAlert(
      'https://discord.com/api/webhooks/bot-test',
      'Test Title',
      'Test Alert Message'
    );
    expect(result.queued).toBe(true);
    expect(result.stub).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].payload.username).toBe('Minecraft Ops Alert');
  });

  it('initializeBot returns honest stub when bot token is unset', async () => {
    const result = await DiscordBotService.initializeBot();
    expect(result.stub).toBe(true);
    expect(result.registered).toBe(false);
    expect(result.message).toContain('DISCORD_BOT_TOKEN');
  });

  it('registerSlashCommands PUTs guild commands when credentials are set', async () => {
    DiscordBotService.DISCORD_BOT_TOKEN = 'tok';
    DiscordBotService.DISCORD_APPLICATION_ID = 'app1';
    DiscordBotService.DISCORD_GUILD_ID = 'guild1';

    const calls: { url: string; method?: string; body?: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined
      });
      return new Response(JSON.stringify([{ id: 'cmd1' }]), { status: 200 });
    };

    const result = await DiscordBotService.registerSlashCommands(undefined, { fetchImpl: fetchImpl as typeof fetch });
    expect(result.registered).toBe(true);
    expect(result.stub).toBe(false);
    expect(result.commandCount).toBe(3);
    expect(calls[0].url).toContain('/applications/app1/guilds/guild1/commands');
    expect(calls[0].method).toBe('PUT');
  });

  it('maps Discord channels to server ids from env JSON', () => {
    process.env.DISCORD_CHANNEL_MAP_JSON = JSON.stringify({ ch_ops: 'srv_bedrock_1' });
    DiscordBotService.channelMap = DiscordBotService.loadChannelMap();
    expect(DiscordBotService.resolveServerForChannel('ch_ops')).toBe('srv_bedrock_1');
  });
});
