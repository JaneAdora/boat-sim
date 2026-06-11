import { Biome } from './IslandGenerator';

/**
 * Deterministic island names. A name is a pure function of the island's chunk
 * coordinates + biome, so every visit (and every session) agrees on what an
 * island is called — discovery state can then be keyed by chunk alone.
 */

// 32-bit integer hash of chunk coords → [0, 1). Math.imul keeps the
// multiplications in 32-bit space (plain * would lose low bits as floats).
function hash2D(cx: number, cz: number, salt: number): number {
  let h = Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263) ^ Math.imul(salt, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const PREFIXES = [
  'Pearl', 'Ember', 'Driftwood', 'Misty', 'Coral', 'Sapphire',
  'Whisper', 'Golden', 'Hidden', 'Lonely', 'Siren', 'Sunset',
  'Moonrise', 'Tradewind', 'Saltgrass', 'Compass', 'Lantern', 'Harbor',
  'Gull', 'Tortoise', 'Cinnamon', 'Velvet', 'Thunder', 'Quiet',
];

const SUFFIXES: Record<Biome, string[]> = {
  tropical: ['Atoll', 'Cay', 'Lagoon', 'Isle', 'Shoals', 'Palms'],
  rocky: ['Crag', 'Skerry', 'Point', 'Rock', 'Bluff', 'Reach'],
  autumn: ['Grove', 'Haven', 'Hollow', 'Isle', 'Glen', 'Landing'],
  desert: ['Dunes', 'Flats', 'Bar', 'Mesa', 'Strand', 'Banks'],
};

export function islandName(chunkX: number, chunkZ: number, biome: Biome): string {
  const prefix = PREFIXES[Math.floor(hash2D(chunkX, chunkZ, 1) * PREFIXES.length)];
  const suffixes = SUFFIXES[biome];
  const suffix = suffixes[Math.floor(hash2D(chunkX, chunkZ, 2) * suffixes.length)];
  return `${prefix} ${suffix}`;
}
