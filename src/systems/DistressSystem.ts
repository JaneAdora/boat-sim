import * as THREE from 'three';
import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { ChunkManager } from '../world/ChunkManager';

export interface DistressCallbacks {
  onBanner: (text: string | null) => void;
  /** Rescue delivered — reward in credits. */
  onComplete: (reward: number) => void;
  /** Ghost-net whale cut free — pure karma, no credits. */
  onWhaleFreed: () => void;
  isSafeHarbor: (x: number, z: number) => boolean;
  nearestHarbor: (x: number, z: number) => { x: number; z: number } | null;
}

const REWARD = 60;
const SMOKE_COUNT = 18;
const CUT_RADIUS = 22;     // hold within this range of the whale...
const CUT_MAX_SPEED = 2.5; // ...below this speed...
const CUT_SECONDS = 4;     // ...for this long to cut the net

/**
 * Distress calls — the living-sea event. A fishing boat catches fire and
 * goes dead in the water nearby; tow it to the shallows of any discovered
 * island. No timer, no failure: the sea is patient here.
 */
export class DistressSystem {
  private vessel: WildlifeEntity | null = null;
  private kind: 'fire' | 'whale' = 'fire';
  private cutProgress = 0;
  private cooldown = 100; // first call comes after the player has settled in
  private bannerTimer = 0;

  private smoke: THREE.Points;
  private smokeVel: Float32Array;

  constructor(
    private scene: THREE.Scene,
    private wildlife: WildlifeSystem,
    private chunkManager: ChunkManager,
    private callbacks: DistressCallbacks,
  ) {
    const positions = new Float32Array(SMOKE_COUNT * 3);
    this.smokeVel = new Float32Array(SMOKE_COUNT);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.smoke = new THREE.Points(geom, new THREE.PointsMaterial({
      color: 0x2a2420, size: 2.0, transparent: true, opacity: 0.0, depthWrite: false,
    }));
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);
  }

  update(dt: number, boatX: number, boatZ: number, boatSpeed: number): void {
    if (this.vessel) {
      this.updateActive(dt, boatX, boatZ, boatSpeed);
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = 30; // retry cadence if no clear water found
      this.trySpawn(boatX, boatZ);
    }
  }

  /** The rescue objective for radar/waypoint (vessel, then nearest harbor). */
  getMarker(): { x: number; z: number } | null {
    if (!this.vessel) return null;
    if (this.kind === 'whale' || !this.vessel.towed) {
      return { x: this.vessel.mesh.position.x, z: this.vessel.mesh.position.z };
    }
    return this.callbacks.nearestHarbor(this.vessel.mesh.position.x, this.vessel.mesh.position.z);
  }

  private trySpawn(boatX: number, boatZ: number): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 250 + Math.random() * 130;
      const x = boatX + Math.cos(angle) * dist;
      const z = boatZ + Math.sin(angle) * dist;
      if (this.chunkManager.getTerrainHeight(x, z) > 0) continue; // not on land

      this.kind = Math.random() < 0.5 ? 'whale' : 'fire';
      this.vessel = this.kind === 'whale'
        ? this.wildlife.spawnEntangledWhale(x, z)
        : this.wildlife.spawnDistressedVessel(x, z);
      this.cutProgress = 0;
      this.bannerTimer = 0;
      return;
    }
  }

  private updateActive(dt: number, boatX: number, boatZ: number, boatSpeed: number): void {
    const v = this.vessel!;
    if (!this.wildlife.isEntityAlive(v)) {
      // Vessel destroyed (a stray torpedo, perhaps) — the call goes quiet
      this.clear(180);
      return;
    }

    const vx = v.mesh.position.x;
    const vz = v.mesh.position.z;

    if (this.kind === 'whale') {
      const dist = Math.hypot(vx - boatX, vz - boatZ);
      if (dist < CUT_RADIUS && boatSpeed < CUT_MAX_SPEED) {
        this.cutProgress += dt; // patient work — progress never decays
        if (this.cutProgress >= CUT_SECONDS) {
          this.wildlife.freeWhale(v);
          this.clear(240);
          this.callbacks.onWhaleFreed();
          return;
        }
      }
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerTimer = 0.5;
        if (dist < CUT_RADIUS) {
          const pct = Math.round((this.cutProgress / CUT_SECONDS) * 100);
          this.callbacks.onBanner(
            boatSpeed < CUT_MAX_SPEED
              ? `🐋 Hold steady — cutting the net · ${pct}%`
              : `🐋 Slow down to cut the net · ${pct}%`,
          );
        } else {
          this.callbacks.onBanner(`🐋 A whale is tangled in a ghost net · ${Math.round(dist)}m`);
        }
      }
      return;
    }

    this.updateSmoke(dt, v);

    if (this.callbacks.isSafeHarbor(vx, vz)) {
      this.wildlife.restoreVessel(v);
      this.clear(240);
      this.callbacks.onComplete(REWARD);
      return;
    }

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) {
      this.bannerTimer = 1;
      if (!v.towed) {
        const dist = Math.round(Math.hypot(vx - boatX, vz - boatZ));
        this.callbacks.onBanner(`🛟 Mayday — fishing boat ablaze · ${dist}m`);
      } else {
        const harbor = this.callbacks.nearestHarbor(vx, vz);
        const dist = harbor ? ` · ${Math.round(Math.hypot(harbor.x - vx, harbor.z - vz))}m` : '';
        this.callbacks.onBanner(`🛟 Tow the survivor to a discovered harbor${dist}`);
      }
    }
  }

  private clear(nextCooldown: number): void {
    this.vessel = null;
    this.cooldown = nextCooldown;
    this.callbacks.onBanner(null);
    (this.smoke.material as THREE.PointsMaterial).opacity = 0;
  }

  private updateSmoke(dt: number, v: WildlifeEntity): void {
    const mat = this.smoke.material as THREE.PointsMaterial;
    mat.opacity = 0.55;
    const pos = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const y = pos.getY(i);
      if (y <= 0 || y > 9 || (pos.getX(i) === 0 && pos.getZ(i) === 0)) {
        pos.setXYZ(
          i,
          v.mesh.position.x + (Math.random() - 0.5) * 2,
          v.mesh.position.y + 1 + Math.random() * 1.5,
          v.mesh.position.z + (Math.random() - 0.5) * 2,
        );
        this.smokeVel[i] = 1.5 + Math.random() * 1.5;
      } else {
        pos.setY(i, y + this.smokeVel[i] * dt);
      }
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.smoke);
    this.smoke.geometry.dispose();
    (this.smoke.material as THREE.Material).dispose();
  }
}
