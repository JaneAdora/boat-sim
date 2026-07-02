import * as THREE from 'three';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';
import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { hasWitnessedLeviathan, recordLeviathanWitnessed } from '../state/LeviathanState';
import { createDoomedShip, createGuardianSerpent, disposeGroup } from '../props/StoryProps';

export interface LeviathanCallbacks {
  /** The spectacle played out — journal the sighting. */
  onWitnessed: () => void;
  /** Persistent banner during the fight (null clears). */
  onBanner: (text: string | null) => void;
  /** A tentacle slammed the hull. */
  onSlam: () => void;
  groan: () => void;
}

const STORM_THRESHOLD = 0.7;
const STORM_END = 0.4;
const DEEP_WATER_DIST = 320;   // no island center this close = deep water
const SLAM_INTERVAL = 7;
const SLAM_RANGE = 60;
const TENTACLE_COUNT = 5;

type Phase = 'lurking' | 'spectacle' | 'boss';

/**
 * The Leviathan — the deep's answer to sailing too far in bad weather.
 *
 * Spectacle before threat: the first storm over deep water shows it taking
 * a cargo ship two hundred meters off your bow, untouchable. Only after
 * you've SEEN it can a later storm surface the beast itself: five tentacle
 * strike zones (torpedo each to sever), slow drift toward you, hull-slamming
 * within range. Sever all five for the bounty; flee or outlast the storm
 * and it submerges, patient.
 */
export class LeviathanSystem {
  private phase: Phase = 'lurking';
  private witnessed: boolean;
  private rollTimer = 20; // condition check cadence
  private stormRolled = false; // one boss roll per storm

  // Story Mode (beats 7 & 8): while scripted, the ambient awaken roll is frozen
  // and the spectacle/boss never fire their ambient witnessed/slain rewards —
  // the MissionSystem owns them. persistStorm keeps the boss up regardless of
  // the live weather (the forced scripted storm drives the visuals).
  private scripted: { phase: 'spectacle' | 'boss' | 'guardian'; persistStorm: boolean } | null =
    null;
  private scriptedSpectacleDone = false;
  // Act 2 beat 14 (mercy branch): a circling presence, not a combatant. Lives
  // OUTSIDE the phase machine and the wildlife registry — weapons, slams, and
  // banners never touch it.
  private guardianMesh: THREE.Group | null = null;
  private guardianAngle = 0;
  private static readonly GUARDIAN_RADIUS = 60;

  // Spectacle props
  private doomedShip: THREE.Group | null = null;
  private spectacleTentacles: THREE.Group | null = null;
  private spectacleT = 0;

