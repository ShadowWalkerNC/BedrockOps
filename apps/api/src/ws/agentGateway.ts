import WebSocket from 'ws';
import { db } from '@mc-admin/db';
import { PlayerLogParser, playerTracker } from '@mc-admin/moderation';
import { clientStreamHub } from './clientHub';
import { notePlayerJoin } from '../joinFlood';
import { recordServerCrash } from '../crash';

export interface AgentFrame {
  id: string;
  type:
    | 'HEARTBEAT'
    | 'CMD_EXEC'
    | 'CMD_RESP'
    | 'LOG_LINE'
    | 'METRICS'
    | 'BACKUP_START'
    | 'BACKUP_PROGRESS'
    | 'BACKUP_COMPLETE'
    | 'BACKUP_ERROR'
    | 'CRASH';
  nodeId: string;
  serverId?: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

interface AgentSession {
  nodeId: string;
  ws: WebSocket;
  lastHeartbeat: Date;
  pendingCommands: Map<string, PendingCommand>;
}

export class AgentTunnelGateway {
  private sessions = new Map<string, AgentSession>();

  public handleConnection(ws: WebSocket, nodeId: string) {
    const session: AgentSession = {
      nodeId,
      ws,
      lastHeartbeat: new Date(),
      pendingCommands: new Map()
    };
    this.sessions.set(nodeId, session);

    // Update node status in DB
    const node = db.agentNodes.find(n => n.id === nodeId);
    if (node) {
      node.status = 'ONLINE';
      node.lastHeartbeat = new Date();
    }

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const frame: AgentFrame = JSON.parse(raw.toString());
        void this.processFrame(session, frame);
      } catch (err) {
        console.error(`[AgentGateway] Frame parse error from node ${nodeId}:`, err);
      }
    });

    ws.on('close', () => {
      this.sessions.delete(nodeId);
      const n = db.agentNodes.find(item => item.id === nodeId);
      if (n) {
        n.status = 'OFFLINE';
      }
    });
  }

  private async processFrame(session: AgentSession, frame: AgentFrame) {
    session.lastHeartbeat = new Date();

    switch (frame.type) {
      case 'HEARTBEAT': {
        const node = db.agentNodes.find(n => n.id === session.nodeId);
        if (node) {
          node.lastHeartbeat = new Date();
        }
        break;
      }
      case 'CMD_RESP': {
        const pending = session.pendingCommands.get(frame.id);
        if (pending) {
          clearTimeout(pending.timeout);
          session.pendingCommands.delete(frame.id);
          pending.resolve(frame.payload as unknown);
        }
        break;
      }
      case 'LOG_LINE': {
        if (frame.serverId) {
          clientStreamHub.broadcast(frame.serverId, 'LOGS', frame.payload);
        }
        // R4.1 — capture player identity from BDS "Player connected" log lines.
        const line = typeof frame.payload.line === 'string' ? frame.payload.line : undefined;
        if (line) {
          const join = PlayerLogParser.parseJoinLog(line);
          if (join) {
            playerTracker.recordJoin({
              gamertag: join.gamertag,
              xuid: join.xuid,
              serverId: frame.serverId
            });
            await notePlayerJoin({
              gamertag: join.gamertag,
              xuid: join.xuid,
              serverId: frame.serverId
            });
          }
        }
        break;
      }
      case 'CRASH': {
        if (frame.serverId) {
          const reason =
            typeof frame.payload.reason === 'string' ? frame.payload.reason : 'agent-reported crash';
          await recordServerCrash(frame.serverId, reason, {
            actorId: session.nodeId,
            actorName: `agent:${session.nodeId}`
          });
          clientStreamHub.broadcast(frame.serverId, 'STATUS', {
            status: 'ERROR',
            reason
          });
        }
        break;
      }
      case 'METRICS': {
        if (frame.serverId) {
          clientStreamHub.broadcast(frame.serverId, 'METRICS', frame.payload);
        }
        break;
      }
    }
  }

  public sendCommand(
    nodeId: string,
    serverId: string,
    command: string,
    payload: Record<string, unknown> = {}
  ): Promise<unknown> {
    const session = this.sessions.get(nodeId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Agent node ${nodeId} is not connected`));
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const frame: AgentFrame = {
      id: commandId,
      type: 'CMD_EXEC',
      nodeId,
      serverId,
      timestamp: Math.floor(Date.now() / 1000),
      payload: { command, ...payload }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout after 15s for agent node ${nodeId}`));
      }, 15000);

      session.pendingCommands.set(commandId, { resolve, reject, timeout });
      session.ws.send(JSON.stringify(frame));
    });
  }

  public isNodeConnected(nodeId: string): boolean {
    const session = this.sessions.get(nodeId);
    return !!session && session.ws.readyState === WebSocket.OPEN;
  }

  /** Node ids with an open outbound tunnel session. */
  public listConnectedNodeIds(): string[] {
    const ids: string[] = [];
    for (const [nodeId, session] of this.sessions) {
      if (session.ws.readyState === WebSocket.OPEN) {
        ids.push(nodeId);
      }
    }
    return ids;
  }
}

export const agentGateway = new AgentTunnelGateway();
