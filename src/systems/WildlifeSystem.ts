import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Ocean } from '../rendering/Ocean';

// ─── Geometry builders ───────────────────────────────────────

function createDolphinMesh(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: 0.4, metalness: 0.1 });
  // Body — tapered ellipsoid via scaled sphere
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mat);
  body.scale.set(1, 0.6, 2.5);
  group.add(body);
  // Snout — tapered elongated sphere (no more spoonbill cone)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat);
  snout.scale.set(0.6, 0.5, 1.8);
  snout.position.z = 1.05;
  group.add(snout);
  // Belly — lighter underside for visual interest
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0x9aabb8, roughness: 0.4, metalness: 0.05 });
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), bellyMat);
  belly.scale.set(0.85, 0.3, 2.2);
  belly.position.y = -0.08;
  group.add(belly);
  // Dorsal fin
  const finMat = new THREE.MeshStandardMaterial({ color: 0x506070, roughness: 0.5, metalness: 0.1 });
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), finMat);
  dorsal.position.set(0, 0.35, -0.1);
  dorsal.rotation.z = 0.15;
  group.add(dorsal);
  // Tail flukes
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.25), finMat);
  fluke.position.set(0, 0, -1.1);
  group.add(fluke);
  return group;
}

function createWhaleMesh(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.5, metalness: 0.05 });
  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), mat);
  body.scale.set(1, 0.7, 2.5);
  group.add(body);
  // Head bump
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), mat);
  head.position.set(0, 0.2, 3.2);
  head.scale.set(1, 0.7, 1);
  group.add(head);
  // Tail flukes — two tapered flat shapes angled outward like real whale flukes
  const flukeMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
  // Left fluke
  const leftFlukeShape = new THREE.Shape();
  leftFlukeShape.moveTo(0, 0);
  leftFlukeShape.quadraticCurveTo(-0.6, 0.1, -1.2, 0);
  leftFlukeShape.quadraticCurveTo(-0.8, -0.05, 0, -0.08);
  leftFlukeShape.closePath();
  const flukeExtrudeSettings = { depth: 0.06, bevelEnabled: false };
  const leftFluke = new THREE.Mesh(new THREE.ExtrudeGeometry(leftFlukeShape, flukeExtrudeSettings), flukeMat);
  leftFluke.position.set(0, 0.3, -4.0);
  leftFluke.rotation.set(0.2, 0, -0.5); // tilt outward
  group.add(leftFluke);
  // Right fluke
  const rightFlukeShape = new THREE.Shape();
  rightFlukeShape.moveTo(0, 0);
  rightFlukeShape.quadraticCurveTo(0.6, 0.1, 1.2, 0);
  rightFlukeShape.quadraticCurveTo(0.8, -0.05, 0, -0.08);
  rightFlukeShape.closePath();
  const rightFluke = new THREE.Mesh(new THREE.ExtrudeGeometry(rightFlukeShape, flukeExtrudeSettings), flukeMat);
  rightFluke.position.set(0, 0.3, -4.0);
  rightFluke.rotation.set(0.2, 0, 0.5); // tilt outward
  group.add(rightFluke);
  // Dorsal (small for humpback-ish)
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), flukeMat);
  dorsal.position.set(0, 1.1, -1.0);
  group.add(dorsal);
  return group;
}

function createFishingBoatMesh(): THREE.Group {
  const group = new THREE.Group();
  // Hull — simple white boat
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xDDDDEE, roughness: 0.6, metalness: 0.05 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 3.5), hullMat);
  hull.position.y = 0.1;
  group.add(hull);
  // Cabin
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x4477AA, roughness: 0.5, metalness: 0.1 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.0), cabinMat);
  cabin.position.set(0, 0.75, -0.4);
  group.add(cabin);
  // Mast/pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 2.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.5 })
  );
  pole.position.set(0, 1.6, 0.6);
  group.add(pole);
  return group;
}

