import type { BedrockServer } from '@mc-admin/db';
import { createMinimalLevelDat, patchLevelDatExperiments } from './nbt';
import type { HostProvider } from './provider';

export interface ExperimentApplyResult {
  success: boolean;
  stub?: boolean;
  applied: string[];
  created?: boolean;
  relativePath?: string;
  error?: string;
}

function defaultLevelName(explicit?: string): string {
  return explicit?.trim() || 'Bedrock level';
}

/**
 * Read → patch → write level.dat experiments via the agent.
 * If level.dat is missing, writes a minimal document (created=true).
 * Never reports success when the host write failed.
 */
export async function applyWorldExperiments(
  provider: HostProvider,
  server: BedrockServer,
  experimentIds: string[],
  options?: { levelName?: string }
): Promise<ExperimentApplyResult> {
  if (!experimentIds.length) {
    return { success: true, applied: [] };
  }

  const levelName = defaultLevelName(options?.levelName);
  const relativePath = `worlds/${levelName}/level.dat`;

  const existing = await provider.readWorldFile(server, { relativePath });
  let buffer: Buffer;
  let created = false;

  if (existing.success && existing.contentsBase64) {
    try {
      const raw = Buffer.from(existing.contentsBase64, 'base64');
      buffer = patchLevelDatExperiments(raw, experimentIds).buffer;
    } catch (err: unknown) {
      return {
        success: false,
        applied: [],
        relativePath,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  } else if (
    existing.error &&
    (existing.error.includes('not found') ||
      existing.error.includes('ENOENT') ||
      existing.error.includes('no such file'))
  ) {
    buffer = createMinimalLevelDat(experimentIds);
    created = true;
  } else if (existing.stub || !existing.success) {
    return {
      success: false,
      stub: existing.stub,
      applied: [],
      relativePath,
      error: existing.error || 'Failed to read level.dat'
    };
  } else {
    buffer = createMinimalLevelDat(experimentIds);
    created = true;
  }

  const write = await provider.writeWorldFile(server, {
    relativePath,
    contentsBase64: buffer.toString('base64'),
    backup: !created
  });

  if (!write.success) {
    return {
      success: false,
      stub: write.stub,
      applied: [],
      created,
      relativePath,
      error: write.error || 'Failed to write level.dat'
    };
  }

  return {
    success: true,
    applied: [...experimentIds],
    created,
    relativePath
  };
}
