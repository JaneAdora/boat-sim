import * as THREE from 'three';

/**
 * Volumetric-looking clouds built from clusters of overlapping soft spheres.
 * Each "cloud" is 3-6 puffs grouped together, giving a natural puffy shape
 * instead of a single flattened disc.
 */

const CLOUD_COUNT = 35;       // number of cloud clusters
const MAX_PUFFS_PER_CLOUD = 5;
const TOTAL_PUFFS = CLOUD_COUNT * MAX_PUFFS_PER_CLOUD;

interface CloudCluster {
  baseX: number;
  baseY: number;
  baseZ: number;
  speed: number;
  puffCount: number;
  // Per-puff local offsets and scales (relative to base)
  puffOffsets: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[];
}

export class Clouds {
  private mesh: THREE.InstancedMesh;
  private clusters: CloudCluster[];
  private dummy = new THREE.Object3D();
  private radius = 2000;

  constructor(scene: THREE.Scene) {
    // Smooth sphere geometry for each puff
    const geometry = new THREE.SphereGeometry(1, 12, 8);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, TOTAL_PUFFS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
    scene.add(this.mesh);

    // Generate cloud clusters
    this.clusters = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * this.radius;

      const cluster: CloudCluster = {
        baseX: Math.cos(angle) * dist,
        baseY: 100 + Math.random() * 100,
        baseZ: Math.sin(angle) * dist,
        speed: 1.5 + Math.random() * 3,
        puffCount: 3 + Math.floor(Math.random() * 3), // 3-5 puffs
        puffOffsets: [],
      };

      // Generate puff arrangement — a main body with smaller puffs on top and sides
      const baseScale = 20 + Math.random() * 40;
      for (let p = 0; p < cluster.puffCount; p++) {
        if (p === 0) {
          // Main body — wide and rounded (not pancake-flat)
          cluster.puffOffsets.push({
            x: 0, y: 0, z: 0,
            sx: baseScale * (1.0 + Math.random() * 0.3),
            sy: baseScale * (0.5 + Math.random() * 0.2),
            sz: baseScale * (0.7 + Math.random() * 0.3),
          });
        } else {
          // Satellite puffs — offset from center, rounder shapes
          const angle2 = Math.random() * Math.PI * 2;
          const dist2 = baseScale * (0.3 + Math.random() * 0.5);
          const puffScale = baseScale * (0.4 + Math.random() * 0.5);
          cluster.puffOffsets.push({
            x: Math.cos(angle2) * dist2,
            y: (Math.random() - 0.2) * baseScale * 0.4, // some on top, some on sides
            z: Math.sin(angle2) * dist2 * 0.7,
            sx: puffScale * (0.8 + Math.random() * 0.4),
            sy: puffScale * (0.6 + Math.random() * 0.5),
            sz: puffScale * (0.6 + Math.random() * 0.4),
          });
        }
      }

      // Pad unused puff slots
      while (cluster.puffOffsets.length < MAX_PUFFS_PER_CLOUD) {
        cluster.puffOffsets.push({ x: 0, y: -10000, z: 0, sx: 0, sy: 0, sz: 0 });
      }

      this.clusters.push(cluster);
    }

    this.updateMatrices(new THREE.Vector3());
  }

  private updateMatrices(cameraPos: THREE.Vector3): void {
    let instanceIdx = 0;

    for (const cluster of this.clusters) {
      for (let p = 0; p < MAX_PUFFS_PER_CLOUD; p++) {
        const puff = cluster.puffOffsets[p];
        this.dummy.position.set(
          cluster.baseX + puff.x + cameraPos.x,
          cluster.baseY + puff.y,
          cluster.baseZ + puff.z + cameraPos.z
        );
        this.dummy.scale.set(puff.sx, puff.sy, puff.sz);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);
        instanceIdx++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, cameraPos: THREE.Vector3, sunElevation: number): void {
    // Drift clouds
    for (const cluster of this.clusters) {
      cluster.baseX += cluster.speed * dt;

      // Wrap around
      if (cluster.baseX > this.radius) {
        cluster.baseX = -this.radius;
      }
    }

    this.updateMatrices(cameraPos);

    // Tint based on time of day
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (sunElevation > 0.1) {
      mat.color.setRGB(1, 1, 1);
      mat.opacity = 0.4;
    } else if (sunElevation > 0) {
      // Sunset — warm golden/pink underlit clouds
      const t = sunElevation / 0.1;
      mat.color.setRGB(1, THREE.MathUtils.lerp(0.65, 1, t), THREE.MathUtils.lerp(0.45, 1, t));
      mat.opacity = 0.5;
    } else {
      // Night — dark silhouettes
      mat.color.setRGB(0.12, 0.12, 0.18);
      mat.opacity = 0.25;
    }
  }
}
