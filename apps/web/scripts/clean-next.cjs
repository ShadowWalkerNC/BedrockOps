/**
 * Cross-platform wipe of the Next.js cache.
 * Prefer this over inline `node -e` — PowerShell mangles `{recursive:true}`.
 */
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');
fs.rmSync(nextDir, { recursive: true, force: true });
console.log(`[web] removed ${nextDir}`);