function createCargoShipMesh(): THREE.Group {
  const group = new THREE.Group();
  // Hull — dark large vessel
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.2 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 16), hullMat);
  hull.position.y = 0.5;
  group.add(hull);
  // Deck
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.7, metalness: 0.0 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 15), deckMat);
  deck.position.y = 1.55;
  group.add(deck);
  // Containers (colored boxes)
  const colors = [0xCC3333, 0x3366CC, 0x33AA33, 0xCCAA22, 0xCC6633];
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 2.8),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6, metalness: 0.1 })
    );
    c.position.set(
      (i % 2 === 0 ? -0.9 : 0.9),
      2.2 + Math.floor(i / 4) * 1.25,
      -3 + (i % 4) * 3
    );
    group.add(c);
  }
  // Bridge
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xEEEEDD, roughness: 0.5, metalness: 0.1 });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), bridgeMat);
  bridge.position.set(0, 3.5, -5.5);
  group.add(bridge);
  // Smokestack
  const stack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.3 })
  );
  stack.position.set(0, 6, -5.5);
  group.add(stack);
  return group;
}

// ─── Wildlife entity types ───────────────────────────────────

export interface WildlifeEntity {
  type: 'dolphin' | 'whale' | 'fishing_boat' | 'cargo_ship';
  mesh: THREE.Group;
  origin: THREE.Vector3;   // spawn world position
  heading: number;         // radians
  speed: number;           // m/s
  phase: number;           // animation phase offset
  age: number;             // seconds alive
  maxAge: number;          // despawn after this
  towed: boolean;          // true when attached to tugboat
}

// ─── System ──────────────────────────────────────────────────

export class WildlifeSystem extends System {
  private scene: THREE.Scene;
  private ocean: Ocean;
  private boatEntity: number;
  private entities: WildlifeEntity[] = [];
  private spawnTimer = 0;
  private time = 0;

  private static readonly MAX_DOLPHINS = 8;
  private static readonly MAX_WHALES = 2;
  private static readonly MAX_FISHING = 3;
  private static readonly MAX_CARGO = 2;

  private static readonly SPAWN_RADIUS_MIN = 40;
  private static readonly SPAWN_RADIUS_MAX = 200;
  private static readonly DESPAWN_RADIUS = 350;

  constructor(scene: THREE.Scene, ocean: Ocean, boatEntity: number) {
    super(65); // after physics, before camera
    this.scene = scene;
    this.ocean = ocean;
    this.boatEntity = boatEntity;
  }

  update(world: World, dt: number): void {
    this.time += dt;
    this.spawnTimer -= dt;

    const boatTransform = world.getComponent<Transform>(this.boatEntity, 'Transform');
    if (!boatTransform) return;
    const bx = boatTransform.position.x;
    const bz = boatTransform.position.z;

    // Spawn new wildlife periodically
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2 + Math.random() * 3;
      this.trySpawn(bx, bz);
    }

    // Update and cull
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.age += dt;

      // Despawn if too far or too old
      const dx = e.mesh.position.x - bx;
      const dz = e.mesh.position.z - bz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if ((dist > WildlifeSystem.DESPAWN_RADIUS || e.age > e.maxAge) && !e.towed) {
        this.scene.remove(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }

      if (!e.towed) this.updateEntity(e, dt);
    }

