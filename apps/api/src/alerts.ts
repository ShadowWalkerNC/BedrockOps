import { NotificationDispatcher, DiscordWebhookPayload } from '@mc-admin/notifications';

/**
 * Resolve the operator's Discord webhook URL. Empty when unconfigured, in which
 * case NotificationDispatcher returns an honest stub (records but does not POST).
 */
export function discordWebhookUrl(): string {
  return process.env.DISCORD_WEBHOOK_URL || '';
}

/**
 * Best-effort Discord alert dispatch. Never throws — alerting must not fail the
 * originating operation (ban, backup, etc.). Delivery is real when a webhook URL
 * is configured and NOTIFICATIONS_DELIVERY is not forced to stub / test mode.
 */
export async function dispatchAlert(payload: DiscordWebhookPayload): Promise<void> {
  try {
    await NotificationDispatcher.sendWebhook(discordWebhookUrl(), payload);
  } catch {
    // Swallow: alert delivery is best-effort and must never break the request.
  }
}
