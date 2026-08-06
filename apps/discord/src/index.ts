import { NotificationDispatcher } from '@mc-admin/notifications';

export class DiscordBotService {
  public static DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';

  public static async initializeBot() {
    console.log('[Discord Bot Service] Initializing Discord Bot command handler & webhook dispatcher...');
    if (!this.DISCORD_BOT_TOKEN) {
      console.log('[Discord Bot Service Warning] DISCORD_BOT_TOKEN not provided; running in webhook-only mode.');
    }
  }

  public static async dispatchAlert(webhookUrl: string, title: string, message: string) {
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
  DiscordBotService.initializeBot();
}
