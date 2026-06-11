import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Ocean } from '../rendering/Ocean';
import { WildlifeSystem } from './WildlifeSystem';
import { ChunkManager } from '../world/ChunkManager';
import { ExplosionEffect } from '../rendering/ExplosionEffect';
import { ConfettiEffect } from '../rendering/ConfettiEffect';
import { UnicornEffect } from '../rendering/UnicornEffect';
import { TorpedoWake } from '../rendering/TorpedoWake';
import { RainbowTorpedoWake } from '../rendering/RainbowTorpedoWake';
import { RainbowMissileTrail } from '../rendering/RainbowMissileTrail';
import { createTorpedoMesh, createMissileMesh } from '../rendering/ProjectileMesh';
import { KillTracker } from '../state/KillTracker';
import { SoundEffects } from '../audio/SoundEffects';
import { GameConfig } from '../state/GameConfig';

// Torpedo constants
const TORPEDO_SPEED = 25;
const TORPEDO_MAX_AGE = 10;
const TORPEDO_COOLDOWN = 2;
const TORPEDO_TURN_RATE = 2.0;
const MAX_TORPEDOES = 3;
const TORPEDO_SEEK_RANGE = 300;

// Missile constants
const MISSILE_H_SPEED = 40;
const MISSILE_COOLDOWN = 3;
const MISSILE_MAX_RANGE = 1000;
const MAX_MISSILES = 2;

const _bowLocal = new THREE.Vector3(0, 0.1, 3.5);
const _tempVec = new THREE.Vector3();
const _forward = new THREE.Vector3();

interface Torpedo {
  mesh: THREE.Group;
  wake: TorpedoWake | RainbowTorpedoWake;
  position: THREE.Vector3;
  heading: number;
  age: number;
}

interface Missile {
  mesh: THREE.Group;
  // Cubic bezier control points
  p0: THREE.Vector3; // start (bow)
  p1: THREE.Vector3; // forward+up from boat
  p2: THREE.Vector3; // above island
  p3: THREE.Vector3; // island surface
  targetIslandX: number; // island center for lighthouse lookup
  targetIslandZ: number;
  flightTime: number;
  elapsed: number;
  trail: THREE.Line | null; // null when using rainbowTrail
  trailPositions: Float32Array | null;
  trailIndex: number;
  rainbowTrail: RainbowMissileTrail | null;
}

export class WeaponsSystem extends System {
  /** Karma stain for destroying innocents — set by the engine. Battleships are fair game. */
  onKarma: ((delta: number, reason: string, journalKey?: string) => void) | null = null;
  /** All five tentacles severed — the engine pays the bounty. */
  onLeviathanSlain: (() => void) | null = null;

  private scene: THREE.Scene;
  private ocean: Ocean;
  private boatEntity: number;
  private wildlifeSystem: WildlifeSystem;
  private chunkManager: ChunkManager;
  private killTracker: KillTracker;
  private soundEffects: SoundEffects;
  private readonly config: GameConfig;

  private torpedoes: Torpedo[] = [];
  private missiles: Missile[] = [];
  private explosions: ExplosionEffect;
  private confetti: ConfettiEffect | null = null;
  private unicornEffect: UnicornEffect | null = null;
  private orphanedWakes: RainbowTorpedoWake[] = [];
  private orphanedTrails: RainbowMissileTrail[] = [];

  private torpedoCooldown = 0;
  private missileCooldown = 0;
  private elapsedTime = 0;

