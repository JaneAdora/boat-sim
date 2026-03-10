import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { ChunkManager } from '../world/ChunkManager';

interface Seagull {
  mesh: THREE.Group;
  centerX: number;
  centerZ: number;
  orbitRadius: number;
  orbitSpeed: number;
  height: number;
  angle: number;
  wingPhase: number;
  wingSpeed: number;
}

/**
 * Seagulls circling near islands. Simple white bird shapes
 * with flapping wing animation.
 */
export class SeagullSystem extends System {
  private scene: THREE.Scene;
  private chunkManager: ChunkManager;
  private boatEntity: number;
  private seagulls: Seagull[] = [];
  private maxGulls = 30;
  private spawnTimer = 0;

  // Shared geometry
  private bodyGeom: THREE.BufferGeometry;
  private wingGeom: THREE.BufferGeometry;
  private birdMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, chunkManager: ChunkManager, boatEntity: number) {
    super(65);
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.boatEntity = boatEntity;

    // Body — small white ellipsoid
    this.bodyGeom = new THREE.SphereGeometry(0.15, 4, 3);
    this.bodyGeom.scale(1, 0.5, 2);

    // Wing — flat triangle
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(0.8, 0.1);
    wingShape.lineTo(0.6, -0.05);
    wingShape.closePath();
    this.wingGeom = new THREE.ShapeGeometry(wingShape);

    this.birdMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      roughness: 0.8,
      metalness: 0.0,
    });
  }

  private createBirdMesh(): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(this.bodyGeom, this.birdMat);
    group.add(body);

    // Left wing
    const leftWing = new THREE.Mesh(this.wingGeom, this.birdMat);
    leftWing.position.set(0.1, 0, 0);
    leftWing.name = 'leftWing';
    group.add(leftWing);

    // Right wing (mirrored)
    const rightWing = new THREE.Mesh(this.wingGeom, this.birdMat);
    rightWing.position.set(-0.1, 0, 0);
    rightWing.scale.x = -1;
    rightWing.name = 'rightWing';
    group.add(rightWing);

    return group;
  }

  update(world: World, dt: number): void {
    const boatT = world.getComponent<Transform>(this.boatEntity, 'Transform');
    if (!boatT) return;

    const bx = boatT.position.x;
    const bz = boatT.position.z;

    // Spawn gulls near islands
    this.spawnTimer += dt;
    if (this.spawnTimer > 1.0 && this.seagulls.length < this.maxGulls) {
      this.spawnTimer = 0;
      const islands = this.chunkManager.getIslandPositions();
      for (const isl of islands) {
        const dx = isl.x - bx;
        const dz = isl.z - bz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 300 && dist > 20) {
          // Check if already have gulls near this island
          const nearCount = this.seagulls.filter(g =>
            Math.abs(g.centerX - isl.x) < 50 && Math.abs(g.centerZ - isl.z) < 50
          ).length;
          if (nearCount >= 5) continue;

          const mesh = this.createBirdMesh();
          this.scene.add(mesh);
          this.seagulls.push({
            mesh,
            centerX: isl.x,
            centerZ: isl.z,
            orbitRadius: 15 + Math.random() * 30,
            orbitSpeed: 0.3 + Math.random() * 0.4,
            height: 15 + Math.random() * 25,
            angle: Math.random() * Math.PI * 2,
            wingPhase: Math.random() * Math.PI * 2,
            wingSpeed: 4 + Math.random() * 3,
          });
        }
      }
    }

    // Update and cull
    for (let i = this.seagulls.length - 1; i >= 0; i--) {
      const g = this.seagulls[i];

      // Orbit
      g.angle += g.orbitSpeed * dt;
      const x = g.centerX + Math.cos(g.angle) * g.orbitRadius;
      const z = g.centerZ + Math.sin(g.angle) * g.orbitRadius;
      const bobY = Math.sin(g.angle * 2) * 1.5;

      g.mesh.position.set(x, g.height + bobY, z);
      g.mesh.rotation.y = -g.angle + Math.PI / 2; // face flight direction

      // Wing flap
      g.wingPhase += g.wingSpeed * dt;
      const wingAngle = Math.sin(g.wingPhase) * 0.4;
      const leftWing = g.mesh.getObjectByName('leftWing');
      const rightWing = g.mesh.getObjectByName('rightWing');
      if (leftWing) leftWing.rotation.z = wingAngle;
      if (rightWing) rightWing.rotation.z = -wingAngle;

      // Despawn if too far
      const dx = x - bx;
      const dz = z - bz;
      if (dx * dx + dz * dz > 400 * 400) {
        this.scene.remove(g.mesh);
        this.seagulls.splice(i, 1);
      }
    }
  }
}
