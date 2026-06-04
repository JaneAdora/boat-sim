import * as THREE from 'three';

/**
 * Lightweight wake trail for torpedoes — simplified WakeTrail with fewer
 * points and narrower ribbon.
 */
// Module-level scratch vectors — reused each frame to avoid per-point allocation.
const _UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class TorpedoWake {
  private mesh: THREE.Mesh;
  private maxPoints = 30;
  private points: THREE.Vector3[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private addTimer = 0;
  private addInterval = 0.06;

  constructor(scene: THREE.Scene) {
    const maxVerts = this.maxPoints * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.alphas = new Float32Array(maxVerts);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    const indices: number[] = [];
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c);
      indices.push(c, b, d);
    }
    this.geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.85, 0.9, 0.95, vAlpha * 0.35);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(position: THREE.Vector3, heading: number, speed: number, dt: number): void {
    this.addTimer += dt;

    if (this.addTimer >= this.addInterval && speed > 0.3) {
      this.addTimer = 0;
      // Add point at torpedo's current position (wake trails behind)
      this.points.unshift(position.clone());
      if (this.points.length > this.maxPoints) {
        this.points.pop();
      }
    }

    const right = new THREE.Vector3();
    const count = this.points.length;

    for (let i = 0; i < this.maxPoints; i++) {
      const idx = i * 2;

      if (i < count) {
        const point = this.points[i];
        const fade = 1 - i / count;
        const widthCurve = Math.sin(Math.min(i / 3, 1) * Math.PI / 2);
        const width = widthCurve * fade * 0.4;

        if (i < count - 1) {
          const next = this.points[Math.min(i + 1, count - 1)];
          _dir.subVectors(point, next).normalize();
          right.crossVectors(_dir, _UP).normalize();
        }

        this.positions[idx * 3] = point.x - right.x * width;
        this.positions[idx * 3 + 1] = point.y;
        this.positions[idx * 3 + 2] = point.z - right.z * width;
        this.alphas[idx] = fade;

        this.positions[(idx + 1) * 3] = point.x + right.x * width;
        this.positions[(idx + 1) * 3 + 1] = point.y;
        this.positions[(idx + 1) * 3 + 2] = point.z + right.z * width;
        this.alphas[idx + 1] = fade;
      } else {
        this.positions[idx * 3] = 0;
        this.positions[idx * 3 + 1] = -100;
        this.positions[idx * 3 + 2] = 0;
        this.alphas[idx] = 0;
        this.positions[(idx + 1) * 3] = 0;
        this.positions[(idx + 1) * 3 + 1] = -100;
        this.positions[(idx + 1) * 3 + 2] = 0;
        this.alphas[idx + 1] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
