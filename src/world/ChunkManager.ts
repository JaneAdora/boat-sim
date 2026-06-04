import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_LOAD_RADIUS } from './WorldSeed';
import { generateIsland, IslandData, Biome } from './IslandGenerator';
import { createTerrainMesh, createTreeInstances, createShoreRocks, createLighthouse } from './TerrainGenerator';

interface LoadedChunk {
  key: string;
  chunkX: number;
  chunkZ: number;
  island: IslandData | null;
  terrainMesh: THREE.Mesh | null;
  treeGroup: THREE.Group | null;
  rockGroup: THREE.Group | null;
  lighthouse: THREE.Group | null;
  buoys: THREE.Group | null;
}

export class ChunkManager {
  private chunks = new Map<string, LoadedChunk>();
  private scene: THREE.Scene;
  private islandPositions: { x: number; z: number; radius: number; biome: Biome }[] = [];

  // Streaming state. The immediate 3x3 ring loads synchronously (terrain under
  // and adjacent to the boat must exist for collision/buoyancy every frame);
  // distant chunks build a few per frame so generation never hitches.
  private lastChunkX = NaN;
  private lastChunkZ = NaN;
  private buildQueue: { cx: number; cz: number; key: string }[] = [];
  private queuedKeys = new Set<string>();
  private static readonly IMMEDIATE_RADIUS = 1; // 3x3 around the player
  private static readonly BUILD_BUDGET = 3;      // distant chunks built per frame

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  update(playerX: number, playerZ: number): void {
    const currentChunkX = Math.floor(playerX / CHUNK_SIZE);
    const currentChunkZ = Math.floor(playerZ / CHUNK_SIZE);

    // Reconcile the desired chunk set only when the player crosses a chunk
    // boundary — avoids recomputing the 9x9 ring every frame (and the old
    // behaviour of building a whole new row synchronously on a fast turn).
    if (currentChunkX !== this.lastChunkX || currentChunkZ !== this.lastChunkZ) {
      this.reconcileChunks(currentChunkX, currentChunkZ);
      this.lastChunkX = currentChunkX;
      this.lastChunkZ = currentChunkZ;
    }

    // Drain a few queued distant chunks each frame so generation never hitches.
    this.drainBuildQueue();
  }

