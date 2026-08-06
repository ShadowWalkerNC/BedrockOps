import { describe, it, expect, beforeEach } from 'vitest';
import { DiscordBotService } from './index';
import { NotificationDispatcher } from '@mc-admin/notifications';

describe('DiscordBotService App', () => {
  beforeEach(() => {
    NotificationDispatcher.sentMessages = [];
  });

  it('dispatches alerts via webhook', async () => {
    const success = await DiscordBotService.dispatchAlert(
      'https://discord.com/api/webhooks/bot-test',
      'Test Title',
      'Test Alert Message'
    );
    expect(success).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].payload.username).toBe('Minecraft Ops Alert');
  });
});
