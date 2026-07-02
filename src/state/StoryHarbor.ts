import { generateIsland } from '../world/IslandGenerator';
import { harborEligible } from './Harbor';
import { chunkHash } from '../world/IslandNames';
import { CHUNK_SIZE } from '../world/WorldSeed';

export interface StoryHarbor {
  chunkX: number;
  chunkZ: number;
  x: number;
  z: number;
  radius: number;
  dock: { x: number; z: number };
  spawn: { x: number; z: number };
}

/**
 * The nearest harbor-eligible island to the world origin, deterministic.
 * Greyharbor — the campaign's home dock. The bearing + outer-radius mapping
 * mirrors ChunkManager.createHarbor exactly so dock/spawn land on the real dock.
 */
export function findStoryHarbor(maxRing = 8): StoryHarbor | null {
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let cx = -ring; cx <= ring; cx++) {
      for (let cz = -ring; cz <= ring; cz++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== ring) continue; // ring perimeter only
        const isl = generateIsland(cx, cz, CHUNK_SIZE);
        if (!isl || !harborEligible(isl.radius, cx, cz)) continue;
        const angle = chunkHash(cx, cz, 22) * Math.PI * 2; // same salt + mapping as createHarbor
        const dock = {
          x: isl.centerX + Math.cos(angle) * (isl.radius + 24),
          z: isl.centerZ + Math.sin(angle) * (isl.radius + 24),
        };
        const spawn = {
          x: isl.centerX + Math.cos(angle) * (isl.radius + 38),
          z: isl.centerZ + Math.sin(angle) * (isl.radius + 38),
        };
        return { chunkX: cx, chunkZ: cz, x: isl.centerX, z: isl.centerZ, radius: isl.radius, dock, spawn };
      }
    }
  }
  return null;
}

/**
 * True if no island covers (x,z) within `clearance`. Samples generateIsland
 * directly for the target + neighbour chunks — live ChunkManager.getTerrainHeight
 * returns 0 for unloaded chunks and would lie here.
 */
export function isOpenWater(x: number, z: number, clearance = 60): boolean {
  const ccx = Math.floor(x / CHUNK_SIZE);
  const ccz = Math.floor(z / CHUNK_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const isl = generateIsland(ccx + dx, ccz + dz, CHUNK_SIZE);
      if (!isl) continue;
      if (Math.hypot(x - isl.centerX, z - isl.centerZ) < isl.radius + clearance) return false;
    }
  }
  return true;
}
