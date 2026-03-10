import * as THREE from 'three';

/**
 * Drifting cloud layer using instanced soft billboards.
 * Clouds spawn in a large disc around the camera and drift with the wind.
 */
export class Clouds {
  private mesh: THREE.InstancedMesh;
  private count: number;
  private positions: Float32Array;
  private scales: Float32Array;
  private speeds: Float32Array;
  private dummy = new THREE.Object3D();
  private radius = 2000;

  constructor(scene: THREE.Scene, count = 80) {
    this.count = count;

    // Soft cloud shape — flattened sphere
    const geometry = new THREE.SphereGeometry(1, 8, 5);
    geometry.scale(1, 0.3, 1);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Initialize cloud positions
    this.positions = new Float32Array(count * 3);
    this.scales = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 200 + Math.random() * this.radius;
      this.positions[i * 3] = Math.cos(angle) * dist;
      this.positions[i * 3 + 1] = 80 + Math.random() * 120; // altitude 80-200
      this.positions[i * 3 + 2] = Math.sin(angle) * dist;

      // Vary cloud size — some wispy, some puffy
      const baseScale = 30 + Math.random() * 80;
      this.scales[i * 3] = baseScale * (0.8 + Math.random() * 0.4);
      this.scales[i * 3 + 1] = baseScale * (0.3 + Math.random() * 0.3);
      this.scales[i * 3 + 2] = baseScale * (0.6 + Math.random() * 0.4);

      this.speeds[i] = 2 + Math.random() * 4; // drift speed
    }

    this.updateMatrices(new THREE.Vector3());
  }

  private updateMatrices(cameraPos: THREE.Vector3): void {
    for (let i = 0; i < this.count; i++) {
      this.dummy.position.set(
        this.positions[i * 3] + cameraPos.x,
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2] + cameraPos.z
      );
      this.dummy.scale.set(
        this.scales[i * 3],
        this.scales[i * 3 + 1],
        this.scales[i * 3 + 2]
      );
      this.dummy.rotation.y = i * 1.3; // slight rotation variety
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, cameraPos: THREE.Vector3, sunElevation: number): void {
    // Drift clouds
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] += this.speeds[i] * dt;

      // Wrap around when too far from origin
      if (this.positions[i * 3] > this.radius) {
        this.positions[i * 3] = -this.radius;
      }
    }

    this.updateMatrices(cameraPos);

    // Tint clouds based on time of day
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (sunElevation > 0.1) {
      mat.color.setRGB(1, 1, 1);
      mat.opacity = 0.55;
    } else if (sunElevation > 0) {
      // Sunset — warm golden/pink tint
      const t = sunElevation / 0.1;
      mat.color.setRGB(1, THREE.MathUtils.lerp(0.7, 1, t), THREE.MathUtils.lerp(0.5, 1, t));
      mat.opacity = 0.6;
    } else {
      // Night — dark grey, subtle
      mat.color.setRGB(0.15, 0.15, 0.2);
      mat.opacity = 0.3;
    }
  }
}
