import http, { type IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { timingSafeEqual } from 'crypto';
import { agentGateway } from './agentGateway';
import { clientStreamHub } from './clientHub';
import { db, hashAgentToken } from '@mc-admin/db';
import { config } from '../config';

function extractBearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const { query } = parse(req.url || '', true);
  const q = query.token;
  if (typeof q === 'string' && q.length > 0) {
    return q;
  }
  return undefined;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Authenticate an agent WebSocket upgrade.
 * Accepts (in order):
 * 1. Bearer token matching node.secretTokenHash (SHA-256)
 * 2. Single-use connectionKey.key for this node (claimed on success)
 * 3. NODE_PAIRING_SECRET only when the node has no hash yet (initial bootstrap)
 */
export function authenticateAgentUpgrade(
  req: IncomingMessage,
  nodeId: string
): { ok: true } | { ok: false; reason: string } {
  const node = db.agentNodes.find((n) => n.id === nodeId);
  if (!nodeId || !node) {
    return { ok: false, reason: 'unknown_node' };
  }

  const token = extractBearer(req);
  if (!token) {
    return { ok: false, reason: 'missing_token' };
  }

  if (node.secretTokenHash) {
    const presented = hashAgentToken(token);
    if (safeEqualHex(presented, node.secretTokenHash)) {
      return { ok: true };
    }
  }

  const pairingKey = db.connectionKeys.find(
    (k) =>
      k.serverId === nodeId &&
      k.key === token &&
      (k.maxUses === undefined || k.useCount < k.maxUses) &&
      (!k.expiresAt || k.expiresAt.getTime() > Date.now())
  );
  if (pairingKey && safeEqualString(pairingKey.key, token)) {
    pairingKey.useCount += 1;
    if (!node.secretTokenHash) {
      node.secretTokenHash = hashAgentToken(token);
    }
    return { ok: true };
  }

  if (!node.secretTokenHash && safeEqualString(token, config.NODE_PAIRING_SECRET)) {
    node.secretTokenHash = hashAgentToken(token);
    return { ok: true };
  }

  return { ok: false, reason: 'invalid_token' };
}

export function setupWebSocketRouter(server: http.Server) {
  const wssAgent = new WebSocketServer({ noServer: true });
  const wssClient = new WebSocketServer({ noServer: true });

  wssAgent.on('connection', (ws: WebSocket, _req: IncomingMessage, nodeId: string) => {
    agentGateway.handleConnection(ws, nodeId);
  });

  wssClient.on('connection', (ws: WebSocket, _req: IncomingMessage, token: string) => {
    clientStreamHub.handleConnection(ws, token);
  });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname, query } = parse(request.url || '', true);

    if (pathname === '/api/v1/ws/agent') {
      const nodeId = query.nodeId as string;
      const auth = authenticateAgentUpgrade(request, nodeId);
      if (!auth.ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wssAgent.handleUpgrade(request, socket, head, (ws) => {
        wssAgent.emit('connection', ws, request, nodeId);
      });
    } else if (pathname === '/api/v1/ws/client') {
      const token =
        (typeof request.headers.authorization === 'string' &&
        request.headers.authorization.startsWith('Bearer ')
          ? request.headers.authorization.slice('Bearer '.length).trim()
          : undefined) || (query.token as string | undefined);

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wssClient.handleUpgrade(request, socket, head, (ws) => {
        wssClient.emit('connection', ws, request, token);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });
}
