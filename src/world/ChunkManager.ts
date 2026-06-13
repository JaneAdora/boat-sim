import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_LOAD_RADIUS } from './WorldSeed';
import { generateIsland, IslandData, Biome } from './IslandGenerator';
import { chunkHash } from './IslandNames';
import { harborEligible } from '../state/Harbor';
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
  buoyPositions: { x: number; z: number }[];
  landmark: THREE.Group | null;
  harbor: THREE.Group | null;
}

export type LandmarkType = 'wrecks' | 'arch';

export class ChunkManager {
  private chunks = new Map<string, LoadedChunk>();
  private scene: THREE.Scene;
  private islandPositions: { chunkX: number; chunkZ: number; x: number; z: number; radius: number; biome: Biome }[] = [];
  private landmarkPositions: { key: string; type: LandmarkType; x: number; z: number }[] = [];
  private harborPositions: { key: string; chunkX: number; chunkZ: number; biome: Biome; x: number; z: number }[] = [];

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
    let buoyPositions: { x: number; z: number }[] = [];
    let landmark: THREE.Group | null = null;
    let harbor: THREE.Group | null = null;

    // Rare deterministic landmarks: a sea arch off big islands, or a wreck
    // graveyard in otherwise-empty water. Hash-placed, so they're the same
    // for every player — real places you can give directions to.
    if (island && island.radius > 70 && chunkHash(cx, cz, 7) < 0.18) {
      const angle = chunkHash(cx, cz, 8) * Math.PI * 2;
      const ax = island.centerX + Math.cos(angle) * (island.radius + 28);
      const az = island.centerZ + Math.sin(angle) * (island.radius + 28);
      landmark = createSeaArch(ax, az, angle);
      this.scene.add(landmark);
      this.landmarkPositions.push({ key, type: 'arch', x: ax, z: az });
    } else if (!island && chunkHash(cx, cz, 9) < 0.03) {
      const wx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const wz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      landmark = createWreckGraveyard(wx, wz, cx, cz);
      this.scene.add(landmark);
      this.landmarkPositions.push({ key, type: 'wrecks', x: wx, z: wz });
    }

    if (island) {
      terrainMesh = createTerrainMesh(island);
      this.scene.add(terrainMesh);

      treeGroup = createTreeInstances(island);
      this.scene.add(treeGroup);

      rockGroup = createShoreRocks(island);
      this.scene.add(rockGroup);

      lighthouse = createLighthouse(island);
      if (lighthouse) this.scene.add(lighthouse);

      // Navigation buoys around the island (also a time-trial course)
      buoys = this.createBuoys(island);
      this.scene.add(buoys);
      buoyPositions = buoys.children.map((b) => ({ x: b.position.x, z: b.position.z }));

      this.islandPositions.push({
        chunkX: island.chunkX,
        chunkZ: island.chunkZ,
        x: island.centerX,
        z: island.centerZ,
        radius: island.radius,
        biome: island.biome,
      });

      // Harbour town: a working dock + cabins on ~half of the big islands.
      // Services (rod shop, rumours) unlock only once the island is discovered.
      if (harborEligible(island.radius, cx, cz)) {
        harbor = createHarbor(island, cx, cz);
        this.scene.add(harbor);
        this.harborPositions.push({
          key,
          chunkX: island.chunkX,
          chunkZ: island.chunkZ,
          biome: island.biome,
          x: harbor.userData.dockX as number,
          z: harbor.userData.dockZ as number,
        });
      }
    }

