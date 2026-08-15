const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function main() {
  console.log('Fetching latest Bedrock Launcher release metadata from GitHub...');
  
  const headers = { 'User-Agent': 'BedrockOps-Admin-Client' };
  
  const releaseData = await new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/BedrockLauncher/BedrockLauncher/releases/latest', { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });

  console.log(`Found release: ${releaseData.name || releaseData.tag_name}`);
  
  // Find zip or exe asset
  const asset = releaseData.assets.find(a => a.name.endsWith('.zip') || a.name.endsWith('.exe')) || releaseData.assets[0];
  
  if (!asset) {
    throw new Error('No assets found in release');
  }

  console.log(`Selected asset: ${asset.name} (${(asset.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Download URL: ${asset.browser_download_url}`);

  const downloadsDir = path.join(os.homedir(), 'Downloads', 'BedrockLauncher');
  fs.mkdirSync(downloadsDir, { recursive: true });

  const destFile = path.join(downloadsDir, asset.name);
  console.log(`Saving to: ${destFile}`);

  await downloadFile(asset.browser_download_url, destFile);
  console.log('Download complete!');

  if (asset.name.endsWith('.zip')) {
    console.log(`Extracting ${asset.name}...`);
    execSync(`powershell -Command "Expand-Archive -Path '${destFile}' -DestinationPath '${downloadsDir}' -Force"`, { stdio: 'inherit' });
    console.log(`Extracted successfully into: ${downloadsDir}`);
  }

  // Find the executable
  const files = fs.readdirSync(downloadsDir);
  const exe = files.find(f => f.toLowerCase().endsWith('.exe'));
  if (exe) {
    const exePath = path.join(downloadsDir, exe);
    console.log(`Ready to launch: ${exePath}`);
    // Start launcher
    try {
      execSync(`start "" "${exePath}"`, { shell: 'cmd.exe' });
      console.log('Bedrock Launcher launched!');
    } catch (e) {
      console.log('Launched in background.');
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    function get(currentUrl) {
      https.get(currentUrl, { headers: { 'User-Agent': 'BedrockOps-Admin-Client' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed with status code: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }

    get(url);
  });
}

main().catch(err => {
  console.error('Error downloading launcher:', err);
  process.exit(1);
});
