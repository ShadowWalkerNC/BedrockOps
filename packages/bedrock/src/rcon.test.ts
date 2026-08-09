import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { RconClient } from './rcon';

function writePacket(socket: net.Socket, requestId: number, type: number, payload: string): void {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const size = 8 + payloadBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(requestId, 4);
  buf.writeInt32LE(type, 8);
  payloadBuf.copy(buf, 12);
  socket.write(buf);
}

async function readPacket(socket: net.Socket): Promise<{ requestId: number; type: number; payload: string }> {
  const sizeBuf = await readExact(socket, 4);
  const size = sizeBuf.readInt32LE(0);
  const body = await readExact(socket, size);
  const requestId = body.readInt32LE(0);
  const type = body.readInt32LE(4);
  let end = body.length;
  while (end > 8 && body[end - 1] === 0) end -= 1;
  return { requestId, type, payload: body.subarray(8, end).toString('utf8') };
}

function readExact(socket: net.Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let acc = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      if (acc.length >= length) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(acc.subarray(0, length));
      }
    };
    const onError = (err: Error) => reject(err);
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

describe('RconClient', () => {
  it('authenticates and executes a command against a mock RCON server', async () => {
    const server = net.createServer((socket) => {
      void (async () => {
        const auth = await readPacket(socket);
        expect(auth.type).toBe(3);
        expect(auth.payload).toBe('pw');
        writePacket(socket, auth.requestId, 2, '');
        const cmd = await readPacket(socket);
        expect(cmd.type).toBe(2);
        expect(cmd.payload).toBe('list');
        writePacket(socket, cmd.requestId, 0, 'There are 1/10 players online');
      })();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const out = await RconClient.execute({
        host: '127.0.0.1',
        port,
        password: 'pw',
        command: 'list',
        timeoutMs: 2000
      });
      expect(out).toBe('There are 1/10 players online');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('rejects auth failures', async () => {
    const server = net.createServer((socket) => {
      void (async () => {
        const auth = await readPacket(socket);
        writePacket(socket, -1, 2, '');
        void auth;
      })();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      await expect(
        RconClient.execute({ host: '127.0.0.1', port, password: 'bad', command: 'list', timeoutMs: 2000 })
      ).rejects.toThrow(/authentication failed/i);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
