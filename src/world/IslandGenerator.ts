import * as THREE from 'three';
import { SeededNoise } from '../utils/noise';
import { WORLD_SEED } from './WorldSeed';
import { smoothstep } from '../utils/math';

export type Biome = 'tropical' | 'rocky' | 'autumn' | 'desert';

export interface IslandData {
  chunkX: number;
  chunkZ: number;
  centerX: number;
  centerZ: number;
  radius: number;
  heightmap: Float32Array;
  heightmapSize: number;
  treePositions: { x: number; y: number; z: number; scale: number }[];
  biome: Biome;
}

const noise = new SeededNoise(WORLD_SEED);

/**
 * Determine if a chunk should contain an island.
 */
export function hasIsland(chunkX: number, chunkZ: number): boolean {
  const value = noise.sample2D(chunkX * 0.15 + 100, chunkZ * 0.15 + 100);
  return value > 0.05;
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

  // Determine biome from noise
  const biomeNoise = noise.sample2D(chunkX * 0.3 + 200, chunkZ * 0.3 + 200);
  let biome: Biome;
  if (biomeNoise < -0.3) {
    biome = 'desert';
  } else if (biomeNoise < 0.0) {
    biome = 'rocky';
  } else if (biomeNoise < 0.35) {
    biome = 'tropical';
  } else {
    biome = 'autumn';
  }

  // Place trees using simple grid + jitter (pseudo Poisson disk)
  // Biome-dependent tree placement parameters
  const treePositions: { x: number; y: number; z: number; scale: number }[] = [];

  if (biome === 'desert') {
    // Desert: no trees at all
  } else {
    const gridStep = biome === 'rocky' ? 5 : biome === 'autumn' ? 2.5 : 3;
    const minHeight = biome === 'rocky' ? 3 : 1.5;
    const maxHeight = biome === 'autumn' ? 20 : 18;

    // Use fractional step with floor to handle non-integer steps
    for (let zf = 2; zf < hmSize - 2; zf += gridStep) {
      const z = Math.floor(zf);
      for (let xf = 2; xf < hmSize - 2; xf += gridStep) {
        const x = Math.floor(xf);
        const h = heightmap[z * hmSize + x];
        if (h < minHeight || h > maxHeight) continue;

        // Rocky biome: skip steep slopes
        if (biome === 'rocky') {
          let slope = 0;
          if (x > 0 && x < hmSize - 1 && z > 0 && z < hmSize - 1) {
            const hL = heightmap[z * hmSize + (x - 1)];
            const hR = heightmap[z * hmSize + (x + 1)];
            const hU = heightmap[(z - 1) * hmSize + x];
            const hD = heightmap[(z + 1) * hmSize + x];
            slope = Math.abs(hR - hL) + Math.abs(hD - hU);
          }
          if (slope > 2) continue; // only on gentler slopes
        }

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
    biome,
  };
}
