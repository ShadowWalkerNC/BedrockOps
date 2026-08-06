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
          color: isOnline ? 0x22c55e : 0xef4444, // Green for online, Red for offline
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

  public static async sendWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<boolean> {
    // Record in memory queue for testing and local dev
    this.sentMessages.push({ webhookUrl, payload });
    // In production, fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return true;
  }
}
