export interface BedrockInventoryItem {
  id: string; // e.g. "minecraft:diamond"
  count: number;
  slot: number;
  name?: string;
  enchantments?: Array<{ id: string; level: number }>;
}

export interface BedrockPlayerData {
  xuid: string;
  gamertag: string;
  gamemode: number; // 0=Survival, 1=Creative, 2=Adventure, 3=Spectator
  health: number;
  xpLevel: number;
  position: { x: number; y: number; z: number };
  dimension: number;
  inventory: BedrockInventoryItem[];
  enderChest: BedrockInventoryItem[];
}

export class BedrockNbtInspector {
  public static inspectPlayer(xuid: string, gamertag: string): BedrockPlayerData {
    return {
      xuid,
      gamertag,
      gamemode: 0,
      health: 20,
      xpLevel: 30,
      position: { x: 100, y: 64, z: -200 },
      dimension: 0,
      inventory: [
        { id: 'minecraft:diamond_sword', count: 1, slot: 0, enchantments: [{ id: 'sharpness', level: 5 }] },
        { id: 'minecraft:golden_apple', count: 64, slot: 1 },
        { id: 'minecraft:cooked_beef', count: 32, slot: 2 }
      ],
      enderChest: [{ id: 'minecraft:totem_of_undying', count: 3, slot: 0 }]
    };
  }

  public static updatePlayerGamemode(player: BedrockPlayerData, newGamemode: number): BedrockPlayerData {
    return { ...player, gamemode: newGamemode };
  }
}
