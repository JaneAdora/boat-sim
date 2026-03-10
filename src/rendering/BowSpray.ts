import * as THREE from 'three';

/**
 * Bow spray particle effect — when the boat moves fast, spray kicks up
 * from both sides of the bow. Uses THREE.Points with custom shaders
 * for billboarded, soft-circle particles with additive blending.
 */

const MAX_PARTICLES = 100; // 50 per side
const PARTICLES_PER_SIDE = 50;
const SPEED_MIN = 3.0;   // no spray below this
const SPEED_MAX = 10.0;  // max spray at this speed
const SPAWN_RATE_MAX = 20; // particles/sec per emitter at full speed
const GRAVITY = -9.8;
const PARTICLE_LIFE_MIN = 0.6;
const PARTICLE_LIFE_MAX = 1.2;
const PARTICLE_SIZE_MIN = 0.2;
const PARTICLE_SIZE_MAX = 0.5;

// Bow offsets in local boat space (port and starboard) — at the waterline
const BOW_OFFSET_PORT = new THREE.Vector3(-0.8, -0.3, 3.0);
const BOW_OFFSET_STARBOARD = new THREE.Vector3(0.8, -0.3, 3.0);

// Spray launch directions in local space — outward and slightly up, no forward
const SPRAY_DIR_PORT = new THREE.Vector3(-0.85, 0.5, -0.15).normalize();
const SPRAY_DIR_STARBOARD = new THREE.Vector3(0.85, 0.5, -0.15).normalize();

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aMaxLife;
  attribute float aSize;

  varying float vLifeRatio;

  void main() {
    vLifeRatio = clamp(aLife / aMaxLife, 0.0, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Size attenuation: scale down with distance, fade with life
    float fadeIn = smoothstep(0.0, 0.15, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.6, 1.0, vLifeRatio);
    float lifeFade = fadeIn * fadeOut;

    gl_PointSize = aSize * lifeFade * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLifeRatio;

  void main() {
    // Soft circle via radial falloff
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center) * 2.0;
    float circle = 1.0 - smoothstep(0.4, 1.0, dist);

    if (circle < 0.01) discard;

    // Fade: ramp in quickly, then fade out
    float fadeIn = smoothstep(0.0, 0.15, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.5, 1.0, vLifeRatio);
    float alpha = fadeIn * fadeOut * circle * 0.6;

    // White-blue tint: starts white, shifts slightly blue as it ages
    vec3 color = mix(vec3(0.95, 0.97, 1.0), vec3(0.7, 0.85, 1.0), vLifeRatio * 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;

export class BowSpray {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private particles: Particle[];

  // Buffer arrays
  private positionArray: Float32Array;
  private lifeArray: Float32Array;
  private maxLifeArray: Float32Array;
  private sizeArray: Float32Array;

  // Spawn accumulators (one per side)
  private spawnAccPort = 0;
  private spawnAccStarboard = 0;

  // Reusable temp vectors to avoid allocations in update
  private _tempVec = new THREE.Vector3();
  private _tempDir = new THREE.Vector3();
  private _worldOffset = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        life: 0,
        maxLife: 1,
        px: 0, py: -1000, pz: 0,
        vx: 0, vy: 0, vz: 0,
        size: 0.5,
      });
    }

    this.positionArray = new Float32Array(MAX_PARTICLES * 3);
    this.lifeArray = new Float32Array(MAX_PARTICLES);
    this.maxLifeArray = new Float32Array(MAX_PARTICLES);
    this.sizeArray = new Float32Array(MAX_PARTICLES);

    // Initialize positions far below so dead particles are invisible
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positionArray[i * 3 + 1] = -1000;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifeArray, 1));
    this.geometry.setAttribute('aMaxLife', new THREE.BufferAttribute(this.maxLifeArray, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArray, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt: number, boatPos: THREE.Vector3, boatQuaternion: THREE.Quaternion, speed: number): void {
    // Compute spray intensity (0 to 1)
    const intensity = THREE.MathUtils.clamp(
      (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN),
      0,
      1
    );

    // Spawn new particles if moving fast enough
    if (intensity > 0) {
      const spawnRate = SPAWN_RATE_MAX * intensity;

      this.spawnAccPort += spawnRate * dt;
      this.spawnAccStarboard += spawnRate * dt;

      // Spawn port-side particles
      while (this.spawnAccPort >= 1) {
        this.spawnAccPort -= 1;
        this.emitParticle(boatPos, boatQuaternion, speed, intensity, BOW_OFFSET_PORT, SPRAY_DIR_PORT, 0, PARTICLES_PER_SIDE);
      }

      // Spawn starboard-side particles
      while (this.spawnAccStarboard >= 1) {
        this.spawnAccStarboard -= 1;
        this.emitParticle(boatPos, boatQuaternion, speed, intensity, BOW_OFFSET_STARBOARD, SPRAY_DIR_STARBOARD, PARTICLES_PER_SIDE, MAX_PARTICLES);
      }
    } else {
      this.spawnAccPort = 0;
      this.spawnAccStarboard = 0;
    }

    // Update all particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        // Hide dead particle
        this.positionArray[i * 3 + 1] = -1000;
        this.lifeArray[i] = 0;
        continue;
      }

      // Physics: gravity + velocity integration
      p.vy += GRAVITY * dt;
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;

      // Write to buffers
      this.positionArray[i * 3] = p.px;
      this.positionArray[i * 3 + 1] = p.py;
      this.positionArray[i * 3 + 2] = p.pz;
      this.lifeArray[i] = p.life;
      this.maxLifeArray[i] = p.maxLife;
      this.sizeArray[i] = p.size;
    }

    // Flag buffers for upload
    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aMaxLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Emit one particle on the given side of the bow.
   */
  private emitParticle(
    boatPos: THREE.Vector3,
    boatQuat: THREE.Quaternion,
    speed: number,
    intensity: number,
    localOffset: THREE.Vector3,
    localDir: THREE.Vector3,
    slotStart: number,
    slotEnd: number,
  ): void {
    // Find a dead particle slot in the designated range
    let slot = -1;
    for (let i = slotStart; i < slotEnd; i++) {
      if (!this.particles[i].alive) {
        slot = i;
        break;
      }
    }
    if (slot === -1) return; // all slots full

    const p = this.particles[slot];

    // Compute world-space spawn position
    this._worldOffset.copy(localOffset);
    // Add slight random jitter to offset for visual variety
    this._worldOffset.x += (Math.random() - 0.5) * 0.4;
    this._worldOffset.z += (Math.random() - 0.5) * 0.3;
    this._worldOffset.applyQuaternion(boatQuat);

    p.px = boatPos.x + this._worldOffset.x;
    p.py = boatPos.y + this._worldOffset.y;
    p.pz = boatPos.z + this._worldOffset.z;

    // Compute world-space spray direction
    this._tempDir.copy(localDir);
    // Add randomness to spray direction for natural look
    this._tempDir.x += (Math.random() - 0.5) * 0.3;
    this._tempDir.y += Math.random() * 0.2;
    this._tempDir.z += (Math.random() - 0.5) * 0.2;
    this._tempDir.normalize();
    this._tempDir.applyQuaternion(boatQuat);

    // Launch speed scales with boat speed
    const launchSpeed = (2.0 + speed * 0.4) * intensity;

    p.vx = this._tempDir.x * launchSpeed;
    p.vy = this._tempDir.y * launchSpeed;
    p.vz = this._tempDir.z * launchSpeed;

    // Add a small component of boat's forward velocity so spray
    // doesn't clip through the hull at high speeds
    const forward = this._tempVec.set(0, 0, 1).applyQuaternion(boatQuat);
    p.vx += forward.x * speed * 0.1;
    p.vz += forward.z * speed * 0.1;

    // Add slight wind drift (random small lateral push)
    p.vx += (Math.random() - 0.5) * 0.5;
    p.vz += (Math.random() - 0.5) * 0.5;

    // Particle properties
    p.life = 0;
    p.maxLife = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN);
    p.size = PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN);
    p.alive = true;

    // Write initial values to buffers
    this.positionArray[slot * 3] = p.px;
    this.positionArray[slot * 3 + 1] = p.py;
    this.positionArray[slot * 3 + 2] = p.pz;
    this.lifeArray[slot] = 0;
    this.maxLifeArray[slot] = p.maxLife;
    this.sizeArray[slot] = p.size;
  }
}
