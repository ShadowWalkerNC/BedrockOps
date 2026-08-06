import { describe, it, expect } from 'vitest';
import { BedrockServerController } from './index';
import { db, ServerStatus } from '@mc-admin/db';

describe('Bedrock Domain Package', () => {
  it('parses and serializes server properties accurately', () => {
    const propertiesStr = 'gamemode=survival\ndifficulty=hard';
    const parsed = BedrockServerController.parseProperties(propertiesStr);
    expect(parsed.gamemode).toBe('survival');
    expect(parsed.difficulty).toBe('hard');

    const reserialized = BedrockServerController.serializeProperties(parsed);
    expect(reserialized).toContain('gamemode=survival');
    expect(reserialized).toContain('difficulty=hard');
  });

  it('updates server status', () => {
    const server = db.servers[0];
    BedrockServerController.setServerStatus(server, ServerStatus.OFFLINE);
    expect(server.status).toBe(ServerStatus.OFFLINE);
  });
});
