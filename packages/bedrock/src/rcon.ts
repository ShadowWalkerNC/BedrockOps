import net from 'node:net';

const PACKET_TYPE_COMMAND = 2;
const PACKET_TYPE_AUTH = 3;
const AUTH_FAILURE_ID = -1;
const MIN_PACKET_BODY = 10;
const MAX_PACKET_BODY = 4096 + MIN_PACKET_BODY;

let nextRequestId = 1;

export interface RconExecuteOptions {
  host: string;
  port: number;
  password: string;
  command: string;
  timeoutMs?: number;
}

/**
 * Source RCON client (Minecraft Java/Bedrock with enable-rcon).
 * Never claims success when the socket/auth/command path fails.
 */
export class RconClient {
  public static async execute(options: RconExecuteOptions): Promise<string> {
    const { host, port, password, command } = options;
    const timeoutMs = options.timeoutMs ?? 5000;

    if (!host || !port || port <= 0) {
      throw new Error('rcon host/port not configured');
    }
    if (!command) {
      throw new Error('rcon command is empty');
    }

    const socket = await connectWithTimeout(host, port, timeoutMs);
    const reader = new PacketReader(socket);

    try {
      const authId = allocId();
      await writePacket(socket, authId, PACKET_TYPE_AUTH, password);
      const authResp = await withTimeout(reader.read(), timeoutMs, 'rcon auth read timed out');
      if (authResp.requestId === AUTH_FAILURE_ID) {
        throw new Error('rcon authentication failed (invalid password)');
      }
      if (authResp.requestId !== authId) {
        throw new Error(`rcon auth response id mismatch: got ${authResp.requestId} want ${authId}`);
      }

      const cmdId = allocId();
      await writePacket(socket, cmdId, PACKET_TYPE_COMMAND, command);
      const cmdResp = await withTimeout(reader.read(), timeoutMs, 'rcon command read timed out');
      if (cmdResp.requestId === AUTH_FAILURE_ID) {
        throw new Error('rcon session not authenticated');
      }
      if (cmdResp.requestId !== cmdId) {
        throw new Error(`rcon command response id mismatch: got ${cmdResp.requestId} want ${cmdId}`);
      }
      return cmdResp.payload;
    } finally {
      reader.close();
      socket.destroy();
    }
  }
}

function allocId(): number {
  const id = nextRequestId++;
  if (id <= 0 || id > 0x7fffffff) {
    nextRequestId = 2;
    return 1;
  }
  return id;
}

function connectWithTimeout(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`rcon dial timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function writePacket(socket: net.Socket, requestId: number, type: number, payload: string): Promise<void> {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const size = 8 + payloadBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(requestId, 4);
  buf.writeInt32LE(type, 8);
  payloadBuf.copy(buf, 12);
  return new Promise((resolve, reject) => {
    socket.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface RconPacket {
  requestId: number;
  type: number;
  payload: string;
}

class PacketReader {
  private buffer = Buffer.alloc(0);
  private closed = false;
  private waiters: Array<{
    resolve: (packet: RconPacket) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private readonly socket: net.Socket) {
    this.socket.on('data', this.onData);
    this.socket.on('error', this.onError);
    this.socket.on('end', this.onEnd);
    this.socket.on('close', this.onEnd);
  }

  public read(): Promise<RconPacket> {
    if (this.closed) {
      return Promise.reject(new Error('rcon connection closed'));
    }
    const packet = this.tryParse();
    if (packet) {
      return Promise.resolve(packet);
    }
    return new Promise<RconPacket>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  public close(): void {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('end', this.onEnd);
    this.socket.off('close', this.onEnd);
  }

  private readonly onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushWaiters();
  };

  private readonly onError = (err: Error) => {
    this.failWaiters(err);
  };

  private readonly onEnd = () => {
    this.closed = true;
    this.failWaiters(new Error('rcon connection closed before packet completed'));
  };

  private flushWaiters(): void {
    while (this.waiters.length > 0) {
      const packet = this.tryParse();
      if (!packet) {
        return;
      }
      const waiter = this.waiters.shift();
      waiter?.resolve(packet);
    }
  }

  private failWaiters(err: Error): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const waiter of pending) {
      waiter.reject(err);
    }
  }

  private tryParse(): RconPacket | null {
    if (this.buffer.length < 4) {
      return null;
    }
    const size = this.buffer.readInt32LE(0);
    if (size < MIN_PACKET_BODY || size > MAX_PACKET_BODY) {
      throw new Error(`rcon packet size out of range: ${size}`);
    }
    if (this.buffer.length < 4 + size) {
      return null;
    }
    const body = this.buffer.subarray(4, 4 + size);
    this.buffer = this.buffer.subarray(4 + size);
    const requestId = body.readInt32LE(0);
    const type = body.readInt32LE(4);
    let payloadEnd = body.length;
    while (payloadEnd > 8 && body[payloadEnd - 1] === 0) {
      payloadEnd -= 1;
    }
    return {
      requestId,
      type,
      payload: body.subarray(8, payloadEnd).toString('utf8')
    };
  }
}
