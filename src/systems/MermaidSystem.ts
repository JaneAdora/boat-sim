import * as THREE from 'three';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';
import { MermaidSong } from '../audio/MermaidSong';
import { getMermaidLevel, recordMermaidEncounter, bearingPan, MERMAID_MAX } from '../state/MermaidState';
import { getKarma } from '../state/Karma';

export interface MermaidCallbacks {
  /** Gift granted; level is the encounter just completed (1–3). */
  onGift: (level: number) => void;
  /** One-time hint when her song starts. */
  onSongBegins: () => void;
}

const HEAR_RANGE = 280;
const ENCOUNTER_RANGE = 15;
const ARCH_CHANCE = 0.8;
const OPEN_WATER_CHANCE = 0.25;

/**
 * The Mermaid of the Arches — found by ear, never by waypoint.
 *
 * On clear calm nights, karma permitting (≥ 0 — the sea keeps her from
 * outlaws), she surfaces near a sea arch and sings. Her song pans across
 * the stereo field by her bearing off your bow and swells as you close:
 * the soundtrack IS the compass. Reach her and she grants the night's
 * gift — pearls, then her melody, then her blessing. Three nights in all.
 */
export class MermaidSystem {
  readonly song = new MermaidSong();

  private mesh: THREE.Group | null = null;
  private level: number;
  private nightRolled = false;
  private encounterTonight = false;
  private rollTimer = 8;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private ocean: Ocean,
    private chunkManager: ChunkManager,
    private callbacks: MermaidCallbacks,
    private storage: Storage = localStorage,
  ) {
    this.level = getMermaidLevel(storage);
  }

  getLevel(): number {
    return this.level;
  }

  update(dt: number, boatX: number, boatZ: number, boatHeading: number, sunY: number, rain: number): void {
    this.time += dt;
    const night = sunY < -0.1;

    if (!night) {
      // Dawn resets the night's chances and sends her below
      this.nightRolled = false;
      this.encounterTonight = false;
      if (this.mesh) this.depart();
      return;
    }

    if (this.mesh) {
      this.updateActive(dt, boatX, boatZ, boatHeading, rain);
      return;
    }

    // Roll once per eligible night
    if (this.nightRolled || this.encounterTonight) return;
    this.rollTimer -= dt;
    if (this.rollTimer > 0) return;
    this.rollTimer = 8;

    if (this.level >= MERMAID_MAX) return;
    if (rain > 0.15) return;             // she sings only to calm water
    if (getKarma(this.storage) < 0) return; // and never to outlaws

    this.nightRolled = true;
    this.trySurface(boatX, boatZ);
  }

  private trySurface(boatX: number, boatZ: number): void {
    // She prefers the arches — her namesake
    const arches = this.chunkManager.getLandmarks().filter((l) => l.type === 'arch');
    let x: number | null = null;
    let z: number | null = null;

    if (arches.length > 0 && Math.random() < ARCH_CHANCE) {
      const arch = arches[Math.floor(Math.random() * arches.length)];
      const angle = Math.random() * Math.PI * 2;
      x = arch.x + Math.cos(angle) * 25;
      z = arch.z + Math.sin(angle) * 25;
    } else if (Math.random() < OPEN_WATER_CHANCE) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 220 + Math.random() * 80;
      x = boatX + Math.cos(angle) * dist;
      z = boatZ + Math.sin(angle) * dist;
    }
    if (x === null || z === null) return;
    if (this.chunkManager.getTerrainHeight(x, z) > 0) return; // she needs water

    this.mesh = createMermaidMesh();
    this.mesh.position.set(x, 0, z);
    this.scene.add(this.mesh);

    this.song.start();
    this.song.setListener(0, 0);
    this.callbacks.onSongBegins();
  }

  private updateActive(dt: number, boatX: number, boatZ: number, boatHeading: number, rain: number): void {
    const m = this.mesh!;
    if (rain > 0.3) {
      this.depart(); // weather turned — she slips under
      return;
    }

    // Idle on her rock: sway, tail flicks, glow breathing
    m.position.y = this.ocean.getWaveHeight(m.position.x, m.position.z, this.time) - 0.2;
    m.rotation.y += Math.sin(this.time * 0.3) * 0.002;
    const tail = m.getObjectByName('tail');
    if (tail) tail.rotation.x = 0.5 + Math.sin(this.time * 1.4) * 0.18;
    const glow = m.getObjectByName('glow') as THREE.PointLight | null;
    if (glow) glow.intensity = 1.4 + Math.sin(this.time * 1.8) * 0.5;

    // The ear does the navigating
    const dx = m.position.x - boatX;
    const dz = m.position.z - boatZ;
    const dist = Math.hypot(dx, dz);
    const closeness = Math.max(0, 1 - dist / HEAR_RANGE);
    this.song.setListener(bearingPan(boatHeading, dx, dz), closeness);
    this.song.update(dt);

    if (dist < ENCOUNTER_RANGE) {
      this.level = recordMermaidEncounter(this.storage);
      this.encounterTonight = true;
      this.callbacks.onGift(this.level);
      this.depart();
    }
  }

  private depart(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      this.mesh = null;
    }
    this.song.setListener(0, 0); // the song fades on its own gain ramp
  }

  dispose(): void {
    this.depart();
    this.song.stop();
  }
}

function createMermaidMesh(): THREE.Group {
  const g = new THREE.Group();

  // Her rock, just awash
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.2, 0),
    new THREE.MeshStandardMaterial({ color: 0x4e5a5e, roughness: 0.9 }),
  );
  rock.scale.set(1.3, 0.55, 1.1);
  rock.position.y = -0.4;
  g.add(rock);

  // Torso, leaned back on her hands
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.38, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9b8a4, roughness: 0.6 }),
  );
  torso.position.set(0, 1.1, 0);
  torso.rotation.x = -0.25;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9b8a4, roughness: 0.6 }),
  );
  head.position.set(0, 2.05, -0.12);
  g.add(head);

  // Hair — dark copper, falling past the shoulders
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x6e3326, roughness: 0.85 }),
  );
  hair.position.set(0, 2.12, 0.02);
  hair.scale.set(1, 1.25, 1);
  g.add(hair);

  // The tail, curled over the rock's edge, scales glinting
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 2.2, 8),
    new THREE.MeshStandardMaterial({
      color: 0x2e8a7a, roughness: 0.25, metalness: 0.45,
      emissive: 0x1a5048, emissiveIntensity: 0.5,
    }),
  );
  tail.name = 'tail';
  tail.position.set(0, 0.35, 0.9);
  tail.rotation.x = 0.5;
  g.add(tail);

  // Fluke
  const fluke = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.5, 3),
    (tail.material as THREE.Material),
  );
  fluke.position.set(0, 0.15, 1.95);
  fluke.rotation.x = 1.2;
  fluke.scale.set(1.4, 1, 0.3);
  g.add(fluke);

  // Her glow — what you steer toward once you're close
  const glow = new THREE.PointLight(0x5ee8d0, 1.6, 60);
  glow.name = 'glow';
  glow.position.set(0, 1.4, 0);
  g.add(glow);

  return g;
}
