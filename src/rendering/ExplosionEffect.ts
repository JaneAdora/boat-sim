import * as THREE from 'three';

/**
 * Pool-based explosion + fire particle system.
 * Shared across all active explosions (torpedoes & missiles).
 */

const MAX_PARTICLES = 2000;
const MAX_EXPLOSIONS = 5;
const GRAVITY = -3.0;
const EMBER_BUOYANCY = 1.5;
const VELOCITY_DAMPING = 0.97;

// Burst config (base values — scaled by explosion scale parameter)
const BURST_COUNT_MIN = 120;
const BURST_COUNT_MAX = 180;
const BURST_SPEED_MIN = 10;
const BURST_SPEED_MAX = 30;
const BURST_LIFE_MIN = 1.0;
const BURST_LIFE_MAX = 2.5;
const BURST_SIZE_MIN = 5.0;
const BURST_SIZE_MAX = 15.0;

// Fire ember config (base values)
const FIRE_DURATION = 4.0;
const FIRE_EMBERS_PER_FRAME = 12;
const EMBER_SPEED_MIN = 2;
const EMBER_SPEED_MAX = 6;
const EMBER_LIFE_MIN = 2.0;
const EMBER_LIFE_MAX = 5.0;
const EMBER_SIZE_MIN = 3.0;
const EMBER_SIZE_MAX = 8.0;

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  size: number;
  type: number; // 0 = fireball, 1 = ember
}

