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
  delivered?: boolean;
  status?: number;
  message: string;
}

export interface WebhookDeliveryOptions {
  /** Force real HTTP delivery on ('live') or off ('stub'), overriding env defaults. */
  mode?: 'live' | 'stub';
  /** Abort the HTTP POST after this many milliseconds. */
  timeoutMs?: number;
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

  public static formatModerationEmbed(
    gamertag: string,
    actionType: string,
    reason: string,
    issuerName: string,
    serverName?: string
  ): DiscordWebhookPayload {
    const severe = actionType === 'BAN' || actionType === 'KICK';
    return {
      username: 'Minecraft Ops Alert',
      embeds: [
        {
          title: `Moderation: ${actionType} — ${gamertag}`,
          description: `Player **${gamertag}** received a **${actionType}**${serverName ? ` on **${serverName}**` : ''}.`,
          color: severe ? 0xef4444 : 0xf59e0b,
          fields: [
            { name: 'Reason', value: reason || 'N/A' },
            { name: 'Issued by', value: issuerName || 'staff', inline: true },
            { name: 'Action', value: actionType, inline: true }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  /**
   * Decide whether a real HTTP POST should be attempted.
   * Delivery is stubbed under automated tests (NODE_ENV=test) so the suite never
   * makes network calls, unless explicitly forced. Set NOTIFICATIONS_DELIVERY=live
   * to force delivery, or =stub to force the in-memory stub.
   */
  public static shouldDeliver(mode?: 'live' | 'stub'): boolean {
    if (mode === 'live') return true;
    if (mode === 'stub') return false;
    const envMode = (process.env.NOTIFICATIONS_DELIVERY || '').toLowerCase();
    if (envMode === 'live') return true;
    if (envMode === 'stub') return false;
    return process.env.NODE_ENV !== 'test';
  }

  /**
   * Deliver a Discord webhook payload. Always records the payload in memory for
   * observability/auditing, then performs a real HTTP POST when delivery is enabled
   * and a valid URL is available (falling back to DISCORD_WEBHOOK_URL). Returns an
   * honest stub result when delivery is disabled or no URL is configured — never
   * pretends a send happened when it didn't.
   */
  public static async sendWebhook(
    webhookUrl: string,
    payload: DiscordWebhookPayload,
    options: WebhookDeliveryOptions = {}
  ): Promise<WebhookSendResult> {
    this.sentMessages.push({ webhookUrl, payload });

    const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL || '';

    if (!this.shouldDeliver(options.mode)) {
      return {
        queued: true,
        stub: true,
        message: '[STUB] Webhook queued in memory only; HTTP delivery disabled (test mode or NOTIFICATIONS_DELIVERY=stub).'
      };
    }

    if (!url || !/^https?:\/\//i.test(url)) {
      return {
        queued: true,
        stub: true,
        delivered: false,
        message: `[STUB] Webhook not delivered — no valid webhook URL configured (received ${JSON.stringify(url)}).`
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const delivered = res.ok;
      return {
        queued: true,
        stub: false,
        delivered,
        status: res.status,
        message: delivered
          ? `Webhook delivered (HTTP ${res.status}).`
          : `Webhook delivery failed (HTTP ${res.status}).`
      };
    } catch (err) {
      return {
        queued: true,
        stub: false,
        delivered: false,
        message: `Webhook delivery error: ${err instanceof Error ? err.message : String(err)}`
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
