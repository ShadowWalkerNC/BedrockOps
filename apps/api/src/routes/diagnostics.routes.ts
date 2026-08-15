import { Router, Response } from 'express';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { db, BedrockServer } from '@mc-admin/db';
import { BedrockDiagnostics, RakNetPingResult } from '@mc-admin/bedrock';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const diagnosticsRouter: Router = Router();

// Allow authenticated requests (and optional dev token for testing)
diagnosticsRouter.use(authenticateJwt);

function checkProcessRunning(exeName = 'bedrock_server'): { running: boolean; pid?: number; memoryMb?: number } {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`powershell -Command "Get-Process ${exeName} -ErrorAction SilentlyContinue | Select-Object -First 1 Id, WorkingSet64 | ConvertTo-Json"`, { encoding: 'utf8' });
      if (output.trim()) {
        const parsed = JSON.parse(output);
        return {
          running: true,
          pid: parsed.Id,
          memoryMb: Math.round(parsed.WorkingSet64 / 1024 / 1024)
        };
      }
    }
  } catch (_) {}
  return { running: false };
}

function checkLoopbackExemption(): boolean {
  try {
    if (process.platform === 'win32') {
      const output = execSync('CheckNetIsolation.exe LoopbackExempt -s', { encoding: 'utf8' });
      return output.includes('Microsoft.MinecraftUWP') || output.includes('minecraft');
    }
  } catch (_) {}
  return true; // Default true on non-Windows
}

/**
 * GET /api/v1/diagnostics/servers/:id — Deep real-time diagnostics for a server
 */
diagnosticsRouter.get('/servers/:id', async (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  const port = server.port || 19132;
  const host = server.host || '127.0.0.1';

  let pingResult: RakNetPingResult | null = null;
  try {
    pingResult = await BedrockDiagnostics.pingRakNet(host, port, 2000);
  } catch (_) {}

  const proc = checkProcessRunning('bedrock_server');
  const loopbackExempt = checkLoopbackExemption();

  // Read properties if accessible
  let onlineMode = false;
  try {
    const serverPath = path.resolve(process.cwd(), server.serverPath || `data/servers/${server.id}`);
    const propsPath = path.join(serverPath, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const content = fs.readFileSync(propsPath, 'utf8');
      onlineMode = content.includes('online-mode=true');
    }
  } catch (_) {}

  const assessment = BedrockDiagnostics.assessHealth(
    pingResult,
    proc.running,
    onlineMode,
    loopbackExempt
  );

  return res.json({
    serverId: server.id,
    serverName: server.name,
    timestamp: new Date().toISOString(),
    overallStatus: assessment.overallStatus,
    raknet: pingResult,
    process: proc,
    network: {
      loopbackExempt,
      onlineMode,
      port,
      host
    },
    issues: assessment.issues
  });
});

/**
 * POST /api/v1/diagnostics/remediate — 1-Click Automated Issue Remediation
 */
diagnosticsRouter.post('/remediate', async (req: AuthenticatedRequest, res: Response) => {
  const { serverId, action } = req.body as { serverId: string; action: string };
  const server = db.servers.find((s) => s.id === serverId && !s.deletedAt);

  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    switch (action) {
      case 'GRANT_LOOPBACK_EXEMPTION': {
        if (process.platform === 'win32') {
          execSync('CheckNetIsolation.exe LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"', { stdio: 'ignore' });
        }
        return res.json({ success: true, message: 'Windows UWP Loopback Exemption granted successfully.' });
      }

      case 'DISABLE_ONLINE_MODE': {
        const serverPath = path.resolve(process.cwd(), server.serverPath || `data/servers/${server.id}`);
        const propsPath = path.join(serverPath, 'server.properties');
        if (fs.existsSync(propsPath)) {
          let content = fs.readFileSync(propsPath, 'utf8');
          content = content.replace(/online-mode=true/g, 'online-mode=false');
          fs.writeFileSync(propsPath, content, 'utf8');
        }
        return res.json({ success: true, message: 'online-mode set to false in server.properties.' });
      }

      case 'START_SERVER':
      case 'RESTART_SERVER': {
        const serverPath = path.resolve(process.cwd(), server.serverPath || `data/servers/${server.id}`);
        const exePath = path.join(serverPath, 'bedrock_server.exe');

        if (process.platform === 'win32' && fs.existsSync(exePath)) {
          try { execSync('powershell -Command "Stop-Process -Name bedrock_server -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' }); } catch (_) {}
          execSync(`powershell -Command "Start-Process -FilePath '${exePath}' -WorkingDirectory '${serverPath}' -WindowStyle Minimized"`, { stdio: 'ignore' });
        }
        return res.json({ success: true, message: 'Bedrock Dedicated Server restarted successfully.' });
      }

      default:
        return res.status(400).json({ error: `Unknown remediation action: ${action}` });
    }
  } catch (err) {
    return res.status(500).json({ error: `Remediation failed: ${String(err)}` });
  }
});
