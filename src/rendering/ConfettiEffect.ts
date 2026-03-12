import * as THREE from 'three';

/**
 * Rainbow confetti particle burst for Magical Mode impacts.
 * Pool-based system similar to ExplosionEffect but with HSL-colored particles,
 * lighter gravity, and no ongoing ember emission.
 */

const MAX_PARTICLES = 800;
const GRAVITY = -1.5;
const VELOCITY_DAMPING = 0.98;

const BURST_COUNT_MIN = 60;
const BURST_COUNT_MAX = 100;
const BURST_SPEED_MIN = 8;
const BURST_SPEED_MAX = 20;
const BURST_LIFE_MIN = 1.5;
const BURST_LIFE_MAX = 3.5;
const BURST_SIZE_MIN = 3.0;
const BURST_SIZE_MAX = 8.0;

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  size: number;
  hue: number;
}

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aMaxLife;
  attribute float aSize;
  attribute float aHue;

  varying float vLifeRatio;
  varying float vHue;

  void main() {
    vLifeRatio = clamp(aLife / aMaxLife, 0.0, 1.0);
    vHue = aHue;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    float fadeIn = smoothstep(0.0, 0.1, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.5, 1.0, vLifeRatio);
    float lifeFade = fadeIn * fadeOut;

    gl_PointSize = aSize * lifeFade * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 150.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLifeRatio;
  varying float vHue;

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
    // Soft square shape for confetti look
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = max(abs(center.x), abs(center.y)) * 2.0;
    float shape = 1.0 - smoothstep(0.6, 1.0, dist);

    if (shape < 0.01) discard;

    float fadeIn = smoothstep(0.0, 0.1, vLifeRatio);
    float fadeOut = 1.0 - smoothstep(0.4, 1.0, vLifeRatio);
    float alpha = fadeIn * fadeOut * shape * 0.9;

    vec3 color = hsl2rgb(vHue, 0.9, 0.65);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class ConfettiEffect {
  private scene: THREE.Scene;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private particles: Particle[];

  private positionArray: Float32Array;
  private lifeArray: Float32Array;
  private maxLifeArray: Float32Array;
  private sizeArray: Float32Array;
  private hueArray: Float32Array;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false, life: 0, maxLife: 1,
        px: 0, py: -1000, pz: 0,
        vx: 0, vy: 0, vz: 0,
        size: 1, hue: 0,
      });
    }

    this.positionArray = new Float32Array(MAX_PARTICLES * 3);
    this.lifeArray = new Float32Array(MAX_PARTICLES);
    this.maxLifeArray = new Float32Array(MAX_PARTICLES);
    this.sizeArray = new Float32Array(MAX_PARTICLES);
    this.hueArray = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positionArray[i * 3 + 1] = -1000;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifeArray, 1));
    this.geometry.setAttribute('aMaxLife', new THREE.BufferAttribute(this.maxLifeArray, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArray, 1));
    this.geometry.setAttribute('aHue', new THREE.BufferAttribute(this.hueArray, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawnBurst(x: number, y: number, z: number): void {
    const count = BURST_COUNT_MIN + Math.floor(Math.random() * (BURST_COUNT_MAX - BURST_COUNT_MIN));
    for (let i = 0; i < count; i++) {
      const slot = this.findDeadSlot();
      if (slot === -1) break;

      const p = this.particles[slot];
      p.alive = true;
      p.life = 0;
      p.maxLife = BURST_LIFE_MIN + Math.random() * (BURST_LIFE_MAX - BURST_LIFE_MIN);
      p.size = BURST_SIZE_MIN + Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN);
      p.hue = Math.random();
      p.px = x + (Math.random() - 0.5) * 4.0;
      p.py = y + Math.random() * 2.0;
      p.pz = z + (Math.random() - 0.5) * 4.0;

      const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.cos(phi) * speed + 6.0;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;

      this.writeSlot(slot);
    }
  }

  update(dt: number): void {
    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      anyAlive = true;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.positionArray[i * 3 + 1] = -1000;
        this.lifeArray[i] = 0;
        continue;
      }

      // Physics — lighter gravity, more float
      p.vy += GRAVITY * dt;
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
      this.hueArray[i] = p.hue;
    }

    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aMaxLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aHue as THREE.BufferAttribute).needsUpdate = true;
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
    this.hueArray[i] = p.hue;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
