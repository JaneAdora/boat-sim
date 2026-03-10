import * as THREE from 'three';

/**
 * Bioluminescent particles that glow in the water at night.
 * Particles spawn near the boat and drift outward, with concentration
 * in the wake area when the boat is moving. Each particle pulses gently.
 */
export class Bioluminescence {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private count = 300;
  private positions: Float32Array;
  private ages: Float32Array;
  private lifetimes: Float32Array;
  private phases: Float32Array;
  private velocities: Float32Array;

  private currentVisibility = 0;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.count * 3);
    this.ages = new Float32Array(this.count);
    this.lifetimes = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);
    this.velocities = new Float32Array(this.count * 3);

    // Initialize all particles as expired so they respawn immediately
    for (let i = 0; i < this.count; i++) {
      this.ages[i] = 999;
      this.lifetimes[i] = 3 + Math.random() * 2; // 3-5 seconds
      this.phases[i] = Math.random() * Math.PI * 2;
    }

    // Per-particle attributes for the shader
    const alphas = new Float32Array(this.count);
    const sizes = new Float32Array(this.count);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          // Soft circular point sprite with glow falloff
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float softness = 1.0 - smoothstep(0.0, 0.5, dist);
          float glow = softness * softness;
          vec3 color = vec3(0.1, 0.8, 0.6);
          gl_FragColor = vec4(color * glow, vAlpha * glow);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(
    dt: number,
    boatPos: THREE.Vector3,
    boatQuaternion: THREE.Quaternion,
    speed: number,
    sunElevation: number
  ): void {
    // Compute visibility based on sun elevation
    // Fade in when sun elevation < 0, full brightness when < -0.1
    let targetVisibility = 0;
    if (sunElevation < -0.1) {
      targetVisibility = 1;
    } else if (sunElevation < 0) {
      targetVisibility = (-sunElevation) / 0.1; // linear ramp 0..1
    }

    this.currentVisibility += (targetVisibility - this.currentVisibility) * Math.min(dt * 2, 1);

    this.points.visible = this.currentVisibility > 0.01;
    if (!this.points.visible) return;

    // Boat backward direction for wake spawning
    const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(boatQuaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(boatQuaternion);

    const alphaAttr = this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const sizeAttr = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;

    const time = performance.now() * 0.001;

    for (let i = 0; i < this.count; i++) {
      this.ages[i] += dt;

      // Respawn expired particles
      if (this.ages[i] >= this.lifetimes[i]) {
        this.ages[i] = 0;
        this.lifetimes[i] = 3 + Math.random() * 2;
        this.phases[i] = Math.random() * Math.PI * 2;

        // Determine spawn position
        const wakeChance = Math.min(speed * 0.15, 0.7); // more wake particles when moving faster

        if (Math.random() < wakeChance) {
          // Spawn in wake area behind the boat
          const dist = 2 + Math.random() * 12; // 2-14m behind
          const spread = (Math.random() - 0.5) * 4; // lateral spread
          this.positions[i * 3] = boatPos.x + backward.x * dist + right.x * spread;
          this.positions[i * 3 + 1] = boatPos.y - 0.2 - Math.random() * 0.5; // slightly below water
          this.positions[i * 3 + 2] = boatPos.z + backward.z * dist + right.z * spread;

          // Drift outward from wake
          this.velocities[i * 3] = (Math.random() - 0.5) * 1.0;
          this.velocities[i * 3 + 1] = -0.05 - Math.random() * 0.1;
          this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
        } else {
          // Spawn around boat in a ring
          const angle = Math.random() * Math.PI * 2;
          const dist = 2 + Math.random() * 15;
          this.positions[i * 3] = boatPos.x + Math.cos(angle) * dist;
          this.positions[i * 3 + 1] = boatPos.y - 0.3 - Math.random() * 0.5;
          this.positions[i * 3 + 2] = boatPos.z + Math.sin(angle) * dist;

          // Slow outward drift
          this.velocities[i * 3] = Math.cos(angle) * 0.3;
          this.velocities[i * 3 + 1] = -0.02 - Math.random() * 0.05;
          this.velocities[i * 3 + 2] = Math.sin(angle) * 0.3;
        }
      }

      // Move particle
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      // Age-based fade: fade in quickly, hold, then fade out
      const ageNorm = this.ages[i] / this.lifetimes[i];
      let ageFade: number;
      if (ageNorm < 0.1) {
        ageFade = ageNorm / 0.1; // fade in over first 10%
      } else if (ageNorm < 0.6) {
        ageFade = 1.0; // full brightness
      } else {
        ageFade = 1.0 - (ageNorm - 0.6) / 0.4; // fade out over last 40%
      }

      // Pulsing brightness (sine wave with unique phase per particle)
      const pulse = 0.6 + 0.4 * Math.sin(time * 2.5 + this.phases[i]);

      const alpha = ageFade * pulse * this.currentVisibility;
      alphaAttr.array[i] = Math.max(0, alpha);

      // Particle size: 2-4 range
      sizeAttr.array[i] = 2 + Math.sin(this.phases[i]) * 1;
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }
}
