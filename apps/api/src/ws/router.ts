import http from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { agentGateway } from './agentGateway';
import { clientStreamHub } from './clientHub';
import { db } from '@mc-admin/db';

export function setupWebSocketRouter(server: http.Server) {
  const wssAgent = new WebSocketServer({ noServer: true });
  const wssClient = new WebSocketServer({ noServer: true });

  wssAgent.on('connection', (ws: WebSocket, _req: IncomingMessage, nodeId: string) => {
    agentGateway.handleConnection(ws, nodeId);
  });

  wssClient.on('connection', (ws: WebSocket, _req: IncomingMessage, token: string) => {
    clientStreamHub.handleConnection(ws, token);
  });

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url || '', true);

    if (pathname === '/api/v1/ws/agent') {
      const nodeId = query.nodeId as string;

      // Validate node authentication
      const node = db.agentNodes.find(n => n.id === nodeId);
      if (!nodeId || !node) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wssAgent.handleUpgrade(request, socket, head, (ws) => {
        wssAgent.emit('connection', ws, request, nodeId);
      });
    } else if (pathname === '/api/v1/ws/client') {
      const token = query.token as string;
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
