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

function attachMockRconServer(
  socket: net.Socket,
  handler: (packet: { requestId: number; type: number; payload: string }) => void
): void {
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readInt32LE(0);
      if (buffer.length < 4 + size) {
        return;
      }
      const body = buffer.subarray(4, 4 + size);
      buffer = buffer.subarray(4 + size);
      const requestId = body.readInt32LE(0);
      const type = body.readInt32LE(4);
      let end = body.length;
      while (end > 8 && body[end - 1] === 0) {
        end -= 1;
      }
      handler({
        requestId,
        type,
        payload: body.subarray(8, end).toString('utf8')
      });
    }
  });
}

describe('RconClient', () => {
  it('authenticates and executes a command against a mock RCON server', async () => {
    const server = net.createServer((socket) => {
      attachMockRconServer(socket, (packet) => {
        if (packet.type === 3) {
          expect(packet.payload).toBe('pw');
          writePacket(socket, packet.requestId, 2, '');
          return;
        }
        if (packet.type === 2) {
          expect(packet.payload).toBe('list');
          writePacket(socket, packet.requestId, 0, 'There are 1/10 players online');
        }
      });
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
      attachMockRconServer(socket, (packet) => {
        if (packet.type === 3) {
          writePacket(socket, -1, 2, '');
        }
      });
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
