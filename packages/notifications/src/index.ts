export interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: {
    title: string;
    description: string;
    color: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    timestamp?: string;
  }[];
}

export interface WebhookSendResult {
  queued: boolean;
  stub: boolean;
  message: string;
}

export class NotificationDispatcher {
  public static sentMessages: { webhookUrl: string; payload: DiscordWebhookPayload }[] = [];

  public static formatServerStatusEmbed(serverName: string, status: string, host: string, port: number): DiscordWebhookPayload {
    const isOnline = status === 'ONLINE';
    return {
      username: 'Minecraft Ops Bot',
      embeds: [
        {
          title: `Server Status Alert: ${serverName}`,
          description: `Bedrock Server **${serverName}** is now **${status}**.`,
          color: isOnline ? 0x22c55e : 0xef4444,
          fields: [
            { name: 'Address', value: `${host}:${port}`, inline: true },
            { name: 'Status', value: status, inline: true }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  public static formatBackupEmbed(serverName: string, filename: string, isSuccess: boolean, fileSizeBytes?: number): DiscordWebhookPayload {
    return {
      username: 'Minecraft Backup Service',
      embeds: [
        {
          title: `Backup Notification: ${serverName}`,
          description: isSuccess
            ? `Backup snapshot successfully created for **${serverName}**.`
            : `Backup snapshot failed for **${serverName}**.`,
          color: isSuccess ? 0x3b82f6 : 0xef4444,
          fields: [
            { name: 'Filename', value: filename, inline: true },
            { name: 'Size', value: fileSizeBytes ? `${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB` : 'N/A', inline: true }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  public static async sendWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<WebhookSendResult> {
    this.sentMessages.push({ webhookUrl, payload });
    // TODO: POST to Discord when DISCORD_WEBHOOK_URL or webhookUrl is configured for production
    return {
      queued: true,
      stub: true,
      message: '[STUB] Webhook queued in memory only; HTTP delivery not yet wired.'
    };
  }
}
