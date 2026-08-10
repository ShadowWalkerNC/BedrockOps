import { describe, it, expect } from 'vitest';
import {
  SCRIPT_API_MATRIX,
  checkScriptCompatibility,
  moduleVersionMeets,
  lookupScriptMatrix
} from './scriptMatrix';

describe('Script API matrix (Wave D)', () => {
  it('lists seeded BDS pins', () => {
    expect(SCRIPT_API_MATRIX.some((r) => r.bdsVersion === '1.21.0' && r.scriptApiSupported)).toBe(
      true
    );
    expect(lookupScriptMatrix('1.20.80')?.scriptApiSupported).toBe(false);
  });

  it('compares module versions', () => {
    expect(moduleVersionMeets('1.11.0', '1.11.0')).toBe(true);
    expect(moduleVersionMeets('1.12.0', '1.11.0')).toBe(true);
    expect(moduleVersionMeets('1.10.0', '1.11.0')).toBe(false);
  });

  it('allows Script packs on 1.21.0 with matching modules', () => {
    const ok = checkScriptCompatibility('1.21.0', { '@minecraft/server': '1.11.0' });
    expect(ok.ok).toBe(true);
  });

  it('refuses Script packs on 1.20.80', () => {
    const bad = checkScriptCompatibility('1.20.80', { '@minecraft/server': '1.11.0' });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBeTruthy();
  });

  it('fails closed for unknown BDS versions', () => {
    const unknown = checkScriptCompatibility('9.9.9', { '@minecraft/server': '1.0.0' });
    expect(unknown.ok).toBe(false);
  });
});
