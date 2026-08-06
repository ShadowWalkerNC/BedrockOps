import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationDispatcher } from './index';

describe('NotificationDispatcher Package', () => {
  beforeEach(() => {
    NotificationDispatcher.sentMessages = [];
  });

  it('formats server status alert embed correctly', () => {
    const payload = NotificationDispatcher.formatServerStatusEmbed('Survival Realm', 'ONLINE', '127.0.0.1', 19132);
    expect(payload.embeds).toBeDefined();
    expect(payload.embeds![0].title).toContain('Survival Realm');
    expect(payload.embeds![0].color).toBe(0x22c55e);
  });

  it('dispatches webhook payload into queue', async () => {
    const payload = NotificationDispatcher.formatBackupEmbed('Survival Realm', 'backup_123.zip', true, 10485760);
    const success = await NotificationDispatcher.sendWebhook('https://discord.com/api/webhooks/test', payload);
    expect(success).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].webhookUrl).toBe('https://discord.com/api/webhooks/test');
  });
});
