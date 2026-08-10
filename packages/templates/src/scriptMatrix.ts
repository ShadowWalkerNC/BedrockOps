/**
 * Wave D — Script API compatibility matrix per seeded BDS pin.
 * Apply gates use this before writing Script packs to disk.
 * Unknown BDS versions fail closed (honest refuse).
 */

export interface ScriptApiMatrixRow {
  bdsVersion: string;
  scriptApiSupported: boolean;
  /** Declared @minecraft/* module versions available on this pin. */
  modules: Record<string, string>;
  notes?: string;
}

export const SCRIPT_API_MATRIX: ScriptApiMatrixRow[] = [
  {
    bdsVersion: '1.20.80',
    scriptApiSupported: false,
    modules: {},
    notes: 'Script API apply disabled for this pin — upgrade to 1.21.0+ for Script packs.'
  },
  {
    bdsVersion: '1.21.0',
    scriptApiSupported: true,
    modules: {
      '@minecraft/server': '1.11.0',
      '@minecraft/server-ui': '1.2.0'
    },
    notes: 'Script modules allowed for first-party vetted packs on 1.21.0.'
  }
];

export interface ScriptCompatResult {
  ok: boolean;
  reason?: string;
  matrix?: ScriptApiMatrixRow;
}

function parseSemverParts(v: string): [number, number, number] {
  const parts = v.split('.').map((p) => parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** True when `have` is >= `need` on major.minor.patch (numeric). */
export function moduleVersionMeets(have: string, need: string): boolean {
  const a = parseSemverParts(have);
  const b = parseSemverParts(need);
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] >= b[2];
}

export function lookupScriptMatrix(bdsVersion: string): ScriptApiMatrixRow | undefined {
  const exact = SCRIPT_API_MATRIX.find((r) => r.bdsVersion === bdsVersion);
  if (exact) return exact;
  // Allow patch suffixes like 1.21.0.03 → 1.21.0
  const truncated = bdsVersion.split('.').slice(0, 3).join('.');
  return SCRIPT_API_MATRIX.find((r) => r.bdsVersion === truncated);
}

export function checkScriptCompatibility(
  bdsVersion: string,
  requiredModules: Record<string, string> = {}
): ScriptCompatResult {
  const matrix = lookupScriptMatrix(bdsVersion);
  if (!matrix) {
    return {
      ok: false,
      reason: `BDS ${bdsVersion} is not in the Script API matrix — compatibility unverified.`
    };
  }
  if (!matrix.scriptApiSupported) {
    return {
      ok: false,
      matrix,
      reason:
        matrix.notes ||
        `Script API packs are not enabled for BDS ${matrix.bdsVersion} in the compatibility matrix.`
    };
  }
  for (const [mod, need] of Object.entries(requiredModules)) {
    const have = matrix.modules[mod];
    if (!have) {
      return {
        ok: false,
        matrix,
        reason: `BDS ${matrix.bdsVersion} does not declare Script module ${mod}.`
      };
    }
    if (!moduleVersionMeets(have, need)) {
      return {
        ok: false,
        matrix,
        reason: `BDS ${matrix.bdsVersion} has ${mod}@${have} but pack requires >= ${need}.`
      };
    }
  }
  return { ok: true, matrix };
}
