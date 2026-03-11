import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Ocean } from '../rendering/Ocean';
import { WildlifeSystem } from './WildlifeSystem';
import { ChunkManager } from '../world/ChunkManager';
import { ExplosionEffect } from '../rendering/ExplosionEffect';
import { TorpedoWake } from '../rendering/TorpedoWake';
import { createTorpedoMesh, createMissileMesh } from '../rendering/ProjectileMesh';

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
const MISSILE_MAX_RANGE = 500;
const MAX_MISSILES = 2;

const _bowLocal = new THREE.Vector3(0, 0.1, 3.5);
const _tempVec = new THREE.Vector3();
const _forward = new THREE.Vector3();

interface Torpedo {
  mesh: THREE.Group;
  wake: TorpedoWake;
  position: THREE.Vector3;
  heading: number;
  age: number;
}

interface Missile {
  mesh: THREE.Group;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startY: number;
  endY: number;
  peakHeight: number;
  flightTime: number;
  elapsed: number;
}

export class WeaponsSystem extends System {
  private scene: THREE.Scene;
  private ocean: Ocean;
  private boatEntity: number;
  private wildlifeSystem: WildlifeSystem;
  private chunkManager: ChunkManager;

  private torpedoes: Torpedo[] = [];
  private missiles: Missile[] = [];
  private explosions: ExplosionEffect;

  private torpedoCooldown = 0;
  private missileCooldown = 0;
  private elapsedTime = 0;

