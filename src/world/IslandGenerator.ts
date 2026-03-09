import * as THREE from 'three';
import { SeededNoise } from '../utils/noise';
import { WORLD_SEED } from './WorldSeed';
import { smoothstep } from '../utils/math';

export interface IslandData {
  chunkX: number;
  chunkZ: number;
  centerX: number;
  centerZ: number;
  radius: number;
  heightmap: Float32Array;
  heightmapSize: number;
  treePositions: { x: number; y: number; z: number; scale: number }[];
}

const noise = new SeededNoise(WORLD_SEED);

/**
 * Determine if a chunk should contain an island.
 */
export function hasIsland(chunkX: number, chunkZ: number): boolean {
  const value = noise.sample2D(chunkX * 0.15 + 100, chunkZ * 0.15 + 100);
  return value > 0.35;
}

/**
 * Generate island data for a given chunk.
 */
export function generateIsland(chunkX: number, chunkZ: number, chunkSize: number): IslandData | null {
  if (!hasIsland(chunkX, chunkZ)) return null;

  const hmSize = 64; // heightmap resolution
  const heightmap = new Float32Array(hmSize * hmSize);

  // Island center (slightly offset from chunk center for variety)
  const offsetX = noise.sample2D(chunkX * 0.7, chunkZ * 0.3) * chunkSize * 0.2;
  const offsetZ = noise.sample2D(chunkX * 0.3, chunkZ * 0.7) * chunkSize * 0.2;
  const centerX = chunkX * chunkSize + chunkSize / 2 + offsetX;
  const centerZ = chunkZ * chunkSize + chunkSize / 2 + offsetZ;

  // Island radius varies
  const radiusBase = 40 + noise.sample2D(chunkX * 1.1, chunkZ * 1.1) * 60;
  const radius = Math.max(30, radiusBase);

  // Generate heightmap
  const scale = radius * 2.5 / hmSize;
  let maxHeight = 0;

  for (let z = 0; z < hmSize; z++) {
    for (let x = 0; x < hmSize; x++) {
      const worldX = centerX + (x - hmSize / 2) * scale;
      const worldZ = centerZ + (z - hmSize / 2) * scale;

      // Distance from center (normalized 0-1)
      const dx = (worldX - centerX) / radius;
      const dz = (worldZ - centerZ) / radius;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Radial falloff with domain warping for organic coastlines
      const warpX = noise.sample2D(worldX * 0.02, worldZ * 0.02) * 0.3;
      const warpZ = noise.sample2D(worldX * 0.02 + 50, worldZ * 0.02 + 50) * 0.3;
      const warpedDist = Math.sqrt((dx + warpX) * (dx + warpX) + (dz + warpZ) * (dz + warpZ));

      const falloff = 1 - smoothstep(0.4, 1.0, warpedDist);

      // Terrain height from FBM noise
      const terrainNoise = noise.fbm2D(worldX * 0.01, worldZ * 0.01, 5, 2.0, 0.5);
      const ridged = noise.ridged2D(worldX * 0.008, worldZ * 0.008, 4, 2.0, 0.5);

      // Blend FBM with ridged for variety
      const blendedNoise = terrainNoise * 0.6 + ridged * 0.4;
      const height = (blendedNoise * 0.5 + 0.5) * falloff * 25; // max ~25m high

      heightmap[z * hmSize + x] = Math.max(0, height - 0.5); // slight offset so beaches are at sea level
      maxHeight = Math.max(maxHeight, heightmap[z * hmSize + x]);
    }
  }

  // Place trees using simple grid + jitter (pseudo Poisson disk)
  const treePositions: { x: number; y: number; z: number; scale: number }[] = [];
  const treeSpacing = 12;

  for (let z = 2; z < hmSize - 2; z += 3) {
    for (let x = 2; x < hmSize - 2; x += 3) {
      const h = heightmap[z * hmSize + x];
      if (h < 1.5 || h > 18) continue; // no trees on beaches or peaks

      // Jitter position
      const jx = noise.sample2D(x * 3.7 + chunkX * 100, z * 3.7 + chunkZ * 100) * 1.5;
      const jz = noise.sample2D(x * 3.7 + chunkX * 100 + 50, z * 3.7 + chunkZ * 100 + 50) * 1.5;

      const worldX = centerX + (x + jx - hmSize / 2) * scale;
      const worldZ = centerZ + (z + jz - hmSize / 2) * scale;

      // Random probability to thin out
      const prob = noise.sample2D(worldX * 0.1, worldZ * 0.1);
      if (prob < 0.0) continue;

      const treeScale = 0.8 + noise.sample2D(worldX * 0.5, worldZ * 0.5) * 0.5;

      treePositions.push({ x: worldX, y: h, z: worldZ, scale: treeScale });
    }
  }

  return {
    chunkX,
    chunkZ,
    centerX,
    centerZ,
    radius,
    heightmap,
    heightmapSize: hmSize,
    treePositions,
  };
}
