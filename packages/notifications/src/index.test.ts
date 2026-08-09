import { describe, it, expect, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
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

  it('queues webhook payload in memory with stub result', async () => {
    const payload = NotificationDispatcher.formatBackupEmbed('Survival Realm', 'backup_123.zip', true, 10485760);
    const result = await NotificationDispatcher.sendWebhook('https://discord.com/api/webhooks/test', payload);
    expect(result.queued).toBe(true);
    expect(result.stub).toBe(true);
    expect(NotificationDispatcher.sentMessages.length).toBe(1);
    expect(NotificationDispatcher.sentMessages[0].webhookUrl).toBe('https://discord.com/api/webhooks/test');
  });

  it('performs real HTTP delivery to the webhook URL when forced live', async () => {
    const received: { body: string; contentType?: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ body, contentType: req.headers['content-type'] });
        res.writeHead(204).end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/webhook`;

    try {
      const payload = NotificationDispatcher.formatServerStatusEmbed('Realm', 'ONLINE', '127.0.0.1', 19132);
      const result = await NotificationDispatcher.sendWebhook(url, payload, { mode: 'live' });

      expect(result.stub).toBe(false);
      expect(result.delivered).toBe(true);
      expect(result.status).toBe(204);
      expect(received.length).toBe(1);
      expect(received[0].contentType).toContain('application/json');
      expect(JSON.parse(received[0].body).embeds[0].title).toContain('Realm');
      // Still recorded in memory for observability.
      expect(NotificationDispatcher.sentMessages.length).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reports an honest stub result when forced live but no URL is configured', async () => {
    const payload = NotificationDispatcher.formatBackupEmbed('Realm', 'b.tar.gz', true);
    const result = await NotificationDispatcher.sendWebhook('', payload, { mode: 'live' });
    expect(result.stub).toBe(true);
    expect(result.delivered).toBe(false);
  });
});
