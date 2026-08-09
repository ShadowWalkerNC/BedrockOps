/**
 * Browser client for the control-plane live stream WebSocket
 * (`/api/v1/ws/client`). The dashboard subscribes per-server to LOGS / METRICS
 * frames which the API relays from the connected Go agent.
 *
 * Note: WebSocket upgrades are not proxied through the Next.js rewrite used for
 * REST, so we connect directly to the API origin (default :4000 in dev).
 */

export interface ServerLogFrame {
  serverId: string;
  stream: 'LOGS';
  data: { line?: string } & Record<string, unknown>;
  timestamp: number;
}

export interface ServerMetricsFrame {
  serverId: string;
  stream: 'METRICS';
  data: {
    cpuPercent?: number;
    memoryUsageMB?: number;
    memoryLimitMB?: number;
    uptimeSeconds?: number;
    activeConnections?: number;
  } & Record<string, unknown>;
  timestamp: number;
}

export type StreamStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface OpenStreamOptions {
  onLog?: (line: string, frame: ServerLogFrame) => void;
  onMetrics?: (frame: ServerMetricsFrame) => void;
  onStatus?: (status: StreamStatus) => void;
}

function apiWsBase(): string {
  // Allow an explicit override; otherwise derive from the current host on :4000.
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) {
    return explicit.replace(/^http/i, 'ws').replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.hostname}:4000`;
  }
  return 'ws://127.0.0.1:4000';
}

/**
 * Open a live stream for a server. Returns a disposer that closes the socket.
 * Reconnects automatically with a short backoff until disposed.
 */
export function openServerStream(
  token: string,
  serverId: string,
  streams: Array<'LOGS' | 'METRICS'>,
  opts: OpenStreamOptions
): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (disposed) return;
    opts.onStatus?.('connecting');
    const url = `${apiWsBase()}/api/v1/ws/client?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      opts.onStatus?.('open');
      for (const stream of streams) {
        ws.send(JSON.stringify({ action: 'SUBSCRIBE', serverId, stream }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data as string);
        if (frame.stream === 'LOGS') {
          const line = typeof frame.data?.line === 'string' ? frame.data.line : JSON.stringify(frame.data);
          opts.onLog?.(line, frame as ServerLogFrame);
        } else if (frame.stream === 'METRICS') {
          opts.onMetrics?.(frame as ServerMetricsFrame);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onerror = () => opts.onStatus?.('error');

    ws.onclose = () => {
      opts.onStatus?.('closed');
      socket = null;
      if (!disposed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) socket.close();
  };
}