  private torpedoButton: HTMLButtonElement;
  private missileButton: HTMLButtonElement;
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    boatEntity: number,
    wildlifeSystem: WildlifeSystem,
    chunkManager: ChunkManager,
    killTracker: KillTracker,
    soundEffects: SoundEffects,
    config: GameConfig = { mode: 'classic' },
  ) {
    super(68);
    this.scene = scene;
    this.ocean = ocean;
    this.boatEntity = boatEntity;
    this.wildlifeSystem = wildlifeSystem;
    this.chunkManager = chunkManager;
    this.killTracker = killTracker;
    this.soundEffects = soundEffects;
    this.config = config;

    this.explosions = new ExplosionEffect(scene);
    if (config.mode === 'magical') {
      this.confetti = new ConfettiEffect(scene);
      this.unicornEffect = new UnicornEffect(scene);
    }

    // Create torpedo button
    this.torpedoButton = document.createElement('button');
    this.torpedoButton.id = 'torpedo-button';
    this.torpedoButton.textContent = config.mode === 'magical' ? '\u{1F31F}' : 'T';
    document.body.appendChild(this.torpedoButton);

    this.torpedoButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.fireTorpedoAction();
    });
    this.torpedoButton.addEventListener('click', () => {
      this.fireTorpedoAction();
    });

    // Create missile button
    this.missileButton = document.createElement('button');
    this.missileButton.id = 'missile-button';
    this.missileButton.textContent = config.mode === 'magical' ? '\u{1F308}' : 'M';
    document.body.appendChild(this.missileButton);

    this.missileButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.fireMissileAction();
    });
    this.missileButton.addEventListener('click', () => {
      this.fireMissileAction();
    });

    // Keyboard shortcuts
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !e.repeat) this.fireTorpedoAction();
      if (e.code === 'KeyM' && !e.repeat) this.fireMissileAction();
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  private lastTransform: Transform | null = null;

  private fireTorpedoAction(): void {
    if (this.torpedoCooldown > 0 || this.torpedoes.length >= MAX_TORPEDOES || !this.lastTransform) return;
    this.fireTorpedo(this.lastTransform);
  }

  private fireMissileAction(): void {
    if (this.missileCooldown > 0 || this.missiles.length >= MAX_MISSILES || !this.lastTransform) return;
    this.fireMissile(this.lastTransform);
  }

  update(world: World, dt: number): void {
    this.elapsedTime += dt;

    const transform = world.getComponent<Transform>(this.boatEntity, 'Transform');
    if (!transform) return;
    this.lastTransform = transform;

    // Update cooldowns
    if (this.torpedoCooldown > 0) this.torpedoCooldown = Math.max(0, this.torpedoCooldown - dt);
    if (this.missileCooldown > 0) this.missileCooldown = Math.max(0, this.missileCooldown - dt);

    // Update torpedo button state
    const tLabel = this.config.mode === 'magical' ? '\u{1F31F}' : 'T';
    if (this.torpedoCooldown > 0) {
      this.torpedoButton.textContent = `${tLabel} ${Math.ceil(this.torpedoCooldown)}`;
      this.torpedoButton.classList.add('on-cooldown');
    } else if (this.torpedoes.length >= MAX_TORPEDOES) {
      this.torpedoButton.textContent = tLabel;
      this.torpedoButton.classList.add('on-cooldown');
    } else {
      this.torpedoButton.textContent = tLabel;
      this.torpedoButton.classList.remove('on-cooldown');
    }

    // Update missile button state
    const mLabel = this.config.mode === 'magical' ? '\u{1F308}' : 'M';
    const islands = this.chunkManager.getIslandPositions();
    const hasIslandTarget = this.findNearestIsland(transform, islands) !== null;

    if (this.missileCooldown > 0) {
      this.missileButton.textContent = `${mLabel} ${Math.ceil(this.missileCooldown)}`;
      this.missileButton.classList.add('on-cooldown');
      this.missileButton.classList.remove('no-target');
    } else if (!hasIslandTarget) {
      this.missileButton.textContent = mLabel;
      this.missileButton.classList.remove('on-cooldown');
      this.missileButton.classList.add('no-target');
    } else if (this.missiles.length >= MAX_MISSILES) {
      this.missileButton.textContent = mLabel;
      this.missileButton.classList.add('on-cooldown');
      this.missileButton.classList.remove('no-target');
    } else {
      this.missileButton.textContent = mLabel;
      this.missileButton.classList.remove('on-cooldown', 'no-target');
    }

    // Update torpedoes
    this.updateTorpedoes(dt);

    // Update missiles
    this.updateMissiles(dt);
  }

  updateEffects(dt: number): void {
    // Update torpedo wakes
    for (const t of this.torpedoes) {
      t.wake.update(t.position, t.heading, TORPEDO_SPEED, dt);
    }

    // Update orphaned rainbow wakes (persist after torpedo impact)
    for (let i = this.orphanedWakes.length - 1; i >= 0; i--) {
      if (this.orphanedWakes[i].updateOrphaned(dt)) {
        this.orphanedWakes[i].dispose(this.scene);
        this.orphanedWakes.splice(i, 1);
      }
    }

    // Update orphaned rainbow missile trails (persist after missile impact)
    for (let i = this.orphanedTrails.length - 1; i >= 0; i--) {
      if (this.orphanedTrails[i].updateOrphaned(dt)) {
        this.orphanedTrails[i].dispose(this.scene);
        this.orphanedTrails.splice(i, 1);
      }
    }

    // Update explosion/confetti particles
    this.explosions.update(dt);
    this.confetti?.update(dt);
    this.unicornEffect?.update(dt);
  }

  private updateTorpedoes(dt: number): void {
    for (let i = this.torpedoes.length - 1; i >= 0; i--) {
      const t = this.torpedoes[i];
      t.age += dt;

      if (t.age > TORPEDO_MAX_AGE) {
        this.destroyTorpedo(i);
        continue;
      }

      // Home toward nearest vessel or battleship strike zone
      const target = this.wildlifeSystem.findNearestVesselOrZone(
        t.position.x, t.position.z, TORPEDO_SEEK_RANGE,
      );

      if (target) {
        const dx = target.targetX - t.position.x;
        const dz = target.targetZ - t.position.z;
        const targetAngle = Math.atan2(dx, dz);

        let angleDiff = targetAngle - t.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const maxTurn = TORPEDO_TURN_RATE * dt;
        t.heading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      }

      // Move forward
      t.position.x += Math.sin(t.heading) * TORPEDO_SPEED * dt;
      t.position.z += Math.cos(t.heading) * TORPEDO_SPEED * dt;

      // Island collision — destroy torpedo on land hit
      const terrainH = this.chunkManager.getTerrainHeight(t.position.x, t.position.z);
      if (terrainH > 0.3) {
        if (this.config.mode === 'magical') {
          this.confetti?.spawnBurst(t.position.x, t.position.y + 1, t.position.z);
        } else {
          this.explosions.spawnExplosion(t.position.x, t.position.y + 1, t.position.z);
        }
        this.destroyTorpedo(i);
        continue;
      }

      // Ride ocean surface
      const waveY = this.ocean.getWaveHeight(t.position.x, t.position.z, this.elapsedTime);
      t.position.y = waveY + 0.05;

      // Update mesh
      t.mesh.position.copy(t.position);
      t.mesh.rotation.y = t.heading;

      // Gentle pitch rocking
      t.mesh.rotation.x = Math.sin(this.elapsedTime * 3 + i) * 0.05;

      // Hit detection against vessels
      const hit = this.checkTorpedoHit(t);
      if (hit) {
        if (this.config.mode === 'magical') {
          this.confetti?.spawnBurst(t.position.x, t.position.y, t.position.z);
        } else {
          this.explosions.spawnExplosion(t.position.x, t.position.y, t.position.z);
        }
        if (this.config.mode === 'magical') {
          this.soundEffects.playMagicChime();
        } else {
          this.soundEffects.playExplosion();
        }

        if (hit.entity.strikeZones && hit.zoneIndex >= 0) {
          // Mark zone as hit (battleship turret or leviathan tentacle)
          hit.entity.strikeZones.hit[hit.zoneIndex] = true;

          // Check if all zones destroyed
          const allHit = hit.entity.strikeZones.hit.every(h => h);
          if (allHit) {
            // The vessel (or beast) goes down — extra effects at each zone
            for (const offset of hit.entity.strikeZones.offsets) {
              const wx = hit.entity.mesh.position.x + Math.sin(hit.entity.heading) * offset;
              const wz = hit.entity.mesh.position.z + Math.cos(hit.entity.heading) * offset;
              if (this.config.mode === 'magical') {
                this.confetti?.spawnBurst(wx, hit.entity.mesh.position.y, wz);
              } else {
                this.explosions.spawnExplosion(wx, hit.entity.mesh.position.y, wz);
              }
            }
            if (this.config.mode === 'magical') {
              this.unicornEffect?.spawn(hit.entity.mesh.position);
            }
            this.wildlifeSystem.removeEntity(hit.entity);
            if (hit.entity.type === 'leviathan') {
              this.onLeviathanSlain?.();
            } else {
              this.killTracker.recordBoatKill();
            }
          }
        } else {
          // Regular vessel — instant destroy
          if (this.config.mode === 'magical') {
            this.unicornEffect?.spawn(hit.entity.mesh.position);
          }
          this.wildlifeSystem.removeEntity(hit.entity);
          this.killTracker.recordBoatKill();
          this.onKarma?.(
            -15,
            hit.entity.type === 'fishing_boat' ? 'Sank an innocent fishing boat' : 'Sank an innocent cargo ship',
          );
        }

        this.destroyTorpedo(i);
      }
    }
  }

  private checkTorpedoHit(torpedo: Torpedo): { entity: import('./WildlifeSystem').WildlifeEntity; zoneIndex: number } | null {
    const result = this.wildlifeSystem.findNearestVesselOrZone(
      torpedo.position.x, torpedo.position.z, 20,
    );
    if (!result) return null;

    const dx = result.targetX - torpedo.position.x;
    const dz = result.targetZ - torpedo.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const hitRadius = result.entity.type === 'leviathan' ? 6
      : result.entity.type === 'battleship' ? 5
      : result.entity.type === 'cargo_ship' ? 4 : 2;

    if (dist >= hitRadius) return null;

    // Determine which zone was hit (battleship turrets, leviathan tentacles)
    if (result.entity.strikeZones) {
      for (let i = 0; i < result.entity.strikeZones.offsets.length; i++) {
        if (result.entity.strikeZones.hit[i]) continue;
        const zoneZ = result.entity.strikeZones.offsets[i];
        const worldX = result.entity.mesh.position.x + Math.sin(result.entity.heading) * zoneZ;
        const worldZ = result.entity.mesh.position.z + Math.cos(result.entity.heading) * zoneZ;
        const zdx = worldX - torpedo.position.x;
        const zdz = worldZ - torpedo.position.z;
        if (Math.sqrt(zdx * zdx + zdz * zdz) < hitRadius) {
          return { entity: result.entity, zoneIndex: i };
        }
      }
      // All zones hit already (shouldn't reach here due to findNearestVesselOrZone filtering)
      return null;
    }

    return { entity: result.entity, zoneIndex: -1 };
  }

  private cubicBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    out.set(
      uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
      uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z,
    );
    return out;
  }

  private updateMissiles(dt: number): void {
    const pos = _tempVec;
    const nextPos = new THREE.Vector3();

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.elapsed += dt;

      const t = Math.min(m.elapsed / m.flightTime, 1.0);

      // Position along cubic bezier
      this.cubicBezier(m.p0, m.p1, m.p2, m.p3, t, pos);
      m.mesh.position.copy(pos);

      // Update trail
      if (m.rainbowTrail) {
        m.rainbowTrail.addPoint(pos.clone());
        m.rainbowTrail.updateTime(dt);
      } else if (m.trail && m.trailPositions) {
        const ti = m.trailIndex;
        if (ti < 100) {
          m.trailPositions[ti * 3] = pos.x;
          m.trailPositions[ti * 3 + 1] = pos.y;
          m.trailPositions[ti * 3 + 2] = pos.z;
          m.trailIndex = ti + 1;
          m.trail.geometry.setDrawRange(0, m.trailIndex);
          (m.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
      }

      // Orient mesh along velocity (bezier tangent)
      const nextT = Math.min(t + 0.01, 1.0);
      this.cubicBezier(m.p0, m.p1, m.p2, m.p3, nextT, nextPos);
      m.mesh.lookAt(nextPos);

      // Impact
      if (t >= 1.0) {
        // Check if island has a lighthouse
        const lighthouse = this.chunkManager.findLighthouseNearIsland(m.targetIslandX, m.targetIslandZ);

        if (lighthouse) {
          const lhPos = new THREE.Vector3();
          lighthouse.getWorldPosition(lhPos);

          for (let e = 0; e < 5; e++) {
            const ex = lhPos.x + (Math.random() - 0.5) * 20;
            const ey = lhPos.y + Math.random() * 5;
            const ez = lhPos.z + (Math.random() - 0.5) * 20;
            if (this.config.mode === 'magical') {
              this.confetti?.spawnBurst(ex, ey, ez);
            } else {
              this.explosions.spawnExplosion(ex, ey, ez);
            }
          }

          if (this.config.mode === 'magical') {
            this.unicornEffect?.spawn(lhPos);
          }
          this.chunkManager.removeLighthouse(m.targetIslandX, m.targetIslandZ);
          this.killTracker.recordLighthouseKill();
          this.onKarma?.(-20, 'Darkened a beacon', 'beacon');
        } else {
          // No lighthouse — normal island impact, no kill
          for (let e = 0; e < 5; e++) {
            const ex = m.p3.x + (Math.random() - 0.5) * 20;
            const ey = m.p3.y + Math.random() * 5;
            const ez = m.p3.z + (Math.random() - 0.5) * 20;
            if (this.config.mode === 'magical') {
              this.confetti?.spawnBurst(ex, ey, ez);
            } else {
              this.explosions.spawnExplosion(ex, ey, ez);
            }
          }
        }

        if (this.config.mode === 'magical') {
          this.soundEffects.playMagicChime();
        } else {
          this.soundEffects.playExplosion();
        }
        this.destroyMissile(i);
      }
    }
  }

  private fireTorpedo(boatTransform: Transform): void {
    // Spawn at bow
    _tempVec.copy(_bowLocal).applyQuaternion(boatTransform.quaternion);
    const spawnPos = new THREE.Vector3().copy(boatTransform.position).add(_tempVec);
    const waveY = this.ocean.getWaveHeight(spawnPos.x, spawnPos.z, this.elapsedTime);
    spawnPos.y = waveY + 0.05;

    const mesh = createTorpedoMesh();
    mesh.position.copy(spawnPos);
    mesh.rotation.y = boatTransform.rotation.y;
    if (this.config.mode === 'magical') mesh.visible = false;
    this.scene.add(mesh);

    const wake = this.config.mode === 'magical'
      ? new RainbowTorpedoWake(this.scene)
      : new TorpedoWake(this.scene);

    this.torpedoes.push({
      mesh,
      wake,
      position: spawnPos.clone(),
      heading: boatTransform.rotation.y,
      age: 0,
    });

    this.torpedoCooldown = TORPEDO_COOLDOWN;
    this.soundEffects.playTorpedoLaunch();
  }

  private fireMissile(boatTransform: Transform): void {
    const islands = this.chunkManager.getIslandPositions();
    const target = this.findNearestIsland(boatTransform, islands);
    if (!target) return;

    // Launch from bow
    _tempVec.copy(_bowLocal).applyQuaternion(boatTransform.quaternion);
    const p0 = new THREE.Vector3().copy(boatTransform.position).add(_tempVec);
    p0.y = boatTransform.position.y + 2.0;

    // Target on island surface
    const p3 = new THREE.Vector3(target.x, 5, target.z);

    const dx = p3.x - p0.x;
    const dz = p3.z - p0.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const peakHeight = Math.max(40, horizontalDist * 0.35);
    const flightTime = horizontalDist / MISSILE_H_SPEED;

    // Boat forward direction
    _forward.set(0, 0, 1).applyQuaternion(boatTransform.quaternion);

    // P1: forward and up from bow (missile launches forward first)
    const launchDist = Math.min(horizontalDist * 0.35, 80);
    const p1 = new THREE.Vector3(
      p0.x + _forward.x * launchDist,
      p0.y + peakHeight * 0.8,
      p0.z + _forward.z * launchDist,
    );

    // P2: above island (approach from high)
    const p2 = new THREE.Vector3(
      p3.x,
      p3.y + peakHeight * 0.5,
      p3.z,
    );

    const mesh = createMissileMesh();
    mesh.position.copy(p0);
    if (this.config.mode === 'magical') mesh.visible = false;
    this.scene.add(mesh);

    let trail: THREE.Line | null = null;
    let trailPositions: Float32Array | null = null;
    let rainbowTrail: RainbowMissileTrail | null = null;

    if (this.config.mode === 'magical') {
      rainbowTrail = new RainbowMissileTrail(this.scene, p0);
    } else {
      // Classic smoke trail line
      trailPositions = new Float32Array(100 * 3);
      trailPositions[0] = p0.x;
      trailPositions[1] = p0.y;
      trailPositions[2] = p0.z;
      const trailGeom = new THREE.BufferGeometry();
      trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      trailGeom.setDrawRange(0, 1);
      const trailMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 });
      trail = new THREE.Line(trailGeom, trailMat);
      trail.frustumCulled = false;
      this.scene.add(trail);
    }

    this.missiles.push({
      mesh,
      p0: p0.clone(),
      p1,
      p2,
      p3,
      targetIslandX: target.x,
      targetIslandZ: target.z,
      flightTime: Math.max(flightTime, 1.5),
      elapsed: 0,
      trail,
      trailPositions,
      trailIndex: 1,
      rainbowTrail,
    });

    this.missileCooldown = MISSILE_COOLDOWN;
    this.soundEffects.playMissileLaunch();
  }

  private findNearestIsland(
    transform: Transform,
    islands: { x: number; z: number; radius: number }[],
  ): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestDist = MISSILE_MAX_RANGE;
    for (const island of islands) {
      const dx = island.x - transform.position.x;
      const dz = island.z - transform.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: island.x, z: island.z };
      }
    }
    return best;
  }

  private destroyTorpedo(index: number): void {
    const t = this.torpedoes[index];
    this.scene.remove(t.mesh);
    t.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    // In magical mode, orphan the rainbow wake to persist for 10s
    if (this.config.mode === 'magical' && t.wake instanceof RainbowTorpedoWake) {
      t.wake.freeze();
      this.orphanedWakes.push(t.wake);
    } else {
      t.wake.dispose(this.scene);
    }
    this.torpedoes.splice(index, 1);
  }

  private destroyMissile(index: number): void {
    const m = this.missiles[index];
    this.scene.remove(m.mesh);
    m.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    // Handle trail cleanup
    if (m.rainbowTrail) {
      m.rainbowTrail.freeze();
      this.orphanedTrails.push(m.rainbowTrail);
    } else if (m.trail) {
      this.scene.remove(m.trail);
      m.trail.geometry.dispose();
      (m.trail.material as THREE.Material).dispose();
    }
    this.missiles.splice(index, 1);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    this.torpedoButton.remove();
    this.missileButton.remove();

    // Clean up active torpedoes
    for (const t of this.torpedoes) {
      this.scene.remove(t.mesh);
      t.wake.dispose(this.scene);
    }
    this.torpedoes.length = 0;

    // Clean up active missiles
    for (const m of this.missiles) {
      this.scene.remove(m.mesh);
      if (m.rainbowTrail) m.rainbowTrail.dispose(this.scene);
      if (m.trail) {
        this.scene.remove(m.trail);
        m.trail.geometry.dispose();
        (m.trail.material as THREE.Material).dispose();
      }
    }
    this.missiles.length = 0;

    // Clean up orphaned effects
    for (const w of this.orphanedWakes) w.dispose(this.scene);
    this.orphanedWakes.length = 0;
    for (const t of this.orphanedTrails) t.dispose(this.scene);
    this.orphanedTrails.length = 0;

    this.explosions.dispose();
    this.confetti?.dispose();
    this.unicornEffect?.dispose();
  }
}
