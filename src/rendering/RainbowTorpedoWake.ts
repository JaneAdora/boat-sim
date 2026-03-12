import * as THREE from 'three';

/**
 * Rainbow-colored torpedo wake for Magical Mode.
 * Same ribbon geometry as TorpedoWake but with HSL-cycling fragment shader.
 * Supports freeze/orphan lifecycle for 10s persist after torpedo impact.
 */
export class RainbowTorpedoWake {
  private mesh: THREE.Mesh;
  private maxPoints = 30;
  private points: THREE.Vector3[] = [];
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private trailTs: Float32Array;
  private addTimer = 0;
  private addInterval = 0.06;
  private material: THREE.ShaderMaterial;

  // Orphan lifecycle
  private frozen = false;
  private orphanAge = 0;
  private readonly orphanMaxAge = 10.0;
  private readonly fadeStart = 8.0;
  private elapsedTime = 0;

  constructor(scene: THREE.Scene) {
    const maxVerts = this.maxPoints * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.alphas = new Float32Array(maxVerts);
    this.trailTs = new Float32Array(maxVerts);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('trailT', new THREE.BufferAttribute(this.trailTs, 1));

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

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGlobalAlpha: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float trailT;
        varying float vAlpha;
        varying float vTrailT;
        void main() {
          vAlpha = alpha;
          vTrailT = trailT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uGlobalAlpha;
        varying float vAlpha;
        varying float vTrailT;

        vec3 hsl2rgb(float h, float s, float l) {
          float c = (1.0 - abs(2.0 * l - 1.0)) * s;
          float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
          float m = l - c * 0.5;
          vec3 rgb;
          float hh = h * 6.0;
          if (hh < 1.0) rgb = vec3(c, x, 0.0);
          else if (hh < 2.0) rgb = vec3(x, c, 0.0);
          else if (hh < 3.0) rgb = vec3(0.0, c, x);
          else if (hh < 4.0) rgb = vec3(0.0, x, c);
          else if (hh < 5.0) rgb = vec3(x, 0.0, c);
          else rgb = vec3(c, 0.0, x);
          return rgb + m;
        }

        void main() {
          float hue = fract(vTrailT * 1.5 + uTime * 0.3);
          vec3 color = hsl2rgb(hue, 0.85, 0.6);
          float a = vAlpha * 0.65 * uGlobalAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(color, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(position: THREE.Vector3, heading: number, speed: number, dt: number): void {
    if (this.frozen) return;

    this.elapsedTime += dt;
    this.material.uniforms.uTime.value = this.elapsedTime;

    this.addTimer += dt;

    if (this.addTimer >= this.addInterval && speed > 0.3) {
      this.addTimer = 0;
      this.points.unshift(position.clone());
      if (this.points.length > this.maxPoints) {
        this.points.pop();
      }
    }

    this.rebuildGeometry();
  }

  /** Stop accepting new points, begin 10s orphan countdown. */
  freeze(): void {
    this.frozen = true;
    this.orphanAge = 0;
  }

  /** Update orphaned wake. Returns true when expired and ready for disposal. */
  updateOrphaned(dt: number): boolean {
    this.orphanAge += dt;
    this.elapsedTime += dt;
    this.material.uniforms.uTime.value = this.elapsedTime;

    // Fade out during last 2 seconds
    if (this.orphanAge >= this.fadeStart) {
      const fadeProgress = (this.orphanAge - this.fadeStart) / (this.orphanMaxAge - this.fadeStart);
      this.material.uniforms.uGlobalAlpha.value = Math.max(0, 1 - fadeProgress);
    }

    return this.orphanAge >= this.orphanMaxAge;
  }

  private rebuildGeometry(): void {
    const right = new THREE.Vector3();
    const count = this.points.length;

    for (let i = 0; i < this.maxPoints; i++) {
      const idx = i * 2;

      if (i < count) {
        const point = this.points[i];
        const fade = 1 - i / count;
        const t = count > 1 ? i / (count - 1) : 0;
        const widthCurve = Math.sin(Math.min(i / 3, 1) * Math.PI / 2);
        const width = widthCurve * fade * 0.5;

        if (i < count - 1) {
          const next = this.points[Math.min(i + 1, count - 1)];
          const dir = new THREE.Vector3().subVectors(point, next).normalize();
          right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        }

        this.positions[idx * 3] = point.x - right.x * width;
        this.positions[idx * 3 + 1] = point.y;
        this.positions[idx * 3 + 2] = point.z - right.z * width;
        this.alphas[idx] = fade;
        this.trailTs[idx] = t;

        this.positions[(idx + 1) * 3] = point.x + right.x * width;
        this.positions[(idx + 1) * 3 + 1] = point.y;
        this.positions[(idx + 1) * 3 + 2] = point.z + right.z * width;
        this.alphas[idx + 1] = fade;
        this.trailTs[idx + 1] = t;
      } else {
        this.positions[idx * 3] = 0;
        this.positions[idx * 3 + 1] = -100;
        this.positions[idx * 3 + 2] = 0;
        this.alphas[idx] = 0;
        this.trailTs[idx] = 0;
        this.positions[(idx + 1) * 3] = 0;
        this.positions[(idx + 1) * 3 + 1] = -100;
        this.positions[(idx + 1) * 3 + 2] = 0;
        this.alphas[idx + 1] = 0;
        this.trailTs[idx + 1] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    (this.geometry.attributes.trailT as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