    this.chunks.set(key, { key, chunkX: cx, chunkZ: cz, island, terrainMesh, treeGroup, rockGroup, lighthouse, buoys, buoyPositions, landmark, harbor });
  }

  private createBuoys(island: IslandData): THREE.Group {
    const group = new THREE.Group();
    const buoyCount = 3 + Math.floor(Math.abs(Math.sin(island.centerX * 0.05)) * 4);
    const buoyGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 6);
    const topGeom = new THREE.ConeGeometry(0.2, 0.5, 6);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xCC2222, roughness: 0.6, metalness: 0.1 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x22AA44, roughness: 0.6, metalness: 0.1 });
    // Buoy 0 is gold: the start gate of the island's time-trial course
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xE8B33A, roughness: 0.35, metalness: 0.4,
      emissive: 0x55400a, emissiveIntensity: 0.6,
    });

    for (let i = 0; i < buoyCount; i++) {
      const angle = (i / buoyCount) * Math.PI * 2 + island.centerX * 0.01;
      const dist = island.radius + 15 + Math.sin(i * 3.7) * 10;
      const x = island.centerX + Math.cos(angle) * dist;
      const z = island.centerZ + Math.sin(angle) * dist;
      const mat = i === 0 ? goldMat : i % 2 === 0 ? redMat : greenMat;

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
    disposeGroup(chunk.landmark);
    disposeGroup(chunk.harbor);
    if (chunk.landmark) {
      this.landmarkPositions = this.landmarkPositions.filter((l) => l.key !== chunk.key);
    }
    if (chunk.harbor) {
      this.harborPositions = this.harborPositions.filter((h) => h.key !== chunk.key);
    }

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

  getIslandPositions(): { chunkX: number; chunkZ: number; x: number; z: number; radius: number; biome: Biome }[] {
    return this.islandPositions;
  }

  /** Loaded rare landmarks (for field-journal proximity checks). */
  getLandmarks(): { type: LandmarkType; x: number; z: number }[] {
    return this.landmarkPositions;
  }

  /** Loaded harbours — dock head (x,z) plus the island chunk for discovery/naming. */
  getHarbors(): { chunkX: number; chunkZ: number; biome: Biome; x: number; z: number }[] {
    return this.harborPositions;
  }

  /** Time-trial courses: buoy rings of loaded islands with enough gates. */
  getCourses(): { chunkX: number; chunkZ: number; biome: Biome; buoys: { x: number; z: number }[] }[] {
    const courses: { chunkX: number; chunkZ: number; biome: Biome; buoys: { x: number; z: number }[] }[] = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.island || chunk.buoyPositions.length < 4) continue;
      courses.push({
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        biome: chunk.island.biome,
        buoys: chunk.buoyPositions,
      });
    }
    return courses;
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

// ─── Rare landmark meshes ────────────────────────────────────

const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 1.0, metalness: 0.0 });
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x3a3027, roughness: 0.95, metalness: 0.05 });

// Harbour materials (shared like rockMat/wreckMat above).
const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.85, metalness: 0.0 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x4f3a28, roughness: 0.9, metalness: 0.0 });
const cabinWallMat = new THREE.MeshStandardMaterial({ color: 0xcdb892, roughness: 0.8 });
const cabinWall2Mat = new THREE.MeshStandardMaterial({ color: 0xb39a74, roughness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c4b3b, roughness: 0.7 });
const roof2Mat = new THREE.MeshStandardMaterial({ color: 0x3f6f6a, roughness: 0.7 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.85 });
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffcf6e, emissiveIntensity: 0.9, roughness: 0.5 });

/** Two weathered pillars and a lintel — sail under it. */
function createSeaArch(x: number, z: number, angle: number): THREE.Group {
  const group = new THREE.Group();
  const pillarGeom = new THREE.BoxGeometry(4, 17, 4);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeom, rockMat);
    pillar.position.set(side * 7, 5.5, 0);
    pillar.rotation.y = side * 0.3;
    pillar.rotation.z = side * 0.06;
    group.add(pillar);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(19, 4, 5), rockMat);
  lintel.position.y = 13;
  lintel.rotation.z = 0.04;
  group.add(lintel);
  group.position.set(x, -1.5, z);
  group.rotation.y = angle;
  return group;
}

/** Half-sunk hulls and tilted masts in open water. */
function createWreckGraveyard(x: number, z: number, cx: number, cz: number): THREE.Group {
  const group = new THREE.Group();
  const hullGeom = new THREE.BoxGeometry(3, 2.5, 11);
  const mastGeom = new THREE.CylinderGeometry(0.15, 0.22, 9, 6);
  for (let i = 0; i < 4; i++) {
    const hull = new THREE.Mesh(hullGeom, wreckMat);
    hull.position.set(
      (chunkHash(cx, cz, 20 + i) - 0.5) * 70,
      -0.9,
      (chunkHash(cx, cz, 30 + i) - 0.5) * 70,
    );
    hull.rotation.y = chunkHash(cx, cz, 40 + i) * Math.PI * 2;
    hull.rotation.z = 0.25 + chunkHash(cx, cz, 50 + i) * 0.4;
    group.add(hull);
    if (i < 2) {
      const mast = new THREE.Mesh(mastGeom, wreckMat);
      mast.position.set(hull.position.x + 1, 2.2, hull.position.z);
      mast.rotation.z = 0.5 + chunkHash(cx, cz, 60 + i) * 0.4;
      group.add(mast);
    }
  }
  group.position.set(x, 0, z);
  return group;
}

