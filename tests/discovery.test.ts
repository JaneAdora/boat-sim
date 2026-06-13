import { describe, expect, it } from 'vitest';
import { DiscoveryTracker, DiscoverableIsland, discoveredCount } from '../src/state/DiscoveryTracker';
import { loadStats, recordVoyageStart, bumpBestKills } from '../src/state/VoyageLog';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const island = (chunkX: number, chunkZ: number): DiscoverableIsland => ({
  chunkX,
  chunkZ,
  x: chunkX * 300 + 150,
  z: chunkZ * 300 + 150,
  radius: 50,
  biome: 'tropical',
});

describe('DiscoveryTracker', () => {
  it('discovers an island once when the boat comes within reach', () => {
    const storage = new MemoryStorage();
    const tracker = new DiscoveryTracker(storage);
    const islands = [island(0, 0)];

    // 150,150 is dead center; radius 50 + margin 60 = reach 110
    expect(tracker.check(150, 150, islands)).toBe(islands[0]);
    // Second visit: already discovered
    expect(tracker.check(150, 150, islands)).toBeNull();
  });

  it('ignores islands out of reach', () => {
    const tracker = new DiscoveryTracker(new MemoryStorage());
    // 120 units away from the island edge-reach of 110
    expect(tracker.check(150, 150 + 111 + 50, [island(0, 0)])).toBeNull();
  });

  it('persists discoveries across tracker instances (sessions)', () => {
    const storage = new MemoryStorage();
    new DiscoveryTracker(storage).check(150, 150, [island(0, 0)]);

    const secondSession = new DiscoveryTracker(storage);
    expect(secondSession.check(150, 150, [island(0, 0)])).toBeNull();
    expect(discoveredCount(storage)).toBe(1);
  });

  it('recovers from corrupted storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('tb-discovered', 'not json{');
    const tracker = new DiscoveryTracker(storage);
    expect(tracker.check(150, 150, [island(0, 0)])).not.toBeNull();
  });
});

describe('VoyageLog', () => {
  it('counts voyages and keeps the best kill count as a high-water mark', () => {
    const storage = new MemoryStorage();
    recordVoyageStart(storage);
    recordVoyageStart(storage);
    bumpBestKills(7, storage);
    bumpBestKills(3, storage); // lower — must not regress
    expect(loadStats(storage)).toEqual({ bestKills: 7, voyages: 2, contracts: 0 });
  });

  it('defaults cleanly on corrupted storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('tb-stats', '][');
    expect(loadStats(storage)).toEqual({ bestKills: 0, voyages: 0, contracts: 0 });
  });
});
