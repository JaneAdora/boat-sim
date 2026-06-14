import { Biome } from '../world/IslandGenerator';

export interface DiscoverableIsland {
  chunkX: number;
  chunkZ: number;
  x: number;
  z: number;
  radius: number;
  biome: Biome;
}

const STORAGE_KEY = 'tb-discovered';

/** How far beyond an island's radius the boat counts as "arriving" at it. */
const DISCOVERY_MARGIN = 60;

function loadKeys(storage: Storage): Set<string> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Lifetime number of islands discovered (read for the selector stats line). */
export function discoveredCount(storage: Storage = localStorage): number {
  return loadKeys(storage).size;
}

/**
 * Tracks which islands the player has visited, persisted across sessions.
 * Islands are keyed by chunk coordinates — deterministic worldgen means the
 * same key always refers to the same island.
 */
export class DiscoveryTracker {
  private discovered: Set<string>;

  constructor(private storage: Storage = localStorage) {
    this.discovered = loadKeys(storage);
  }

  /** Whether the island in the given chunk has been discovered. */
  isDiscovered(chunkX: number, chunkZ: number): boolean {
    return this.discovered.has(`${chunkX},${chunkZ}`);
  }

  /** Force-mark a chunk discovered + persist (Story Mode pre-discovers Greyharbor). */
  discover(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.discovered.has(key)) return;
    this.discovered.add(key);
    this.persist();
  }

  /**
   * Check the boat position against loaded islands; if it just arrived at an
   * undiscovered one, record it and return that island. Null otherwise.
   */
  check(x: number, z: number, islands: readonly DiscoverableIsland[]): DiscoverableIsland | null {
    for (const island of islands) {
      const dx = x - island.x;
      const dz = z - island.z;
      const reach = island.radius + DISCOVERY_MARGIN;
      if (dx * dx + dz * dz > reach * reach) continue;

      const key = `${island.chunkX},${island.chunkZ}`;
      if (this.discovered.has(key)) continue;

      this.discovered.add(key);
      this.persist();
      return island;
    }
    return null;
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify([...this.discovered]));
    } catch {
      // Storage full or unavailable — discovery still works for this session.
    }
  }
}
