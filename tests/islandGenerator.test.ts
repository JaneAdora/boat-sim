import { describe, expect, it } from 'vitest';
import { hasIsland, generateIsland } from '../src/world/IslandGenerator';
import { CHUNK_SIZE } from '../src/world/WorldSeed';

// Worldgen must be a pure function of chunk coordinates: collision, rendering,
// minimap, and discovery all assume the same chunk always produces the same
// island. These tests pin that contract.
describe('island generation determinism', () => {
  it('hasIsland returns identical results across calls', () => {
    for (let x = -10; x <= 10; x += 2) {
      for (let z = -10; z <= 10; z += 2) {
        expect(hasIsland(x, z)).toBe(hasIsland(x, z));
      }
    }
  });

  it('generateIsland reproduces center, radius, biome, and heightmap', () => {
    // Find a few chunks that actually contain islands
    const islandChunks: [number, number][] = [];
    for (let x = -20; x <= 20 && islandChunks.length < 5; x++) {
      for (let z = -20; z <= 20 && islandChunks.length < 5; z++) {
        if (hasIsland(x, z)) islandChunks.push([x, z]);
      }
    }
    expect(islandChunks.length).toBeGreaterThan(0);

    for (const [x, z] of islandChunks) {
      const a = generateIsland(x, z, CHUNK_SIZE)!;
      const b = generateIsland(x, z, CHUNK_SIZE)!;
      expect(a.centerX).toBe(b.centerX);
      expect(a.centerZ).toBe(b.centerZ);
      expect(a.radius).toBe(b.radius);
      expect(a.biome).toBe(b.biome);
      expect(a.heightmap).toEqual(b.heightmap);
      expect(a.treePositions.length).toBe(b.treePositions.length);
    }
  });

  it('keeps island radius within the documented [30, 100] bounds', () => {
    // getTerrainHeight's O(1) 3x3 lookup assumes heightmap extent
    // (radius * 1.25) stays under one chunk — radius <= 100 guarantees that.
    for (let x = -30; x <= 30; x += 3) {
      for (let z = -30; z <= 30; z += 3) {
        const island = generateIsland(x, z, CHUNK_SIZE);
        if (!island) continue;
        expect(island.radius).toBeGreaterThanOrEqual(30);
        expect(island.radius).toBeLessThanOrEqual(100);
      }
    }
  });
});
