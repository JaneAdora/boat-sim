import { describe, expect, it } from 'vitest';
import { islandName } from '../src/world/IslandNames';
import { Biome } from '../src/world/IslandGenerator';

describe('islandName', () => {
  it('is deterministic — same chunk always yields the same name', () => {
    for (let i = -5; i <= 5; i++) {
      expect(islandName(i, -i * 3, 'tropical')).toBe(islandName(i, -i * 3, 'tropical'));
    }
  });

  it('uses biome-flavored suffixes', () => {
    expect(islandName(0, 0, 'desert')).toMatch(/ (Dunes|Flats|Bar|Mesa|Strand|Banks)$/);
    expect(islandName(0, 0, 'rocky')).toMatch(/ (Crag|Skerry|Point|Rock|Bluff|Reach)$/);
  });

  it('produces reasonable variety across nearby chunks', () => {
    const names = new Set<string>();
    const biomes: Biome[] = ['tropical', 'rocky', 'autumn', 'desert'];
    for (let x = 0; x < 10; x++) {
      for (let z = 0; z < 10; z++) {
        names.add(islandName(x, z, biomes[(x + z) % 4]));
      }
    }
    // 100 islands over a 24×6-per-biome name space — collisions are fine,
    // but a healthy hash should still spread well past half.
    expect(names.size).toBeGreaterThan(50);
  });

  it('handles negative chunk coordinates', () => {
    const name = islandName(-1000, -1000, 'autumn');
    expect(name).toMatch(/^\S+ \S+$/);
    expect(islandName(-1000, -1000, 'autumn')).toBe(name);
  });
});