    // Vessel collision — push player boat away from fishing boats and cargo ships
    const boatRb = world.getComponent<RigidBody>(this.boatEntity, 'RigidBody');
    if (boatRb) {
      for (const e of this.entities) {
        if (e.type !== 'fishing_boat' && e.type !== 'cargo_ship') continue;
        if (e.towed) continue;
        const collisionRadius = e.type === 'cargo_ship' ? 12 : 4;
        const dx = boatTransform.position.x - e.mesh.position.x;
        const dz = boatTransform.position.z - e.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < collisionRadius && dist > 0.01) {
          const nx = dx / dist;
          const nz = dz / dist;
          // Push boat outward
          const overlap = collisionRadius - dist;
          boatTransform.position.x += nx * overlap * 0.5;
          boatTransform.position.z += nz * overlap * 0.5;
          // Reflect velocity away
          const inward = boatRb.velocity.x * -nx + boatRb.velocity.z * -nz;
          if (inward > 0) {
            boatRb.velocity.x += nx * inward * 1.5;
            boatRb.velocity.z += nz * inward * 1.5;
          }
        }
      }
    }
  }

  private countType(type: string): number {
    return this.entities.filter(e => e.type === type).length;
  }

  private trySpawn(bx: number, bz: number): void {
    // Pick a type that's under quota
    const candidates: WildlifeEntity['type'][] = [];
    if (this.countType('dolphin') < WildlifeSystem.MAX_DOLPHINS) candidates.push('dolphin', 'dolphin', 'dolphin');
    if (this.countType('whale') < WildlifeSystem.MAX_WHALES) candidates.push('whale');
    if (this.countType('fishing_boat') < WildlifeSystem.MAX_FISHING) candidates.push('fishing_boat');
    if (this.countType('cargo_ship') < WildlifeSystem.MAX_CARGO) candidates.push('cargo_ship');
    if (candidates.length === 0) return;

    const type = candidates[Math.floor(Math.random() * candidates.length)];

    // Spawn at random position around boat
    const angle = Math.random() * Math.PI * 2;
    const r = WildlifeSystem.SPAWN_RADIUS_MIN +
      Math.random() * (WildlifeSystem.SPAWN_RADIUS_MAX - WildlifeSystem.SPAWN_RADIUS_MIN);
    const sx = bx + Math.cos(angle) * r;
    const sz = bz + Math.sin(angle) * r;

    let mesh: THREE.Group;
    let speed: number;
    let maxAge: number;

    switch (type) {
      case 'dolphin':
        mesh = createDolphinMesh();
        speed = 4 + Math.random() * 3;
        maxAge = 30 + Math.random() * 30;
        break;
      case 'whale':
        mesh = createWhaleMesh();
        speed = 1.5 + Math.random() * 1;
        maxAge = 45 + Math.random() * 30;
        break;
      case 'fishing_boat':
        mesh = createFishingBoatMesh();
        speed = 1 + Math.random() * 2;
        maxAge = 60 + Math.random() * 60;
        break;
      case 'cargo_ship':
        mesh = createCargoShipMesh();
        speed = 3 + Math.random() * 2;
        maxAge = 90 + Math.random() * 60;
        break;
    }

    const heading = Math.random() * Math.PI * 2;
    mesh.position.set(sx, 0, sz);
    mesh.rotation.y = heading;
    this.scene.add(mesh);

    this.entities.push({
      type,
      mesh,
      origin: new THREE.Vector3(sx, 0, sz),
      heading,
      speed,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      maxAge,
      towed: false,
    });
  }

  /** Find the nearest towable vessel (fishing boat or cargo ship) within maxRadius */
  findNearestTowable(x: number, z: number, maxRadius: number): WildlifeEntity | null {
    let best: WildlifeEntity | null = null;
    let bestDist = maxRadius;
    for (const e of this.entities) {
      if (e.towed) continue; // don't collide with towed vessel
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  /** Mark a wildlife entity as towed or released */
  setEntityTowed(entity: WildlifeEntity, towed: boolean): void {
    entity.towed = towed;
    if (!towed) {
      // Reset age so it doesn't immediately despawn
      entity.age = 0;
      entity.origin.copy(entity.mesh.position);
    }
  }

  /** Check if a wildlife entity still exists in the active list */
  isEntityAlive(entity: WildlifeEntity): boolean {
    return this.entities.includes(entity);
  }

  /** Find the nearest fishing boat or cargo ship within maxRadius */
  findNearestVessel(x: number, z: number, maxRadius: number): WildlifeEntity | null {
    let best: WildlifeEntity | null = null;
    let bestDist = maxRadius;
    for (const e of this.entities) {
      if (e.type !== 'fishing_boat' && e.type !== 'cargo_ship') continue;
      if (e.towed) continue;
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  /** Remove a wildlife entity from the scene and internal list */
  removeEntity(entity: WildlifeEntity): void {
    const idx = this.entities.indexOf(entity);
    if (idx === -1) return;
    this.scene.remove(entity.mesh);
    entity.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.entities.splice(idx, 1);
  }

  /** Get positions of all active wildlife for minimap rendering */
  getWildlifePositions(): { x: number; z: number; type: string }[] {
    return this.entities.map(e => ({
      x: e.mesh.position.x,
      z: e.mesh.position.z,
      type: e.type,
    }));
  }

  private updateEntity(e: WildlifeEntity, dt: number): void {
    const t = this.time;

    // Move forward
    e.mesh.position.x += Math.sin(e.heading) * e.speed * dt;
    e.mesh.position.z += Math.cos(e.heading) * e.speed * dt;

    // Get wave height at position
    const waveY = this.ocean.getWaveHeight(e.mesh.position.x, e.mesh.position.z, t);

    switch (e.type) {
      case 'dolphin': {
        // Dolphins: sinusoidal jumping arc, slight heading weave
        const jumpCycle = Math.sin(t * 2.5 + e.phase);
        // Derivative of jump cycle for pitch — positive = rising, negative = falling
        const jumpDerivative = Math.cos(t * 2.5 + e.phase);
        const jumpHeight = Math.max(0, jumpCycle) * 1.8; // only above water
        e.mesh.position.y = waveY + jumpHeight;
        // Pitch follows the derivative: nose up when rising, nose down when falling
        e.mesh.rotation.x = jumpDerivative * 0.35;
        // Gentle heading weave — reduced amplitude to prevent zigzag appearance
        e.heading += Math.sin(t * 0.5 + e.phase) * 0.12 * dt;
        e.mesh.rotation.y = e.heading;
        // Only show during rising/airborne part of jump (hide early on descent to avoid backward look)
        e.mesh.visible = jumpCycle > -0.1 && e.mesh.position.y > waveY - 0.15;
        break;
      }
      case 'whale': {
        // Whales: slow surfacing cycle — mostly underwater, occasionally surfaces
        const breathCycle = Math.sin(t * 0.4 + e.phase);
        const surfaceOffset = breathCycle > 0.3
          ? (breathCycle - 0.3) * 2.0  // surface
          : -2.0;  // underwater
        e.mesh.position.y = waveY + surfaceOffset;
        e.mesh.rotation.x = breathCycle > 0.3 ? (breathCycle - 0.3) * 0.15 : 0;
        // Very gentle heading drift
        e.heading += Math.sin(t * 0.2 + e.phase) * 0.1 * dt;
        e.mesh.rotation.y = e.heading;
        e.mesh.visible = surfaceOffset > -1.5;
        break;
      }
      case 'fishing_boat': {
        // Fishing boats: sit on waves, gentle rock
        e.mesh.position.y = waveY + 0.3;
        e.mesh.rotation.x = Math.sin(t * 1.2 + e.phase) * 0.05;
        e.mesh.rotation.z = Math.sin(t * 0.8 + e.phase * 1.3) * 0.06;
        // Slow drift, occasional heading change
        e.heading += Math.sin(t * 0.15 + e.phase) * 0.15 * dt;
        e.mesh.rotation.y = e.heading;
        break;
      }
      case 'cargo_ship': {
        // Cargo ships: steady heading, ride waves, slight roll
        e.mesh.position.y = waveY + 0.8;
        e.mesh.rotation.x = Math.sin(t * 0.6 + e.phase) * 0.02;
        e.mesh.rotation.z = Math.sin(t * 0.4 + e.phase) * 0.03;
        e.mesh.rotation.y = e.heading;
        break;
      }
    }
  }
}
