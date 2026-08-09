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
    try {
      socket.setTimeout(timeoutMs);
      const authId = allocId();
      await writePacket(socket, authId, PACKET_TYPE_AUTH, password);
      const authResp = await readPacket(socket);
      if (authResp.requestId === AUTH_FAILURE_ID) {
        throw new Error('rcon authentication failed (invalid password)');
      }
      if (authResp.requestId !== authId) {
        throw new Error(`rcon auth response id mismatch: got ${authResp.requestId} want ${authId}`);
      }

      const cmdId = allocId();
      await writePacket(socket, cmdId, PACKET_TYPE_COMMAND, command);
      const cmdResp = await readPacket(socket);
      if (cmdResp.requestId === AUTH_FAILURE_ID) {
        throw new Error('rcon session not authenticated');
      }
      if (cmdResp.requestId !== cmdId) {
        throw new Error(`rcon command response id mismatch: got ${cmdResp.requestId} want ${cmdId}`);
      }
      return cmdResp.payload;
    } finally {
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

async function readPacket(socket: net.Socket): Promise<{ requestId: number; type: number; payload: string }> {
  const sizeBuf = await readExact(socket, 4);
  const size = sizeBuf.readInt32LE(0);
  if (size < MIN_PACKET_BODY || size > MAX_PACKET_BODY) {
    throw new Error(`rcon packet size out of range: ${size}`);
  }
  const body = await readExact(socket, size);
  const requestId = body.readInt32LE(0);
  const type = body.readInt32LE(4);
  let payloadEnd = body.length;
  while (payloadEnd > 8 && body[payloadEnd - 1] === 0) {
    payloadEnd -= 1;
  }
  const payload = body.subarray(8, payloadEnd).toString('utf8');
  return { requestId, type, payload };
}

function readExact(socket: net.Socket, length: number): Promise<Buffer> {
  const buffered = (socket as net.Socket & { _rconBuf?: Buffer })._rconBuf ?? Buffer.alloc(0);

  return new Promise((resolve, reject) => {
    let acc = buffered;

    const tryResolve = () => {
      if (acc.length >= length) {
        const out = acc.subarray(0, length);
        (socket as net.Socket & { _rconBuf?: Buffer })._rconBuf = acc.subarray(length);
        cleanup();
        resolve(Buffer.from(out));
        return true;
      }
      return false;
    };

    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      tryResolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('rcon connection closed before packet completed'));
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('rcon read timed out'));
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
      socket.off('timeout', onTimeout);
    };

    if (tryResolve()) {
      return;
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
    socket.on('timeout', onTimeout);
  });
}
