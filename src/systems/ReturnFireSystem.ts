import * as THREE from 'three';
import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { SoundEffects } from '../audio/SoundEffects';
import { GameConfig } from '../state/GameConfig';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { BoatControl } from '../components/BoatControl';

interface Shell {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  target: THREE.Vector3;
  t: number;        // 0..1 flight progress
  duration: number; // seconds
}

interface Splash {
  mesh: THREE.Mesh;
  age: number;
}

export interface ReturnFireCallbacks {
  /** Hull state changed — update pips (classic mode only). */
  onHull: (hp: number, max: number) => void;
  /** Player took a hit (for the damage flash). */
  onHit: () => void;
  /** Is this position in the calm shallows of a discovered island? */
  isSafeHarbor: (x: number, z: number) => boolean;
}

/**
 * Battleship return fire + the player's limp-home hull model.
 * Shells arc with predictive targeting and spread — dodgeable at speed.
 * Three hits slow the boat and add smoke, never death; the hull patches
 * itself in the shallows of any discovered island.
 * Magical mode: impacts shove the boat around but never damage it.
 */
export class ReturnFireSystem {
  static readonly MAX_HP = 3;
  hp = ReturnFireSystem.MAX_HP;

  private shells: Shell[] = [];
  private splashes: Splash[] = [];
  private fireTimers = new Map<WildlifeEntity, number>();
  private repairProgress = 0;
  private baseEnginePower = 0;

  private smoke: THREE.Points;
  private smokeVel: Float32Array;
  private static readonly SMOKE_COUNT = 24;

  private shellGeom = new THREE.SphereGeometry(0.35, 8, 8);
  private shellMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  private splashGeom = new THREE.SphereGeometry(1, 12, 12);
  private splashMat = new THREE.MeshBasicMaterial({ color: 0xdfeef8, transparent: true, opacity: 0.7 });

  private static readonly RANGE = 260;        // battleship opens fire inside this
  private static readonly FIRE_INTERVAL = 7;  // seconds between shells (±2 jitter)
  private static readonly FLIGHT_TIME = 2.4;  // shell airtime
  private static readonly HIT_RADIUS = 9;
  private static readonly SPREAD = 11;        // aim error radius at impact
  private static readonly REPAIR_SECONDS = 5; // per hull point, in safe harbor

