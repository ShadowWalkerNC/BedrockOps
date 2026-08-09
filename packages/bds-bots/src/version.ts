/**
 * Pick a bedrock-protocol client version that can talk to a live BDS build.
 * Mojang's server patch (e.g. 1.26.36) often does not match the library's
 * CURRENT_VERSION (e.g. 1.26.40) — connecting "as latest" then gets
 * packet_violation_warning / outdated_* kicks.
 */
export function pickProtocolVersion(
  serverVersion: string,
  supportedVersions: string[]
): string | undefined {
  const cleaned = serverVersion.trim().replace(/^v/i, '');
  const parts = cleaned.split('.').map((p) => Number(p));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    return undefined;
  }
  const [maj, min, pat] = parts;

  const parsed = supportedVersions
    .map((v) => {
      const segs = v.split('.').map((p) => Number(p));
      if (segs.length < 3 || segs.some((n) => !Number.isFinite(n))) return null;
      return { version: v, maj: segs[0], min: segs[1], pat: segs[2] };
    })
    .filter((x): x is { version: string; maj: number; min: number; pat: number } => x !== null);

  const exact = parsed.find((v) => v.version === `${maj}.${min}.${pat}`);
  if (exact) return exact.version;

  // Same major.minor: highest supported patch that is <= server patch.
  const sameMinor = parsed
    .filter((v) => v.maj === maj && v.min === min && v.pat <= pat)
    .sort((a, b) => b.pat - a.pat);
  if (sameMinor[0]) return sameMinor[0].version;

  // Same major: closest lower minor, highest patch.
  const sameMajorLower = parsed
    .filter((v) => v.maj === maj && v.min < min)
    .sort((a, b) => (b.min - a.min) || (b.pat - a.pat));
  if (sameMajorLower[0]) return sameMajorLower[0].version;

  return undefined;
}
