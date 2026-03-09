import * as THREE from 'three';

/**
 * Renders a foam wake trail behind the boat using a fading ribbon mesh.
 */
export class WakeTrail {
  mesh: THREE.Mesh;
  private maxPoints = 80;
  private points: THREE.Vector3[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private addTimer = 0;
  private addInterval = 0.08; // seconds between wake points

  constructor(scene: THREE.Scene) {
    const maxVerts = this.maxPoints * 2; // two vertices per point (port/starboard)
    this.positions = new Float32Array(maxVerts * 3);
    this.alphas = new Float32Array(maxVerts);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    // Build index buffer for triangle strip
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
          gl_FragColor = vec4(0.85, 0.9, 0.95, vAlpha * 0.4);
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

  update(boatPosition: THREE.Vector3, boatQuaternion: THREE.Quaternion, speed: number, dt: number): void {
    this.addTimer += dt;

    if (this.addTimer >= this.addInterval && speed > 0.3) {
      this.addTimer = 0;

      // Add new point at boat stern
      const sternOffset = new THREE.Vector3(0, 0.05, -4);
      sternOffset.applyQuaternion(boatQuaternion);
      const sternPos = boatPosition.clone().add(sternOffset);

      this.points.unshift(sternPos);
      if (this.points.length > this.maxPoints) {
        this.points.pop();
      }
    }

    // Update geometry
    const right = new THREE.Vector3();
    const count = this.points.length;

    for (let i = 0; i < this.maxPoints; i++) {
      const idx = i * 2;

      if (i < count) {
        const point = this.points[i];
        const fade = 1 - i / count;

        // Width grows then fades
        const widthCurve = Math.sin(Math.min(i / 5, 1) * Math.PI / 2); // ramp up
        const width = widthCurve * fade * 1.5 * Math.min(speed * 0.3, 1.5);

        // Direction perpendicular to trail
        if (i < count - 1) {
          const next = this.points[Math.min(i + 1, count - 1)];
          const dir = new THREE.Vector3().subVectors(point, next).normalize();
          right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        }

        // Port vertex
        this.positions[idx * 3] = point.x - right.x * width;
        this.positions[idx * 3 + 1] = point.y;
        this.positions[idx * 3 + 2] = point.z - right.z * width;
        this.alphas[idx] = fade;

        // Starboard vertex
        this.positions[(idx + 1) * 3] = point.x + right.x * width;
        this.positions[(idx + 1) * 3 + 1] = point.y;
        this.positions[(idx + 1) * 3 + 2] = point.z + right.z * width;
        this.alphas[idx + 1] = fade;
      } else {
        // Zero out unused vertices
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
}