interface ActiveExplosion {
  x: number; y: number; z: number;
  age: number;
  done: boolean;
  scale: number;
}

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aMaxLife;
  attribute float aSize;
  attribute float aType;

  varying float vLifeRatio;
  varying float vType;

  void main() {
    vLifeRatio = clamp(aLife / aMaxLife, 0.0, 1.0);
    vType = aType;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    float fadeIn = smoothstep(0.0, 0.1, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.5, 1.0, vLifeRatio);
    float lifeFade = fadeIn * fadeOut;

    gl_PointSize = aSize * lifeFade * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 200.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLifeRatio;
  varying float vType;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center) * 2.0;
    float circle = 1.0 - smoothstep(0.3, 1.0, dist);

    if (circle < 0.01) discard;

    float fadeIn = smoothstep(0.0, 0.1, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.4, 1.0, vLifeRatio);
    float alpha = fadeIn * fadeOut * circle * 0.8;

    vec3 color;
    if (vType < 0.5) {
      // Fireball: white-yellow -> orange -> red
      vec3 hot = vec3(1.0, 0.95, 0.6);
      vec3 mid = vec3(1.0, 0.5, 0.1);
      vec3 cool = vec3(0.8, 0.15, 0.0);
      color = vLifeRatio < 0.4
        ? mix(hot, mid, vLifeRatio / 0.4)
        : mix(mid, cool, (vLifeRatio - 0.4) / 0.6);
    } else {
      // Fire ember: orange-red, slower fade
      color = mix(vec3(1.0, 0.6, 0.1), vec3(0.5, 0.1, 0.0), vLifeRatio);
      alpha *= 0.7;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

export class ExplosionEffect {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private particles: Particle[];
  private explosions: ActiveExplosion[] = [];

  private positionArray: Float32Array;
  private lifeArray: Float32Array;
  private maxLifeArray: Float32Array;
  private sizeArray: Float32Array;
  private typeArray: Float32Array;

  constructor(scene: THREE.Scene) {
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false, life: 0, maxLife: 1,
        px: 0, py: -1000, pz: 0,
        vx: 0, vy: 0, vz: 0,
        size: 1, type: 0,
      });
    }

    this.positionArray = new Float32Array(MAX_PARTICLES * 3);
    this.lifeArray = new Float32Array(MAX_PARTICLES);
    this.maxLifeArray = new Float32Array(MAX_PARTICLES);
    this.sizeArray = new Float32Array(MAX_PARTICLES);
    this.typeArray = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positionArray[i * 3 + 1] = -1000;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifeArray, 1));
    this.geometry.setAttribute('aMaxLife', new THREE.BufferAttribute(this.maxLifeArray, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArray, 1));
    this.geometry.setAttribute('aType', new THREE.BufferAttribute(this.typeArray, 1));

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

  spawnExplosion(x: number, y: number, z: number, scale = 1.0): void {
    if (this.explosions.length >= MAX_EXPLOSIONS) return;

    // Speed scales gently (sqrt), size/count/spread scale fully
    const spdScale = Math.sqrt(scale);

    const count = Math.floor((BURST_COUNT_MIN + Math.random() * (BURST_COUNT_MAX - BURST_COUNT_MIN)) * scale);
    for (let i = 0; i < count; i++) {
      const slot = this.findDeadSlot();
      if (slot === -1) break;

      const p = this.particles[slot];
      p.alive = true;
      p.life = 0;
      p.maxLife = (BURST_LIFE_MIN + Math.random() * (BURST_LIFE_MAX - BURST_LIFE_MIN)) * spdScale;
      p.size = (BURST_SIZE_MIN + Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN)) * scale;
      p.type = 0;
      p.px = x + (Math.random() - 0.5) * 5.0 * scale;
      p.py = y + Math.random() * 3.0 * spdScale;
      p.pz = z + (Math.random() - 0.5) * 5.0 * scale;

      const speed = (BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN)) * spdScale;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.6;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.cos(phi) * speed + 8.0 * spdScale;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;

      this.writeSlot(slot);
    }

    this.explosions.push({ x, y, z, age: 0, done: false, scale });
  }

  update(dt: number): void {
    // Emit fire embers from active explosions
    for (const exp of this.explosions) {
      exp.age += dt;
      if (exp.age > FIRE_DURATION * Math.sqrt(exp.scale)) {
        exp.done = true;
        continue;
      }

      const s = exp.scale;
      const ss = Math.sqrt(s);
      const emberCount = Math.floor(FIRE_EMBERS_PER_FRAME * s);
      for (let i = 0; i < emberCount; i++) {
        const slot = this.findDeadSlot();
        if (slot === -1) break;

        const p = this.particles[slot];
        p.alive = true;
        p.life = 0;
        p.maxLife = (EMBER_LIFE_MIN + Math.random() * (EMBER_LIFE_MAX - EMBER_LIFE_MIN)) * ss;
        p.size = (EMBER_SIZE_MIN + Math.random() * (EMBER_SIZE_MAX - EMBER_SIZE_MIN)) * s;
        p.type = 1;
        p.px = exp.x + (Math.random() - 0.5) * 10.0 * s;
        p.py = exp.y + Math.random() * 5.0 * ss;
        p.pz = exp.z + (Math.random() - 0.5) * 10.0 * s;

        const speed = (EMBER_SPEED_MIN + Math.random() * (EMBER_SPEED_MAX - EMBER_SPEED_MIN)) * ss;
        p.vx = (Math.random() - 0.5) * speed;
        p.vy = Math.random() * speed + 0.5 * ss;
        p.vz = (Math.random() - 0.5) * speed;

        this.writeSlot(slot);
      }
    }

    // Remove finished explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      if (this.explosions[i].done) {
        this.explosions.splice(i, 1);
      }
    }

    // Update all particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.positionArray[i * 3 + 1] = -1000;
        this.lifeArray[i] = 0;
        continue;
      }

      // Physics
      const buoyancy = p.type === 1 ? EMBER_BUOYANCY : 0;
      p.vy += (GRAVITY + buoyancy) * dt;
      p.vx *= VELOCITY_DAMPING;
      p.vy *= VELOCITY_DAMPING;
      p.vz *= VELOCITY_DAMPING;
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;

      this.positionArray[i * 3] = p.px;
      this.positionArray[i * 3 + 1] = p.py;
      this.positionArray[i * 3 + 2] = p.pz;
      this.lifeArray[i] = p.life;
      this.maxLifeArray[i] = p.maxLife;
      this.sizeArray[i] = p.size;
      this.typeArray[i] = p.type;
    }

    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aMaxLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aType as THREE.BufferAttribute).needsUpdate = true;
  }

  private findDeadSlot(): number {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].alive) return i;
    }
    return -1;
  }

  private writeSlot(i: number): void {
    const p = this.particles[i];
    this.positionArray[i * 3] = p.px;
    this.positionArray[i * 3 + 1] = p.py;
    this.positionArray[i * 3 + 2] = p.pz;
    this.lifeArray[i] = p.life;
    this.maxLifeArray[i] = p.maxLife;
    this.sizeArray[i] = p.size;
    this.typeArray[i] = p.type;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