  // Boss
  private entity: WildlifeEntity | null = null;
  private bossMesh: THREE.Group | null = null;
  private slamTimer = SLAM_INTERVAL;
  private severed = 0;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private ocean: Ocean,
    private wildlife: WildlifeSystem,
    private chunkManager: ChunkManager,
    private callbacks: LeviathanCallbacks,
    private storage: Storage = localStorage,
  ) {
    this.witnessed = hasWitnessedLeviathan(storage);
  }

  update(dt: number, boatX: number, boatZ: number, rain: number): void {
    this.time += dt;
    if (rain < STORM_END) this.stormRolled = false; // storm over → next storm rolls fresh

    // The guardian circles the boat, slow and huge, riding the swell. It runs
    // beside the phase machine (phase stays 'lurking'; tryAwaken is frozen by
    // the scripted guard), so nothing combat-shaped can reach it.
    if (this.scripted?.phase === 'guardian' && this.guardianMesh) {
      this.guardianAngle += dt * 0.22;
      const r = LeviathanSystem.GUARDIAN_RADIUS;
      const gx = boatX + Math.cos(this.guardianAngle) * r;
      const gz = boatZ + Math.sin(this.guardianAngle) * r;
      const gy = this.ocean.getWaveHeight(gx, gz, this.time) - 0.4;
      this.guardianMesh.position.set(gx, gy, gz);
      // Face along the tangent of the circle, nose leading.
      this.guardianMesh.rotation.y = -this.guardianAngle;
    }

    switch (this.phase) {
      case 'lurking':
        this.rollTimer -= dt;
        if (this.rollTimer <= 0) {
          this.rollTimer = 15;
          this.tryAwaken(boatX, boatZ, rain);
        }
        break;
      case 'spectacle':
        this.updateSpectacle(dt);
        break;
      case 'boss':
        this.updateBoss(dt, boatX, boatZ, rain);
        break;
    }
  }

  // ── Story Mode scripted hooks ────────────────────────────────

  /**
   * Begin a mission-owned Leviathan at a fixed spot (Story beats 7 & 8). Clears
   * any active ambient spectacle/boss first (R8/R9), then plays the spectacle or
   * raises the boss. Neither scripted phase fires the ambient witnessed/slain
   * reward — the MissionSystem grants the beat.
   */
  beginScripted(
    x: number,
    z: number,
    phase: 'spectacle' | 'boss' | 'guardian',
    persistStorm = true,
  ): void {
    this.clearActive();
    this.scripted = { phase, persistStorm };
    this.scriptedSpectacleDone = false;
    if (phase === 'spectacle') this.beginSpectacle(x, z);
    else if (phase === 'boss') this.beginBoss(x, z); // entity cleared above, so beginBoss won't early-out
    else {
      // Guardian: surfaces near the given point and thereafter circles the
      // player (see update). No wildlife entity, no banner, no slams.
      this.guardianMesh = createGuardianSerpent();
      this.guardianMesh.position.set(x, 0, z);
      this.scene.add(this.guardianMesh);
      this.guardianAngle = 0;
      this.callbacks.groan();
    }
  }

  /** End the scripted encounter (idempotent). Tears down any live spectacle/boss
   *  so nothing lingers when the beat disarms. */
  endScripted(): void {
    if (!this.scripted) return;
    this.scripted = null;
    this.scriptedSpectacleDone = false;
    this.clearActive();
  }

  /** True once a scripted spectacle has fully played out (beat 7 completion). */
  scriptedSpectaclePlayed(): boolean {
    return this.scriptedSpectacleDone;
  }

  /** True while the scripted boss is up and pursuing — the lure counter only
   *  banks a pass when the beast is actually in tow. */
  scriptedBossActive(): boolean {
    return (
      this.scripted?.phase === 'boss' &&
      this.phase === 'boss' &&
      this.entity !== null &&
      this.wildlife.isEntityAlive(this.entity)
    );
  }

  /** True when the scripted boss is gone (slain or dived) and we've folded back
   *  to lurking — beat 8's armed-resolution signal. */
  scriptedResolved(): boolean {
    return this.phase === 'lurking' && this.entity === null;
  }

  /** Tear down whatever ambient/scripted spectacle or boss is currently live,
   *  returning to 'lurking' WITHOUT firing any reward callback. */
  private clearActive(): void {
    if (this.guardianMesh) {
      disposeGroup(this.scene, this.guardianMesh);
      this.guardianMesh = null;
    }
    if (this.phase === 'spectacle') {
      if (this.doomedShip) disposeGroup(this.scene, this.doomedShip);
      if (this.spectacleTentacles) disposeGroup(this.scene, this.spectacleTentacles);
      this.doomedShip = null;
      this.spectacleTentacles = null;
    }
    if (this.entity) {
      if (this.wildlife.isEntityAlive(this.entity)) this.wildlife.removeEntity(this.entity);
      if (this.bossMesh) disposeGroup(this.scene, this.bossMesh);
      this.entity = null;
      this.bossMesh = null;
      this.severed = 0;
    }
    this.phase = 'lurking';
    this.callbacks.onBanner(null);
  }

  /** The boss entity dissolved outside our control (slain via WeaponsSystem,
   *  or culled when the player fled). The engine's slain callback handles
   *  rewards; here we just fold the state back to lurking. */
  private bossGone(): void {
    this.entity = null;
    this.bossMesh = null;
    this.severed = 0;
    this.phase = 'lurking';
    this.callbacks.onBanner(null);
  }

  private isDeepWater(x: number, z: number): boolean {
    for (const isl of this.chunkManager.getIslandPositions()) {
      if (Math.hypot(isl.x - x, isl.z - z) < DEEP_WATER_DIST + isl.radius) return false;
    }
    return true;
  }

  private tryAwaken(boatX: number, boatZ: number, rain: number): void {
    if (this.scripted) return; // Story Mode owns the beast; no ambient awakening
    if (rain < STORM_THRESHOLD || !this.isDeepWater(boatX, boatZ)) return;

    if (!this.witnessed) {
      this.beginSpectacle(boatX, boatZ);
      return;
    }
    if (this.stormRolled) return;
    this.stormRolled = true;
    if (Math.random() < 1 / 3) this.beginBoss(boatX, boatZ);
  }

  // ── The spectacle ────────────────────────────────────────────

  private beginSpectacle(boatX: number, boatZ: number): void {
    const angle = Math.random() * Math.PI * 2;
    const x = boatX + Math.cos(angle) * 160;
    const z = boatZ + Math.sin(angle) * 160;

    this.doomedShip = createDoomedShip();
    this.doomedShip.position.set(x, 0, z);
    this.doomedShip.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(this.doomedShip);

    this.spectacleTentacles = createTentacleRing(TENTACLE_COUNT, 18);
    this.spectacleTentacles.position.set(x, 0, z);
    this.scene.add(this.spectacleTentacles);

    this.spectacleT = 0;
    this.phase = 'spectacle';
    this.callbacks.groan();
    this.callbacks.onBanner('🐙 Something massive moves beneath the storm…');
  }

  private updateSpectacle(dt: number): void {
    this.spectacleT += dt;
    const t = this.spectacleT;
    const ship = this.doomedShip!;
    const tents = this.spectacleTentacles!;

    // 0–4s: tentacles rise · 4–11s: the ship is dragged under · then gone
    const rise = Math.min(1, t / 4);
    tents.children.forEach((tent, i) => {
      tent.position.y = -22 + rise * 20;
      tent.rotation.z = Math.sin(this.time * 1.2 + i * 2.1) * 0.18;
    });

    if (t > 4) {
      const sink = Math.min(1, (t - 4) / 7);
      ship.position.y = -sink * 14;
      ship.rotation.z = sink * 0.7; // lists hard as she goes
      ship.rotation.x = sink * 0.25;
    } else {
      ship.position.y = this.ocean.getWaveHeight(ship.position.x, ship.position.z, this.time) * (1 - t / 4);
    }

    if (t > 12) {
      this.endSpectacle();
    }
  }

  private endSpectacle(): void {
    if (this.doomedShip) disposeGroup(this.scene, this.doomedShip);
    if (this.spectacleTentacles) disposeGroup(this.scene, this.spectacleTentacles);
    this.doomedShip = null;
    this.spectacleTentacles = null;
    this.phase = 'lurking';
    this.callbacks.onBanner(null);

    if (this.scripted) {
      // Story beat 7: the MissionSystem journals + rewards. Do NOT touch the
      // ambient witnessed flag/lifetime or fire onWitnessed.
      this.scriptedSpectacleDone = true;
      return;
    }
    this.witnessed = true;
    recordLeviathanWitnessed(this.storage);
    this.callbacks.onWitnessed();
  }

  // ── The boss ─────────────────────────────────────────────────

  private beginBoss(boatX: number, boatZ: number): void {
    if (this.entity) return; // one leviathan is plenty
    const angle = Math.random() * Math.PI * 2;
    const x = boatX + Math.cos(angle) * 140;
    const z = boatZ + Math.sin(angle) * 140;

    // Tentacles laid out along local Z at the strike-zone offsets so the
    // existing zone targeting (offsets along heading) lines up exactly.
    this.bossMesh = new THREE.Group();
    const offsets = [-24, -12, 0, 12, 24];
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const tent = createTentacle(3.2 + (i % 2) * 1.4);
      tent.position.set((Math.sin(i * 2.4) * 5), -2, offsets[i]);
      tent.name = `tentacle-${i}`;
      this.bossMesh.add(tent);
    }
    // The hump of the body, glistening between the arms
    const hump = new THREE.Mesh(
      new THREE.SphereGeometry(9, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d2c2a, roughness: 0.35, metalness: 0.2 }),
    );
    hump.scale.set(1, 0.35, 2.6);
    hump.position.y = -1.5;
    this.bossMesh.add(hump);
    // Two pale eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xd9f2a8 }),
      );
      eye.position.set(side * 3, 0.8, 6);
      this.bossMesh.add(eye);
    }

    this.bossMesh.position.set(x, 0, z);
    this.scene.add(this.bossMesh);
    this.entity = this.wildlife.registerLeviathan(this.bossMesh, x, z);
    this.severed = 0;
    this.slamTimer = SLAM_INTERVAL;
    this.phase = 'boss';
    this.callbacks.groan();
  }

  private updateBoss(dt: number, boatX: number, boatZ: number, rain: number): void {
    const e = this.entity!;
    if (!this.wildlife.isEntityAlive(e)) {
      // Slain (WeaponsSystem removed it — rewards flow through onLeviathanSlain)
      // or culled because the player fled past the wildlife radius.
      this.bossGone();
      return;
    }

    // Storm blown out — it slips back under. A scripted boss with persistStorm
    // ignores the live weather (the forced scripted storm carries the visuals).
    if (rain < STORM_END && !this.scripted?.persistStorm) {
      this.wildlife.removeEntity(e);
      disposeGroup(this.scene, this.bossMesh!);
      this.bossGone();
      return;
    }

    const mesh = this.bossMesh!;
    const dx = boatX - mesh.position.x;
    const dz = boatZ - mesh.position.z;
    const dist = Math.hypot(dx, dz);

    // Slow drift toward the player; heading drives the zone layout
    e.heading = Math.atan2(dx, dz);
    mesh.rotation.y = e.heading;
    if (dist > 30) {
      mesh.position.x += (dx / dist) * 2.2 * dt;
      mesh.position.z += (dz / dist) * 2.2 * dt;
    }
    mesh.position.y = this.ocean.getWaveHeight(mesh.position.x, mesh.position.z, this.time) - 1;

    // Severed tentacles sink; live ones writhe
    let severedNow = 0;
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const tent = mesh.getObjectByName(`tentacle-${i}`);
      if (!tent) continue;
      if (e.strikeZones!.hit[i]) {
        severedNow++;
        tent.position.y = Math.max(-20, tent.position.y - 6 * dt);
      } else {
        tent.rotation.z = Math.sin(this.time * 1.6 + i * 2.1) * 0.25;
        tent.rotation.x = Math.sin(this.time * 1.1 + i * 1.3) * 0.12;
      }
    }
    if (severedNow !== this.severed) {
      this.severed = severedNow;
      this.callbacks.groan();
    }
    this.callbacks.onBanner(`🐙 The Leviathan — sever its tentacles! (${this.severed}/${TENTACLE_COUNT})`);

    // The grab
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) {
      this.slamTimer = SLAM_INTERVAL;
      if (dist < SLAM_RANGE) this.callbacks.onSlam();
    }
  }

  dispose(): void {
    if (this.doomedShip) disposeGroup(this.scene, this.doomedShip);
    if (this.spectacleTentacles) disposeGroup(this.scene, this.spectacleTentacles);
    if (this.entity && this.wildlife.isEntityAlive(this.entity)) this.wildlife.removeEntity(this.entity);
    if (this.bossMesh) disposeGroup(this.scene, this.bossMesh);
  }
}

// ── Meshes ─────────────────────────────────────────────────────

function createTentacle(height: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x243832, roughness: 0.4, metalness: 0.15 });
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.9, height * 2.4, 7), mat);
  lower.position.y = height * 1.2;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.0, height * 1.8, 7), mat);
  upper.position.y = height * 2.4 + height * 0.9;
  upper.rotation.z = 0.35; // the curl
  g.add(upper);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, height * 0.9, 7), mat);
  tip.position.set(height * 0.32, height * 3.3 + height * 0.4, 0);
  tip.rotation.z = 0.8;
  g.add(tip);
  return g;
}

function createTentacleRing(count: number, radius: number): THREE.Group {
  const ring = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const tent = createTentacle(3.5);
    tent.position.set(Math.cos(angle) * radius, -22, Math.sin(angle) * radius);
    tent.rotation.y = -angle;
    ring.add(tent);
  }
  return ring;
}

// createDoomedShip + disposeGroup moved to src/props/StoryProps.ts (Act 2
// stage 1): the campaign layer reuses the same silhouettes for its wrecks.
