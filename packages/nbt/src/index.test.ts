import { describe, it, expect } from 'vitest';
import { BedrockNbtInspector } from './index';

describe('@mc-admin/nbt World & Player Inspector', () => {
  it('inspects player data and inventory slots', () => {
    const data = BedrockNbtInspector.inspectPlayer('25354565', 'TestPlayer');
    expect(data.gamertag).toBe('TestPlayer');
    expect(data.inventory.length).toBeGreaterThan(0);
    expect(data.inventory[0].id).toBe('minecraft:diamond_sword');
  });

  it('updates player gamemode state', () => {
    const data = BedrockNbtInspector.inspectPlayer('25354565', 'TestPlayer');
    const updated = BedrockNbtInspector.updatePlayerGamemode(data, 1);
    expect(updated.gamemode).toBe(1);
  });
});
