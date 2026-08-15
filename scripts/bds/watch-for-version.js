const https = require('https');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TARGET_VERSION = process.argv[2] || '26.42';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

// Candidate URL patterns to try
function getCandidateUrls(v) {
  const [major, minor] = v.split('.');
  return [
    `${major}.${minor}.01`,
    `${major}.${minor}.00`,
    `1.${minor}.0.01`,
  ].map(ver => `https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-${ver}.zip`);
}

async function probe(url) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      resolve(res.statusCode === 200 ? url : null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function checkAndDownload() {
  console.log(`[watcher] Checking for BDS matching client v${TARGET_VERSION}...`);
  for (const url of getCandidateUrls(TARGET_VERSION)) {
    const found = await probe(url);
    if (found) {
      console.log(`[watcher] *** FOUND: ${url} ***`);
      console.log('[watcher] Downloading...');
      const root = path.join(__dirname, '..', '..');
      const zipPath = path.join(root, 'var', 'bds', 'bds.zip');
      const targetDir = path.join(root, 'var', 'bds', 'active');
      const serverDir = path.join(root, 'data', 'servers', 'srv_bedrock_1');

      // Download
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
        }).on('error', reject);
      });

      // Extract
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'inherit' });

      // Stop old server
      try { execSync('taskkill /IM bedrock_server.exe /F', { stdio: 'ignore' }); } catch (_) {}
      await new Promise(r => setTimeout(r, 2000));

      // Copy exe to server workspace
      fs.copyFileSync(path.join(targetDir, 'bedrock_server.exe'), path.join(serverDir, 'bedrock_server.exe'));

      // Restart
      console.log('[watcher] Starting new BDS...');
      const proc = spawn(path.join(serverDir, 'bedrock_server.exe'), [], { cwd: serverDir, detached: true, stdio: 'ignore' });
      proc.unref();
      console.log('[watcher] Done! BDS restarted with matching version.');
      process.exit(0);
    }
  }
  console.log(`[watcher] Not found yet. Rechecking in ${CHECK_INTERVAL_MS / 60000} minutes...`);
}

checkAndDownload();
setInterval(checkAndDownload, CHECK_INTERVAL_MS);