  constructor(
    private scene: THREE.Scene,
    private wildlife: WildlifeSystem,
    private soundEffects: SoundEffects,
    private config: GameConfig,
    private callbacks: ReturnFireCallbacks,
  ) {
    // Damage smoke — dark sprites rising from the hull when hp < max
    const positions = new Float32Array(ReturnFireSystem.SMOKE_COUNT * 3);
    this.smokeVel = new Float32Array(ReturnFireSystem.SMOKE_COUNT);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.smoke = new THREE.Points(geom, new THREE.PointsMaterial({
      color: 0x30343a, size: 1.6, transparent: true, opacity: 0.0, depthWrite: false,
    }));
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);
  }

  update(dt: number, boat: Transform, rb: RigidBody, ctrl: BoatControl): void {
    if (this.baseEnginePower === 0) this.baseEnginePower = ctrl.enginePower;

    this.updateBattleships(dt, boat);
    this.updateShells(dt, boat, rb);
    this.updateSplashes(dt);
    this.updateRepair(dt, boat);
    this.updateSmoke(dt, boat);

    // Limp home: damaged hull caps engine power
    ctrl.enginePower = this.baseEnginePower * this.getSpeedFactor();
  }

  private updateBattleships(dt: number, boat: Transform): void {
    for (const e of this.wildlife.getBattleships()) {
      const dx = boat.position.x - e.mesh.position.x;
      const dz = boat.position.z - e.mesh.position.z;
      const dist = Math.hypot(dx, dz);

      let timer = this.fireTimers.get(e) ?? 2 + Math.random() * 3;
      if (dist < ReturnFireSystem.RANGE) {
        timer -= dt;
        if (timer <= 0) {
          this.fire(e, boat);
          timer = ReturnFireSystem.FIRE_INTERVAL + (Math.random() - 0.5) * 4;
        }
      }
      this.fireTimers.set(e, timer);
    }
  }

  private fire(battleship: WildlifeEntity, boat: Transform): void {
    const start = battleship.mesh.position.clone();
    start.y += 6; // turret height

    // Predictive aim with spread — a moving boat outruns the prediction error
    const spreadAngle = Math.random() * Math.PI * 2;
    const spreadR = Math.random() * ReturnFireSystem.SPREAD;
    const target = new THREE.Vector3(
      boat.position.x + Math.cos(spreadAngle) * spreadR,
      0,
      boat.position.z + Math.sin(spreadAngle) * spreadR,
    );

    const mesh = new THREE.Mesh(this.shellGeom, this.shellMat);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.shells.push({ mesh, start, target, t: 0, duration: ReturnFireSystem.FLIGHT_TIME });
    this.soundEffects.playDistantGun();
  }

  private updateShells(dt: number, boat: Transform, rb: RigidBody): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt / s.duration;
      if (s.t >= 1) {
        this.impact(s, boat, rb);
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        continue;
      }
      // Ballistic arc: lerp + parabolic height
      s.mesh.position.lerpVectors(s.start, s.target, s.t);
      s.mesh.position.y += Math.sin(s.t * Math.PI) * 26;
    }
  }

  private impact(s: Shell, boat: Transform, rb: RigidBody): void {
    // Splash at the impact point
    const splash = new THREE.Mesh(this.splashGeom, this.splashMat.clone());
    splash.position.set(s.target.x, 0.3, s.target.z);
    this.scene.add(splash);
    this.splashes.push({ mesh: splash, age: 0 });

    const dx = boat.position.x - s.target.x;
    const dz = boat.position.z - s.target.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ReturnFireSystem.HIT_RADIUS) return; // near miss

    // Knockback in both modes — magical mode it's the only consequence
    const push = this.config.mode === 'magical' ? 6 : 3.5;
    const len = dist || 1;
    rb.velocity.x += (dx / len) * push;
    rb.velocity.z += (dz / len) * push;

    if (this.config.mode !== 'classic') return;

    this.soundEffects.playExplosion();
    this.callbacks.onHit();
    if (this.hp > 0) {
      this.hp--;
      this.callbacks.onHull(this.hp, ReturnFireSystem.MAX_HP);
    }
  }

  private updateSplashes(dt: number): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const sp = this.splashes[i];
      sp.age += dt;
      const k = sp.age / 0.7;
      if (k >= 1) {
        this.scene.remove(sp.mesh);
        (sp.mesh.material as THREE.Material).dispose();
        this.splashes.splice(i, 1);
        continue;
      }
      sp.mesh.scale.setScalar(1 + k * 3.5);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
  }

  private updateRepair(dt: number, boat: Transform): void {
    if (this.hp >= ReturnFireSystem.MAX_HP) return;
    if (!this.callbacks.isSafeHarbor(boat.position.x, boat.position.z)) {
      this.repairProgress = 0;
      return;
    }
    this.repairProgress += dt;
    if (this.repairProgress >= ReturnFireSystem.REPAIR_SECONDS) {
      this.repairProgress = 0;
      this.hp++;
      this.callbacks.onHull(this.hp, ReturnFireSystem.MAX_HP);
    }
  }

  /** Engine power factor for the current hull: 3 hp → 1.0 … 0 hp → 0.4. */
  getSpeedFactor(): number {
    return [0.4, 0.55, 0.75, 1.0][this.hp] ?? 1.0;
  }

  private updateSmoke(dt: number, boat: Transform): void {
    const damaged = ReturnFireSystem.MAX_HP - this.hp;
    const mat = this.smoke.material as THREE.PointsMaterial;
    mat.opacity = damaged === 0 ? 0 : 0.25 + damaged * 0.18;
    if (damaged === 0) return;

    const pos = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < ReturnFireSystem.SMOKE_COUNT; i++) {
      let y = pos.getY(i);
      if (y <= 0 || y > 7 || (pos.getX(i) === 0 && pos.getZ(i) === 0)) {
        // Respawn at the boat with slight scatter
        pos.setXYZ(
          i,
          boat.position.x + (Math.random() - 0.5) * 1.5,
          boat.position.y + 1 + Math.random(),
          boat.position.z + (Math.random() - 0.5) * 1.5,
        );
        this.smokeVel[i] = 1.2 + Math.random() * 1.2;
      } else {
        pos.setY(i, y + this.smokeVel[i] * dt);
        pos.setX(i, pos.getX(i) + (Math.random() - 0.5) * 0.3 * dt);
      }
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const sp of this.splashes) {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.smoke);
    this.shellGeom.dispose();
    this.shellMat.dispose();
    this.splashGeom.dispose();
    this.splashMat.dispose();
  }
}
