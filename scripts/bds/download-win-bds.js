const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

async function main() {
  const version = process.argv[2] || '1.21.73.01';
  const url = `https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-${version}.zip`;
  const bdsDir = path.join(process.cwd(), 'var', 'bds');
  const targetDir = path.join(bdsDir, 'active');
  const zipPath = path.join(bdsDir, 'bds.zip');

  fs.mkdirSync(bdsDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[bds-download] Fetching official Mojang Windows BDS ${version}...`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    function doGet(url) {
      https.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location);
        } else if (res.statusCode === 200) {
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      }).on('error', reject);
    }

    doGet(url);
  });

  console.log('[bds-download] Extracting to var/bds/active...');
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`, { stdio: 'inherit' });
  console.log(`[bds-download] SUCCESS! BDS ${version} ready at var/bds/active/bedrock_server.exe`);
}

main().catch(err => {
  console.error('[bds-download] ERROR:', err.message);
  process.exit(1);
});