  private reconcileChunks(currentChunkX: number, currentChunkZ: number): void {
    const needed = new Set<string>();

    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
        const cx = currentChunkX + dx;
        const cz = currentChunkZ + dz;
        const key = this.chunkKey(cx, cz);
        needed.add(key);

        if (this.chunks.has(key) || this.queuedKeys.has(key)) continue;

        if (Math.max(Math.abs(dx), Math.abs(dz)) <= ChunkManager.IMMEDIATE_RADIUS) {
          // Under/adjacent to the boat — must exist now for collision.
          this.loadChunk(cx, cz);
        } else {
          // Distant — defer to the per-frame build queue.
          this.queuedKeys.add(key);
          this.buildQueue.push({ cx, cz, key });
        }
      }
    }

    // Unload chunks that fell out of range.
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        this.unloadChunk(chunk);
        this.chunks.delete(key);
      }
    }

    // Drop queued chunks no longer needed, then order the rest nearest-first.
    if (this.buildQueue.length > 0) {
      this.buildQueue = this.buildQueue.filter((q) => {
        if (needed.has(q.key)) return true;
        this.queuedKeys.delete(q.key);
        return false;
      });
      this.buildQueue.sort(
        (a, b) =>
          ((a.cx - currentChunkX) ** 2 + (a.cz - currentChunkZ) ** 2) -
          ((b.cx - currentChunkX) ** 2 + (b.cz - currentChunkZ) ** 2)
      );
    }
  }

  private drainBuildQueue(): void {
    let built = 0;
    while (built < ChunkManager.BUILD_BUDGET && this.buildQueue.length > 0) {
      const next = this.buildQueue.shift()!;
      this.queuedKeys.delete(next.key);
      if (this.chunks.has(next.key)) continue;
      this.loadChunk(next.cx, next.cz);
      built++;
    }
  }

  private loadChunk(cx: number, cz: number): void {
    const key = this.chunkKey(cx, cz);
    const island = generateIsland(cx, cz, CHUNK_SIZE);

    let terrainMesh: THREE.Mesh | null = null;
    let treeGroup: THREE.Group | null = null;
    let rockGroup: THREE.Group | null = null;
    let lighthouse: THREE.Group | null = null;
    let buoys: THREE.Group | null = null;

    if (island) {
      terrainMesh = createTerrainMesh(island);
      this.scene.add(terrainMesh);

      treeGroup = createTreeInstances(island);
      this.scene.add(treeGroup);

      rockGroup = createShoreRocks(island);
      this.scene.add(rockGroup);

      lighthouse = createLighthouse(island);
      if (lighthouse) this.scene.add(lighthouse);

      // Navigation buoys around the island
      buoys = this.createBuoys(island);
      this.scene.add(buoys);

      this.islandPositions.push({
        x: island.centerX,
        z: island.centerZ,
        radius: island.radius,
        biome: island.biome,
      });
    }

    this.chunks.set(key, { key, chunkX: cx, chunkZ: cz, island, terrainMesh, treeGroup, rockGroup, lighthouse, buoys });
  }

  private createBuoys(island: IslandData): THREE.Group {
    const group = new THREE.Group();
    const buoyCount = 3 + Math.floor(Math.abs(Math.sin(island.centerX * 0.05)) * 4);
    const buoyGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 6);
    const topGeom = new THREE.ConeGeometry(0.2, 0.5, 6);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xCC2222, roughness: 0.6, metalness: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x22AA44, roughness: 0.6, metalness: 0.1 });

    for (let i = 0; i < buoyCount; i++) {
      const angle = (i / buoyCount) * Math.PI * 2 + island.centerX * 0.01;
      const dist = island.radius + 15 + Math.sin(i * 3.7) * 10;
      const x = island.centerX + Math.cos(angle) * dist;
      const z = island.centerZ + Math.sin(angle) * dist;
      const mat = i % 2 === 0 ? redMat : greenMat;

      const buoy = new THREE.Group();
      const body = new THREE.Mesh(buoyGeom, mat);
      buoy.add(body);
      const top = new THREE.Mesh(topGeom, mat);
      top.position.y = 0.85;
      buoy.add(top);

      buoy.position.set(x, 0.3, z);
      buoy.userData.baseY = 0.3;
      buoy.userData.phase = i * 1.3;
      group.add(buoy);
    }

    return group;
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
    const disposeGroup = (g: THREE.Group | null) => {
      if (!g) return;
      this.scene.remove(g);
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    };
    disposeGroup(chunk.rockGroup);
    disposeGroup(chunk.lighthouse);
    disposeGroup(chunk.buoys);

    if (chunk.island) {
      this.islandPositions = this.islandPositions.filter(
        (p) => !(Math.abs(p.x - chunk.island!.centerX) < 1 && Math.abs(p.z - chunk.island!.centerZ) < 1)
      );
    }
  }

  /** Animate buoys and lighthouse beacons */
  updateAnimations(dt: number, time: number, sunElevation: number): void {
    for (const chunk of this.chunks.values()) {
      // Bob buoys on waves
      if (chunk.buoys) {
        for (const child of chunk.buoys.children) {
          const phase = child.userData.phase || 0;
          child.position.y = (child.userData.baseY || 0.3) + Math.sin(time * 2 + phase) * 0.3;
          child.rotation.z = Math.sin(time * 1.5 + phase) * 0.1;
        }
      }

      // Lighthouse beacon — on at night
      if (chunk.lighthouse) {
        const beacon = chunk.lighthouse.getObjectByName('beacon') as THREE.PointLight | null;
        if (beacon) {
          if (sunElevation < 0.05) {
            // Rotating beam effect via intensity pulsing
            const pulse = Math.pow(Math.max(0, Math.cos(time * 1.5)), 8);
            beacon.intensity = (sunElevation < 0 ? 3.0 : THREE.MathUtils.lerp(0, 3.0, (0.05 - sunElevation) / 0.05)) * (0.3 + pulse * 0.7);
          } else {
            beacon.intensity = 0;
          }
        }
      }
    }
  }

  getIslandPositions(): { x: number; z: number; radius: number; biome: Biome }[] {
    return this.islandPositions;
  }

  /** Find the lighthouse group for an island at the given center position. */
  findLighthouseNearIsland(islandX: number, islandZ: number): THREE.Group | null {
    for (const chunk of this.chunks.values()) {
      if (!chunk.island || !chunk.lighthouse) continue;
      const dx = chunk.island.centerX - islandX;
      const dz = chunk.island.centerZ - islandZ;
      if (Math.abs(dx) < 1 && Math.abs(dz) < 1) {
        return chunk.lighthouse;
      }
    }
    return null;
  }

  /** Remove and dispose a lighthouse from the island at the given center position. */
  removeLighthouse(islandX: number, islandZ: number): boolean {
    for (const chunk of this.chunks.values()) {
      if (!chunk.island || !chunk.lighthouse) continue;
      const dx = chunk.island.centerX - islandX;
      const dz = chunk.island.centerZ - islandZ;
      if (Math.abs(dx) < 1 && Math.abs(dz) < 1) {
        this.scene.remove(chunk.lighthouse);
        chunk.lighthouse.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              (obj.material as THREE.Material).dispose();
            }
          }
        });
        chunk.lighthouse = null;
        return true;
      }
    }
    return false;
  }

  /** Sample terrain height at a world position. Returns 0 if open ocean.
   *  Island heightmaps span at most radius*1.25 (~125u) from their center —
   *  well under one 300u chunk — so only the 3x3 chunks around the query point
   *  can possibly cover it. O(1) instead of scanning every loaded chunk. */
  getTerrainHeight(worldX: number, worldZ: number): number {
    const baseCx = Math.floor(worldX / CHUNK_SIZE);
    const baseCz = Math.floor(worldZ / CHUNK_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.chunks.get(this.chunkKey(baseCx + dx, baseCz + dz));
        const island = chunk?.island;
        if (!island) continue;

        const scale = island.radius * 2.5 / island.heightmapSize;
        const hx = (worldX - island.centerX) / scale + island.heightmapSize / 2;
        const hz = (worldZ - island.centerZ) / scale + island.heightmapSize / 2;

        if (hx < 0 || hx >= island.heightmapSize || hz < 0 || hz >= island.heightmapSize) continue;

        const ix = Math.floor(hx);
        const iz = Math.floor(hz);
        const h = island.heightmap[iz * island.heightmapSize + ix];
        if (h > 0.3) return h;
      }
    }
    return 0;
  }
}
