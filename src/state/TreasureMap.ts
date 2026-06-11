import { generateIsland, IslandData } from '../world/IslandGenerator';
import { chunkHash } from '../world/IslandNames';
import { CHUNK_SIZE } from '../world/WorldSeed';

const STORAGE_KEY = 'tb-treasure';

/** An active treasure hunt: a real island and a dig point just off its shore. */
export interface TreasureMapData {
  chunkX: number;
  chunkZ: number;
  digX: number;
  digZ: number;
  reward: number;
}

/**
 * Pick the map's target island deterministically from where the bottle was
 * found: sweep chunk space 3–7 chunks out in hash order and take the first
 * island. Same bottle spot → same island, for every player, every time.
 */
export function pickTreasureTarget(fromX: number, fromZ: number): TreasureMapData | null {
  const cx0 = Math.floor(fromX / CHUNK_SIZE);
  const cz0 = Math.floor(fromZ / CHUNK_SIZE);

  const candidates: { cx: number; cz: number; order: number }[] = [];
  for (let dz = -7; dz <= 7; dz++) {
    for (let dx = -7; dx <= 7; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring < 3) continue; // not too close — it should be a sail, not a glance
      candidates.push({ cx: cx0 + dx, cz: cz0 + dz, order: chunkHash(cx0 + dx, cz0 + dz, 13) });
    }
  }
  candidates.sort((a, b) => a.order - b.order);

  for (const c of candidates) {
    const island = generateIsland(c.cx, c.cz, CHUNK_SIZE);
    if (!island) continue;
    return makeMap(island);
  }
  return null;
}

function makeMap(island: IslandData): TreasureMapData {
  // The ✕ — a hashed angle off the island center, at the beach line
  const angle = chunkHash(island.chunkX, island.chunkZ, 14) * Math.PI * 2;
  const r = island.radius * 0.7;
  return {
    chunkX: island.chunkX,
    chunkZ: island.chunkZ,
    digX: island.centerX + Math.cos(angle) * r,
    digZ: island.centerZ + Math.sin(angle) * r,
    reward: 120 + Math.round(chunkHash(island.chunkX, island.chunkZ, 15) * 80),
  };
}

/** Resolve the map's island data (for the chart silhouette). */
export function mapIsland(map: TreasureMapData): IslandData | null {
  return generateIsland(map.chunkX, map.chunkZ, CHUNK_SIZE);
}

// ── Persistence ──────────────────────────────────────────────

export function loadTreasureMap(storage: Storage = localStorage): TreasureMapData | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const m = parsed as TreasureMapData;
    if (![m.chunkX, m.chunkZ, m.digX, m.digZ, m.reward].every(Number.isFinite)) return null;
    return m;
  } catch {
    return null;
  }
}

export function saveTreasureMap(map: TreasureMapData | null, storage: Storage = localStorage): void {
  try {
    if (map) storage.setItem(STORAGE_KEY, JSON.stringify(map));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the hunt just doesn't survive a reload.
  }
}

// ── Coastline extraction (for the hand-drawn chart) ──────────

/**
 * Trace the island's waterline from its heightmap: every cell where height
 * crosses zero against a neighbor is a coast point. Returned in heightmap
 * grid coordinates [0, size) — the chart scales them onto parchment.
 */
export function extractCoastline(island: IslandData): { x: number; z: number }[] {
  const size = island.heightmapSize;
  const hm = island.heightmap;
  const points: { x: number; z: number }[] = [];
  const SEA = 0.05;
  for (let z = 1; z < size - 1; z++) {
    for (let x = 1; x < size - 1; x++) {
      const h = hm[z * size + x];
      if (h <= SEA) continue;
      // Land cell with at least one sea neighbor = coast
      if (
        hm[z * size + (x - 1)] <= SEA || hm[z * size + (x + 1)] <= SEA ||
        hm[(z - 1) * size + x] <= SEA || hm[(z + 1) * size + x] <= SEA
      ) {
        points.push({ x, z });
      }
    }
  }
  return points;
}
