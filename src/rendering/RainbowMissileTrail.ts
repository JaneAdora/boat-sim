import * as THREE from 'three';

/**
 * Rainbow missile trail for Magical Mode.
 * Replaces the inline gray THREE.Line trail with a full-path rainbow shader line.
 * 500-point buffer covers entire missile flight (no 100-point cap).
 */
export class RainbowMissileTrail {
  private line: THREE.Line;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private positions: Float32Array;
  private vertexIndices: Float32Array;
  private pointCount = 0;
  private readonly maxPoints = 500;

  // Orphan lifecycle
  private frozen = false;
  private orphanAge = 0;
  private readonly orphanMaxAge = 10.0;
  private readonly fadeStart = 8.0;
  private elapsedTime = 0;

  constructor(scene: THREE.Scene, startPosition: THREE.Vector3) {
    this.positions = new Float32Array(this.maxPoints * 3);
    this.vertexIndices = new Float32Array(this.maxPoints);
    this.positions[0] = startPosition.x;
    this.positions[1] = startPosition.y;
    this.positions[2] = startPosition.z;
    this.vertexIndices[0] = 0;
    this.pointCount = 1;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aIndex', new THREE.BufferAttribute(this.vertexIndices, 1));
    this.geometry.setDrawRange(0, 1);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTotalPoints: { value: 1 },
        uTime: { value: 0 },
        uGlobalAlpha: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTotalPoints;
        uniform float uTime;
        attribute float aIndex;
        varying float vTrailT;

        void main() {
          vTrailT = aIndex / max(uTotalPoints - 1.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uGlobalAlpha;
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
          float hue = fract(vTrailT * 2.0 + uTime * 0.2);
          vec3 color = hsl2rgb(hue, 0.9, 0.6);
          gl_FragColor = vec4(color, 0.7 * uGlobalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.line = new THREE.Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  addPoint(position: THREE.Vector3): void {
    if (this.frozen || this.pointCount >= this.maxPoints) return;

    const i = this.pointCount;
    this.positions[i * 3] = position.x;
    this.positions[i * 3 + 1] = position.y;
    this.positions[i * 3 + 2] = position.z;
    this.vertexIndices[i] = i;
    this.pointCount++;

    this.geometry.setDrawRange(0, this.pointCount);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aIndex as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uTotalPoints.value = this.pointCount;
  }

  updateTime(dt: number): void {
    this.elapsedTime += dt;
    this.material.uniforms.uTime.value = this.elapsedTime;
  }

  /** Stop accepting new points, begin 10s orphan countdown. */
  freeze(): void {
    this.frozen = true;
    this.orphanAge = 0;
  }

  /** Update orphaned trail. Returns true when expired and ready for disposal. */
  updateOrphaned(dt: number): boolean {
    this.orphanAge += dt;
    this.elapsedTime += dt;
    this.material.uniforms.uTime.value = this.elapsedTime;

    if (this.orphanAge >= this.fadeStart) {
      const fadeProgress = (this.orphanAge - this.fadeStart) / (this.orphanMaxAge - this.fadeStart);
      this.material.uniforms.uGlobalAlpha.value = Math.max(0, 1 - fadeProgress);
    }

    return this.orphanAge >= this.orphanMaxAge;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.line);
    this.geometry.dispose();
    this.material.dispose();
  }
}