// ─── Harbour town ────────────────────────────────────────────

/**
 * A plank jetty reaching out over the water from an island's shore, with
 * pilings, a couple of grounded shore cabins, a lamp post and some barrels.
 * Built in local space with +X pointing out to sea (away from the island
 * centre); the group is then placed at the island centre and spun to the
 * hashed shore bearing. The seaward dock head is stashed on userData for the
 * docking proximity check.
 */
function createHarbor(island: IslandData, cx: number, cz: number): THREE.Group {
  const g = new THREE.Group();
  const angle = chunkHash(cx, cz, 22) * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);

  const innerR = island.radius - 2;     // a touch onto the shore
  const outerR = island.radius + 24;    // out over open water
  const len = outerR - innerR;
  const midR = (innerR + outerR) / 2;
  const deckW = 5;
  const deckY = 0.9;

  // Plank deck.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, deckW), plankMat);
  deck.position.set(midR, deckY, 0);
  g.add(deck);

  // Pilings under both deck edges.
  const pileGeom = new THREE.CylinderGeometry(0.35, 0.4, 5.5, 6);
  const piles = 5;
  for (let i = 0; i < piles; i++) {
    const px = innerR + (i + 0.5) * (len / piles);
    for (const side of [-1, 1]) {
      const pile = new THREE.Mesh(pileGeom, postMat);
      pile.position.set(px, deckY - 2.7, side * (deckW / 2 - 0.4));
      g.add(pile);
    }
  }

  // Lamp post at the seaward head — emissive so it reads after dark.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.2, 6), postMat);
  post.position.set(outerR - 2.5, deckY + 1.6, deckW / 2 - 0.6);
  g.add(post);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), lampMat);
  lamp.position.set(outerR - 2.5, deckY + 3.1, deckW / 2 - 0.6);
  g.add(lamp);

  // A couple of barrels for character.
  const barrelGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8);
  for (let i = 0; i < 2; i++) {
    const barrel = new THREE.Mesh(barrelGeom, barrelMat);
    barrel.position.set(midR - 2 + i * 1.3, deckY + 0.85, -deckW / 2 + 0.9);
    g.add(barrel);
  }

  // Two shore cabins, grounded on the island's real height so they sit on the
  // beach rather than hover. Local +X toward the centre (negative offset) = land.
  const spots = [
    { x: innerR - 7, z: -7, wall: cabinWallMat, roof: roofMat, rot: 0.25 },
    { x: innerR - 12, z: 6, wall: cabinWall2Mat, roof: roof2Mat, rot: -0.3 },
  ];
  for (const s of spots) {
    const wx = island.centerX + s.x * ca - s.z * sa;
    const wz = island.centerZ + s.x * sa + s.z * ca;
    const groundY = Math.max(0.5, islandHeightAt(island, wx, wz));
    const cabin = createCabin(s.wall, s.roof);
    cabin.position.set(s.x, groundY, s.z);
    cabin.rotation.y = s.rot;
    g.add(cabin);
  }

  g.position.set(island.centerX, 0, island.centerZ);
  g.rotation.y = -angle;
  g.userData.dockX = island.centerX + ca * outerR;
  g.userData.dockZ = island.centerZ + sa * outerR;
  return g;
}

function createCabin(wallMat: THREE.Material, roofMat: THREE.Material): THREE.Group {
  const c = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4.5), wallMat);
  body.position.y = 1.5;
  c.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.1, 4), roofMat);
  roof.position.y = 4.05;
  roof.rotation.y = Math.PI / 4;
  c.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.2), doorMat);
  door.position.set(0, 0.95, 2.28);
  c.add(door);
  return c;
}

/** World-space ground height of one island at a point, 0 if it's open water. */
function islandHeightAt(island: IslandData, worldX: number, worldZ: number): number {
  const scale = island.radius * 2.5 / island.heightmapSize;
  const hx = (worldX - island.centerX) / scale + island.heightmapSize / 2;
  const hz = (worldZ - island.centerZ) / scale + island.heightmapSize / 2;
  if (hx < 0 || hx >= island.heightmapSize || hz < 0 || hz >= island.heightmapSize) return 0;
  const h = island.heightmap[Math.floor(hz) * island.heightmapSize + Math.floor(hx)];
  return h > 0.3 ? h : 0;
}
