import { describe, it, expect } from 'vitest';
import { getStatusBadgeStyle, UI_THEME } from './index';

describe('UI Package', () => {
  it('returns badge styles for server statuses', () => {
    expect(getStatusBadgeStyle('ONLINE').color).toBe('#4ade80');
    expect(getStatusBadgeStyle('OFFLINE').color).toBe('#f87171');
    expect(getStatusBadgeStyle('UNKNOWN').color).toBe('#9ca3af');
  });

  it('exports theme colors', () => {
    expect(UI_THEME.colors.primary).toBe('#3b82f6');
  });
});