  private torpedoButton: HTMLButtonElement;
  private missileButton: HTMLButtonElement;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    boatEntity: number,
    wildlifeSystem: WildlifeSystem,
    chunkManager: ChunkManager,
  ) {
    super(68);
    this.scene = scene;
    this.ocean = ocean;
    this.boatEntity = boatEntity;
    this.wildlifeSystem = wildlifeSystem;
    this.chunkManager = chunkManager;

    this.explosions = new ExplosionEffect(scene);

    // Create torpedo button
    this.torpedoButton = document.createElement('button');
    this.torpedoButton.id = 'torpedo-button';
    this.torpedoButton.textContent = 'Torpedo';
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
    this.missileButton.textContent = 'Missile';
    document.body.appendChild(this.missileButton);

    this.missileButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.fireMissileAction();
    });
    this.missileButton.addEventListener('click', () => {
      this.fireMissileAction();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyY' && !e.repeat) this.fireTorpedoAction();
      if (e.code === 'KeyU' && !e.repeat) this.fireMissileAction();
    });
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
    if (this.torpedoCooldown > 0) {
      this.torpedoButton.textContent = `Torpedo (${Math.ceil(this.torpedoCooldown)}s)`;
      this.torpedoButton.classList.add('on-cooldown');
    } else if (this.torpedoes.length >= MAX_TORPEDOES) {
      this.torpedoButton.textContent = 'Torpedo (max)';
      this.torpedoButton.classList.add('on-cooldown');
    } else {
      this.torpedoButton.textContent = 'Torpedo';
      this.torpedoButton.classList.remove('on-cooldown');
    }

    // Update missile button state
    const islands = this.chunkManager.getIslandPositions();
    const hasIslandTarget = this.findNearestIsland(transform, islands) !== null;

    if (this.missileCooldown > 0) {
      this.missileButton.textContent = `Missile (${Math.ceil(this.missileCooldown)}s)`;
      this.missileButton.classList.add('on-cooldown');
      this.missileButton.classList.remove('no-target');
    } else if (!hasIslandTarget) {
      this.missileButton.textContent = 'Missile (---)';
      this.missileButton.classList.remove('on-cooldown');
      this.missileButton.classList.add('no-target');
    } else if (this.missiles.length >= MAX_MISSILES) {
      this.missileButton.textContent = 'Missile (max)';
      this.missileButton.classList.add('on-cooldown');
      this.missileButton.classList.remove('no-target');
    } else {
      this.missileButton.textContent = 'Missile';
      this.missileButton.classList.remove('on-cooldown', 'no-target');
    }

    // Update torpedoes
    this.updateTorpedoes(transform, dt);

    // Update missiles
    this.updateMissiles(dt);
  }

  updateEffects(dt: number): void {
    // Update torpedo wakes
    for (const t of this.torpedoes) {
      t.wake.update(t.position, t.heading, TORPEDO_SPEED, dt);
    }

    // Update explosion particles
    this.explosions.update(dt);
  }

  private updateTorpedoes(boatTransform: Transform, dt: number): void {
    for (let i = this.torpedoes.length - 1; i >= 0; i--) {
      const t = this.torpedoes[i];
      t.age += dt;

      if (t.age > TORPEDO_MAX_AGE) {
        this.destroyTorpedo(i);
        continue;
      }

      // Home toward nearest vessel
      const target = this.wildlifeSystem.findNearestVessel(
        t.position.x, t.position.z, TORPEDO_SEEK_RANGE,
      );

      if (target) {
        const dx = target.mesh.position.x - t.position.x;
        const dz = target.mesh.position.z - t.position.z;
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
        this.explosions.spawnExplosion(t.position.x, t.position.y, t.position.z);
        this.wildlifeSystem.removeEntity(hit);
        this.destroyTorpedo(i);
      }
    }
  }

  private checkTorpedoHit(torpedo: Torpedo): import('./WildlifeSystem').WildlifeEntity | null {
    // Check against all vessels
    const vessel = this.wildlifeSystem.findNearestVessel(
      torpedo.position.x, torpedo.position.z, 20,
    );
    if (!vessel) return null;

    const dx = vessel.mesh.position.x - torpedo.position.x;
    const dz = vessel.mesh.position.z - torpedo.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const hitRadius = vessel.type === 'cargo_ship' ? 4 : 2;
    return dist < hitRadius ? vessel : null;
  }

  private updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.elapsed += dt;

      const t = Math.min(m.elapsed / m.flightTime, 1.0);

      // Position along parabolic arc
      const x = THREE.MathUtils.lerp(m.startPos.x, m.endPos.x, t);
      const z = THREE.MathUtils.lerp(m.startPos.z, m.endPos.z, t);
      const baseY = THREE.MathUtils.lerp(m.startY, m.endY, t);
      const arcY = m.peakHeight * 4 * t * (1 - t);
      const y = baseY + arcY;

      m.mesh.position.set(x, y, z);

      // Orient mesh along velocity direction
      const nextT = Math.min(t + 0.01, 1.0);
      const nx = THREE.MathUtils.lerp(m.startPos.x, m.endPos.x, nextT);
      const nz = THREE.MathUtils.lerp(m.startPos.z, m.endPos.z, nextT);
      const nBaseY = THREE.MathUtils.lerp(m.startY, m.endY, nextT);
      const nArcY = m.peakHeight * 4 * nextT * (1 - nextT);
      const ny = nBaseY + nArcY;

      _tempVec.set(nx - x, ny - y, nz - z).normalize();
      m.mesh.lookAt(m.mesh.position.x + _tempVec.x, m.mesh.position.y + _tempVec.y, m.mesh.position.z + _tempVec.z);

      // Impact
      if (t >= 1.0) {
        this.explosions.spawnExplosion(m.endPos.x, m.endY, m.endPos.z);
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
    this.scene.add(mesh);

    const wake = new TorpedoWake(this.scene);

    this.torpedoes.push({
      mesh,
      wake,
      position: spawnPos.clone(),
      heading: boatTransform.rotation.y,
      age: 0,
    });

    this.torpedoCooldown = TORPEDO_COOLDOWN;
  }

  private fireMissile(boatTransform: Transform): void {
    const islands = this.chunkManager.getIslandPositions();
    const target = this.findNearestIsland(boatTransform, islands);
    if (!target) return;

    const startPos = new THREE.Vector3(
      boatTransform.position.x,
      boatTransform.position.y + 2.0,
      boatTransform.position.z,
    );
    const endPos = new THREE.Vector3(target.x, 0, target.z);
    const endY = 5; // slightly above ground for visual impact

    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const flightTime = horizontalDist / MISSILE_H_SPEED;
    const peakHeight = Math.max(30, horizontalDist * 0.3);

    const mesh = createMissileMesh();
    mesh.position.copy(startPos);
    this.scene.add(mesh);

    this.missiles.push({
      mesh,
      startPos: startPos.clone(),
      endPos: endPos.clone(),
      startY: startPos.y,
      endY,
      peakHeight,
      flightTime,
      elapsed: 0,
    });

    this.missileCooldown = MISSILE_COOLDOWN;
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
    t.wake.dispose(this.scene);
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
    this.missiles.splice(index, 1);
  }
}
