import WebSocket from 'ws';
import { verifyJwt, AuthSession } from '@mc-admin/auth';
import { config } from '../config';

interface ClientSubscription {
  ws: WebSocket;
  user: AuthSession;
  subscriptions: Set<string>; // Topic keys e.g. "srv_bedrock_1:LOGS", "srv_bedrock_1:METRICS"
}

export class ClientStreamHub {
  private clients = new Set<ClientSubscription>();

  public handleConnection(ws: WebSocket, token: string) {
    let user: AuthSession;
    try {
      user = verifyJwt<AuthSession>(token, config.JWT_SECRET);
    } catch (err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: ClientSubscription = {
      ws,
      user,
      subscriptions: new Set()
    };

    this.clients.add(client);

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.action === 'SUBSCRIBE' && msg.serverId && msg.stream) {
          client.subscriptions.add(`${msg.serverId}:${msg.stream}`);
        } else if (msg.action === 'UNSUBSCRIBE' && msg.serverId && msg.stream) {
          client.subscriptions.delete(`${msg.serverId}:${msg.stream}`);
        }
      } catch (err) {
        console.error('[ClientHub] Invalid client frame:', err);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  public broadcast(serverId: string, stream: 'LOGS' | 'METRICS' | 'STATUS', data: any) {
    const topic = `${serverId}:${stream}`;
    const payload = JSON.stringify({ serverId, stream, data, timestamp: Date.now() });

    for (const client of this.clients) {
      if (client.subscriptions.has(topic) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

export const clientStreamHub = new ClientStreamHub();
