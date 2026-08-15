const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const TOOLS_DIR = path.join(__dirname, '..', 'data', 'tools');
if (!fs.existsSync(TOOLS_DIR)) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
}

const PLAYIT_EXE = path.join(TOOLS_DIR, 'playit.exe');
const DOWNLOAD_URL = 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64.exe';

console.log('========================================================');
console.log('       BedrockOps Zero-Config Remote UDP Tunnel        ');
console.log('========================================================');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'BedrockOps-Tunnel-Downloader' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function startTunnel() {
  if (!fs.existsSync(PLAYIT_EXE)) {
    console.log('[*] Downloading playit.gg zero-config tunnel binary...');
    try {
      await downloadFile(DOWNLOAD_URL, PLAYIT_EXE);
      console.log('    ✓ Download complete: playit.exe');
    } catch (err) {
      console.error('    ✗ Failed to download playit binary:', err.message);
      return;
    }
  }

  console.log('\n[*] Launching playit.gg Bedrock UDP Tunnel...');
  console.log('    Target Server: 127.0.0.1:19132 (Bedrock Dedicated Server)\n');

  const proc = spawn(PLAYIT_EXE, [], {
    cwd: TOOLS_DIR,
    stdio: 'inherit'
  });

  proc.on('exit', (code) => {
    console.log(`\n[!] Tunnel process exited with code ${code}`);
  });
}

startTunnel();
