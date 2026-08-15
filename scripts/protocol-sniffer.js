const dgram = require('dgram');

const LISTEN_PORT = 19132;
const BDS_PORT = 19135;

console.log('========================================================');
console.log('       BedrockOps Live Client Protocol Sniffer         ');
console.log('========================================================');
console.log(`Listening on UDP 0.0.0.0:${LISTEN_PORT}...`);
console.log('Open Minecraft and click "Join Server" or refresh Server List to see your client info!\n');

const server = dgram.createSocket('udp4');

server.on('message', (msg, rinfo) => {
  const packetId = msg.readUInt8(0);
  const time = new Date().toLocaleTimeString();

  if (packetId === 0x01 || packetId === 0x02) { // Unconnected Ping
    console.log(`[${time}] 📡 PING received from ${rinfo.address}:${rinfo.port}`);
    
    // Send back a dynamic pong matching any modern Bedrock client!
    const clientTime = msg.readBigInt64BE(1);
    const magic = msg.subarray(9, 25);
    const guid = msg.subarray(25, 33);
    
    // Dynamic MOTD response
    const motd = `MCPE;BedrockOps Live Test;786;1.21.73;0;10;1234567890;BedrockLevel;Survival;1;19132;19133;0;`;
    const motdBuf = Buffer.from(motd, 'utf8');
    
    const pong = Buffer.alloc(1 + 8 + 8 + 16 + 2 + motdBuf.length);
    pong.writeUInt8(0x1c, 0); // ID_UNCONNECTED_PONG
    pong.writeBigInt64BE(clientTime, 1);
    pong.writeBigInt64BE(BigInt(Date.now()), 9);
    magic.copy(pong, 17);
    pong.writeUInt16BE(motdBuf.length, 33);
    motdBuf.copy(pong, 35);
    
    server.send(pong, 0, pong.length, rinfo.port, rinfo.address);
  } else if (packetId === 0x05) { // Open Connection Request 1
    const mtu = msg.length + 28;
    const protocolVer = msg.readUInt8(msg.length - 1);
    console.log(`[${time}] 🎮 CONNECTION REQUEST 1 from ${rinfo.address}:${rinfo.port} | MTU: ${mtu} | RakNet Protocol: ${protocolVer}`);
  } else if (packetId === 0x07) { // Open Connection Request 2
    console.log(`[${time}] 🎮 CONNECTION REQUEST 2 from ${rinfo.address}:${rinfo.port}`);
  } else if (packetId >= 0x80 && packetId <= 0x8f) { // Frame Set Packet (Game Data / Login)
    console.log(`[${time}] 📦 GAME DATA PACKET (Login/Handshake) received! Length: ${msg.length} bytes`);
  } else {
    console.log(`[${time}] Packet ID 0x${packetId.toString(16)} (${msg.length} bytes) from ${rinfo.address}:${rinfo.port}`);
  }
});

server.bind(LISTEN_PORT, '0.0.0.0');
