import { describe, expect, it } from 'vitest';
import { pickProtocolVersion } from './version';

const supported = ['1.26.40', '1.26.30', '1.26.20', '1.26.10', '1.26.0', '1.21.130', '1.21.124'];

describe('pickProtocolVersion', () => {
  it('returns exact match when available', () => {
    expect(pickProtocolVersion('1.26.30', supported)).toBe('1.26.30');
  });

  it('picks highest supported patch <= server for same minor', () => {
    expect(pickProtocolVersion('1.26.36', supported)).toBe('1.26.30');
    expect(pickProtocolVersion('1.26.43', supported)).toBe('1.26.40');
  });

  it('falls back to prior minor when needed', () => {
    expect(pickProtocolVersion('1.21.131', supported)).toBe('1.21.130');
  });

  it('returns undefined for garbage input', () => {
    expect(pickProtocolVersion('nope', supported)).toBeUndefined();
  });
});
