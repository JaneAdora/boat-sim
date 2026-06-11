import { describe, expect, it } from 'vitest';
import {
  pickTreasureTarget, mapIsland, extractCoastline,
  loadTreasureMap, saveTreasureMap,
} from '../src/state/TreasureMap';
import { generateIsland } from '../src/world/IslandGenerator';
import { CHUNK_SIZE } from '../src/world/WorldSeed';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('treasure maps', () => {
  it('picks the same island and dig point for the same bottle spot (deterministic)', () => {
    const a = pickTreasureTarget(450, -1200);
    const b = pickTreasureTarget(450, -1200);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });

  it('targets a real island 3-7 chunks out with the dig on its beach line', () => {
    const map = pickTreasureTarget(0, 0)!;
    const ring = Math.max(Math.abs(map.chunkX), Math.abs(map.chunkZ));
    expect(ring).toBeGreaterThanOrEqual(3);
    expect(ring).toBeLessThanOrEqual(7);

    const island = mapIsland(map)!;
    expect(island).not.toBeNull();
    const d = Math.hypot(map.digX - island.centerX, map.digZ - island.centerZ);
    expect(d).toBeCloseTo(island.radius * 0.7, 5);
    expect(map.reward).toBeGreaterThanOrEqual(120);
    expect(map.reward).toBeLessThanOrEqual(200);
  });

  it('extracts a non-empty in-bounds coastline from a real island heightmap', () => {
    // Find any real island near the origin
    let island = null;
    outer: for (let cx = -8; cx <= 8; cx++) {
      for (let cz = -8; cz <= 8; cz++) {
        island = generateIsland(cx, cz, CHUNK_SIZE);
        if (island) break outer;
      }
    }
    expect(island).not.toBeNull();
    const coast = extractCoastline(island!);
    expect(coast.length).toBeGreaterThan(20); // a real ring of shore points
    for (const p of coast) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(island!.heightmapSize);
      expect(p.z).toBeGreaterThan(0);
      expect(p.z).toBeLessThan(island!.heightmapSize);
    }
  });

  it('persists the active hunt and survives corrupt storage', () => {
    const s = new MemoryStorage();
    const map = pickTreasureTarget(0, 0)!;
    saveTreasureMap(map, s);
    expect(loadTreasureMap(s)).toEqual(map);
    saveTreasureMap(null, s);
    expect(loadTreasureMap(s)).toBeNull();
    s.setItem('tb-treasure', '{nope');
    expect(loadTreasureMap(s)).toBeNull();
  });
});
