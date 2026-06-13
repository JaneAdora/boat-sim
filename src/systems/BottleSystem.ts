import * as THREE from 'three';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';
import { islandName, chunkHash } from '../world/IslandNames';
import { generateIsland } from '../world/IslandGenerator';
import { CHUNK_SIZE } from '../world/WorldSeed';
import {
  TreasureMapData, pickTreasureTarget, loadTreasureMap, saveTreasureMap,
} from '../state/TreasureMap';

export interface BottleCallbacks {
  /** A map came ashore — the chart UI should update. */
  onMap: (map: TreasureMapData) => void;
  /** A story bottle: flavor text toast. */
  onStory: (story: string) => void;
  /** The dig succeeded — reward in credits (engine adds journal/toast). */
  onTreasure: (reward: number) => void;
}

const COLLECT_RANGE = 8;
const DIG_RANGE = 14;
const BOTTLE_LIFE = 300; // un-collected bottles drift away after 5 minutes
const STORIES = [
  'The storm took the mast and my nerve. What we saved, we buried',
  'Three paces from the leaning palm, though the palms have grown since',
  'If you read this, sail past {name} ({x}, {z}) and think of us',
  'The dolphins led us out of the fog at {name}. Trust them',
  'I saw lights under the water off {name} ({x}, {z}). No one believes me',
  'The arch sings when the wind is right. She sings back',
];

/**
 * Bottled messages — the sea's mail service. Bottles bob in open water;
 * sail close to collect. Most carry a treasure map: a hand-drawn coastline
 * of a REAL island (the world is one seed) and an ✕ — no waypoint, you
 * navigate by recognizing the shape. Some carry only stories.
 */
export class BottleSystem {
  private bottle: THREE.Group | null = null;
  private bottleAge = 0;
  private spawnTimer = 90; // first bottle comes soon-ish
  private map: TreasureMapData | null;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private ocean: Ocean,
    private chunkManager: ChunkManager,
    private callbacks: BottleCallbacks,
    private storage: Storage = localStorage,
  ) {
    this.map = loadTreasureMap(storage);
  }

  /** The active hunt, if any (the chart UI reads this). */
  getMap(): TreasureMapData | null {
    return this.map;
  }

  update(dt: number, boatX: number, boatZ: number): void {
    this.time += dt;

    if (this.bottle) {
      this.bottleAge += dt;
      const p = this.bottle.position;
      p.y = this.ocean.getWaveHeight(p.x, p.z, this.time) + 0.15;
      this.bottle.rotation.z = Math.sin(this.time * 1.7) * 0.4;
      this.bottle.rotation.x = Math.sin(this.time * 1.3) * 0.3;

      if (Math.hypot(p.x - boatX, p.z - boatZ) < COLLECT_RANGE) {
        this.collect(boatX, boatZ);
      } else if (this.bottleAge > BOTTLE_LIFE) {
        this.removeBottle();
      }
    } else {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 45; // retry cadence; success resets to a longer wait
        this.trySpawn(boatX, boatZ);
      }
    }

    // The dig: holding a map and sitting on the ✕
    if (this.map && Math.hypot(this.map.digX - boatX, this.map.digZ - boatZ) < DIG_RANGE) {
      const reward = this.map.reward;
      this.map = null;
      saveTreasureMap(null, this.storage);
      this.callbacks.onTreasure(reward);
    }
  }

  private trySpawn(boatX: number, boatZ: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 150;
    const x = boatX + Math.cos(angle) * dist;
    const z = boatZ + Math.sin(angle) * dist;
    if (this.chunkManager.getTerrainHeight(x, z) > 0) return; // open water only

    this.bottle = createBottleMesh();
    this.bottle.position.set(x, 0, z);
    this.scene.add(this.bottle);
    this.bottleAge = 0;
    this.spawnTimer = 120 + Math.random() * 120;
  }

  private collect(boatX: number, boatZ: number): void {
    this.removeBottle();
    // A map, if you can carry one (60%); otherwise a story from the sea
    if (!this.map && Math.random() < 0.6) {
      const map = pickTreasureTarget(boatX, boatZ);
      if (map) {
        this.map = map;
        saveTreasureMap(map, this.storage);
        this.callbacks.onMap(map);
        return;
      }
    }
    this.callbacks.onStory(this.pickStory(boatX, boatZ));
  }

  private pickStory(boatX: number, boatZ: number): string {
    const cx0 = Math.floor(boatX / CHUNK_SIZE);
    const cz0 = Math.floor(boatZ / CHUNK_SIZE);
    // Find a nearby real island to name in the story
    for (let ring = 2; ring <= 6; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const island = generateIsland(cx0 + dx, cz0 + dz, CHUNK_SIZE);
          if (!island) continue;
          const idx = Math.floor(chunkHash(island.chunkX, island.chunkZ, 16) * STORIES.length);
          return STORIES[idx]
            .replace('{name}', islandName(island.chunkX, island.chunkZ, island.biome))
            .replace('{x}', String(Math.round(island.centerX)))
            .replace('{z}', String(Math.round(island.centerZ)));
        }
      }
    }
    return STORIES[0];
  }

  private removeBottle(): void {
    if (!this.bottle) return;
    this.scene.remove(this.bottle);
    this.bottle.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.bottle = null;
  }

  dispose(): void {
    this.removeBottle();
  }
}

function createBottleMesh(): THREE.Group {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8),
    new THREE.MeshStandardMaterial({
      color: 0x6fae8f, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.1,
      emissive: 0x2a6e54, emissiveIntensity: 0.6, // findable at night
    }),
  );
  group.add(glass);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 0.25, 8),
    glass.material,
  );
  neck.position.y = 0.45;
  group.add(neck);
  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.9 }),
  );
  cork.position.y = 0.6;
  group.add(cork);
  // The note inside
  const note = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.35, 6),
    new THREE.MeshBasicMaterial({ color: 0xf0e6c8 }),
  );
  note.rotation.z = 0.3;
  group.add(note);
  return group;
}
