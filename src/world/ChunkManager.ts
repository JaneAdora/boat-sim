import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_LOAD_RADIUS } from './WorldSeed';
import { generateIsland, IslandData } from './IslandGenerator';
import { createTerrainMesh, createTreeInstances } from './TerrainGenerator';

interface LoadedChunk {
  key: string;
  chunkX: number;
  chunkZ: number;
  island: IslandData | null;
  terrainMesh: THREE.Mesh | null;
  treeGroup: THREE.Group | null;
}

export class ChunkManager {
  private chunks = new Map<string, LoadedChunk>();
  private scene: THREE.Scene;
  private islandPositions: { x: number; z: number; radius: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  update(playerX: number, playerZ: number): void {
    const currentChunkX = Math.floor(playerX / CHUNK_SIZE);
    const currentChunkZ = Math.floor(playerZ / CHUNK_SIZE);

    const needed = new Set<string>();

    // Determine which chunks should be loaded
    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
        const cx = currentChunkX + dx;
        const cz = currentChunkZ + dz;
        const key = this.chunkKey(cx, cz);
        needed.add(key);

        if (!this.chunks.has(key)) {
          this.loadChunk(cx, cz);
        }
      }
    }

    // Unload chunks that are out of range
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        this.unloadChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  private loadChunk(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz);
    const island = generateIsland(cx, cz, CHUNK_SIZE);

    let terrainMesh: THREE.Mesh | null = null;
    let treeGroup: THREE.Group | null = null;

    if (island) {
      terrainMesh = createTerrainMesh(island);
      this.scene.add(terrainMesh);

      treeGroup = createTreeInstances(island);
      this.scene.add(treeGroup);

      this.islandPositions.push({
        x: island.centerX,
        z: island.centerZ,
        radius: island.radius,
      });
    }

    this.chunks.set(key, { key, chunkX: cx, chunkZ: cz, island, terrainMesh, treeGroup });
  }

  private unloadChunk(chunk: LoadedChunk): void {
    if (chunk.terrainMesh) {
      this.scene.remove(chunk.terrainMesh);
      chunk.terrainMesh.geometry.dispose();
      (chunk.terrainMesh.material as THREE.Material).dispose();
    }
    if (chunk.treeGroup) {
      this.scene.remove(chunk.treeGroup);
      chunk.treeGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }

    if (chunk.island) {
      this.islandPositions = this.islandPositions.filter(
        (p) => !(Math.abs(p.x - chunk.island!.centerX) < 1 && Math.abs(p.z - chunk.island!.centerZ) < 1)
      );
    }
  }

  getIslandPositions(): { x: number; z: number; radius: number }[] {
    return this.islandPositions;
  }
}
