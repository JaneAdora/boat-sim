import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// ── Weather state definitions ──────────────────────────────────────────

enum WeatherState {
  Clear = 0,
  Overcast = 1,
  Rain = 2,
  Storm = 3,
}

interface WeatherConfig {
  fogDensity: number;
  rainIntensity: number; // 0-1
  darkness: number; // 0-1 — how much to dim sun
}

const WEATHER_CONFIGS: Record<WeatherState, WeatherConfig> = {
  [WeatherState.Clear]:    { fogDensity: 0.00015, rainIntensity: 0.0, darkness: 0.0 },
  [WeatherState.Overcast]: { fogDensity: 0.00025, rainIntensity: 0.0, darkness: 0.25 },
  [WeatherState.Rain]:     { fogDensity: 0.0004,  rainIntensity: 0.6, darkness: 0.5 },
  [WeatherState.Storm]:    { fogDensity: 0.0006,  rainIntensity: 1.0, darkness: 0.75 },
};

// ── Rain shader code ───────────────────────────────────────────────────

const RAIN_VERTEX_SHADER = /* glsl */ `
  attribute float aSpeed;
  attribute float aOffset;

  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uCameraPos;

  varying float vAlpha;

  void main() {
    // Recycle particle position relative to camera
    vec3 pos = position;

    // Offset around camera
    pos.x += uCameraPos.x;
    pos.z += uCameraPos.z;

    // Animate falling: wrap within the box height
    float fallY = pos.y - (uTime * aSpeed * 30.0 + aOffset);
    fallY = mod(fallY + 60.0, 60.0) - 10.0; // cycle within -10 to 50 range
    pos.y = fallY + uCameraPos.y;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // Streak: elongate based on speed — bigger point = more streak
    float streakSize = aSpeed * 4.0 + 2.0;
    gl_PointSize = streakSize * (200.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 12.0);

    // Fade with intensity and slight randomness
    vAlpha = uIntensity * (0.15 + aSpeed * 0.15);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;

  void main() {
    // Vertical streak shape
    vec2 uv = gl_PointCoord;
    float streakMask = smoothstep(0.5, 0.0, abs(uv.x - 0.5));
    float vertFade = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.5, uv.y);
    float alpha = streakMask * vertFade * vAlpha;

    if (alpha < 0.01) discard;

    // Slightly blue-white rain color
    vec3 color = vec3(0.75, 0.82, 0.92);
    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Constants ──────────────────────────────────────────────────────────

const RAIN_PARTICLE_COUNT = 5000;
const RAIN_BOX_WIDTH = 100;
const RAIN_BOX_HEIGHT = 60;
const RAIN_BOX_DEPTH = 100;

const TRANSITION_DURATION = 30; // seconds to blend between weather states

const LIGHTNING_MIN_INTERVAL = 5;
const LIGHTNING_MAX_INTERVAL = 25;
const LIGHTNING_FLASH_DURATION = 0.15;
const LIGHTNING_DECAY_DURATION = 0.4;

// ── WeatherSystem class ────────────────────────────────────────────────

export class WeatherSystem {
  // Weather state blending
  private noise2D: ReturnType<typeof createNoise2D>;
  private elapsed = 0;
  private currentConfig: WeatherConfig;
  private targetConfig: WeatherConfig;
  private transitionProgress = 1; // 1 = fully arrived at target
  private currentState: WeatherState = WeatherState.Clear;

  // Interpolated current values
  private fogDensity = 0.00015;
  private rainIntensity = 0;
  private weatherDarkness = 0;

  // Rain particles
  private rainMesh: THREE.Points;
  private rainMaterial: THREE.ShaderMaterial;

  // Lightning
  private lightningLight: THREE.PointLight;
  private lightningFlash = 0; // 0-1 current flash intensity
  private lightningTimer = 10; // countdown to next flash
  private lightningPhase: 'idle' | 'flash' | 'decay' = 'idle';
  private lightningPhaseTimer = 0;
  private ambientLight: THREE.AmbientLight; // brief screen flash

  constructor(scene: THREE.Scene) {
    // Noise for weather cycle — unseeded is fine (random per session)
    this.noise2D = createNoise2D();

    // Initialize configs
    this.currentConfig = { ...WEATHER_CONFIGS[WeatherState.Clear] };
    this.targetConfig = { ...WEATHER_CONFIGS[WeatherState.Clear] };

    // ── Rain particle system ──
    const positions = new Float32Array(RAIN_PARTICLE_COUNT * 3);
    const speeds = new Float32Array(RAIN_PARTICLE_COUNT);
    const offsets = new Float32Array(RAIN_PARTICLE_COUNT);

    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * RAIN_BOX_WIDTH;
      positions[i * 3 + 1] = Math.random() * RAIN_BOX_HEIGHT;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX_DEPTH;

      speeds[i] = 0.6 + Math.random() * 0.4; // fall speed variation
      offsets[i] = Math.random() * 100; // time offset so drops don't sync
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));

    this.rainMaterial = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX_SHADER,
      fragmentShader: RAIN_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.rainMesh = new THREE.Points(geometry, this.rainMaterial);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 100; // render after most things
    scene.add(this.rainMesh);

    // ── Lightning lights ──
    this.lightningLight = new THREE.PointLight(0xccddff, 0, 2000, 1.5);
    this.lightningLight.position.set(0, 300, 0);
    scene.add(this.lightningLight);

    // Brief ambient flash for the "screen flash" effect
    this.ambientLight = new THREE.AmbientLight(0xccddff, 0);
    scene.add(this.ambientLight);

    // Randomize initial lightning timer
    this.lightningTimer = LIGHTNING_MIN_INTERVAL + Math.random() * (LIGHTNING_MAX_INTERVAL - LIGHTNING_MIN_INTERVAL);
  }

  update(dt: number, cameraPos: THREE.Vector3, currentFog: THREE.FogExp2): void {
    this.elapsed += dt;

    // ── 1. Evaluate weather state from noise ──
    this.updateWeatherState();

    // ── 2. Interpolate weather config ──
    this.updateTransition(dt);

    // ── 3. Apply fog density ──
    currentFog.density = this.fogDensity;

    // ── 4. Update rain particles ──
    this.rainMaterial.uniforms.uTime.value = this.elapsed;
    this.rainMaterial.uniforms.uIntensity.value = this.rainIntensity;
    this.rainMaterial.uniforms.uCameraPos.value.copy(cameraPos);

    // Hide rain mesh entirely when intensity is zero (skip draw call)
    this.rainMesh.visible = this.rainIntensity > 0.01;

    // ── 5. Update lightning ──
    this.updateLightning(dt, cameraPos);
  }

  getRainIntensity(): number {
    return this.rainIntensity;
  }

  getWeatherDarkness(): number {
    return this.weatherDarkness;
  }

  getLightningFlash(): number {
    return this.lightningFlash;
  }

  // ── Private methods ────────────────────────────────────────────────

  /**
   * Sample noise at the current time to determine weather state.
   * Uses two noise channels at different frequencies so cycles aren't
   * perfectly periodic — sometimes clear lingers, sometimes storms roll
   * in quickly.
   */
  private updateWeatherState(): void {
    // Noise-driven weather cycle (~1-2 min between transitions)
    // Time scale: 0.015 gives roughly one full noise oscillation per ~70s
    const slowNoise = this.noise2D(this.elapsed * 0.015, 0.0);

    // Secondary noise at different frequency for variety
    const fastNoise = this.noise2D(this.elapsed * 0.035, 100.0);

    // Combined value in roughly [-1, 1] range
    const combined = slowNoise * 0.7 + fastNoise * 0.3;

    // Map combined noise to weather state
    let newState: WeatherState;
    if (combined < -0.3) {
      newState = WeatherState.Clear;
    } else if (combined < 0.1) {
      newState = WeatherState.Overcast;
    } else if (combined < 0.45) {
      newState = WeatherState.Rain;
    } else {
      newState = WeatherState.Storm;
    }

    // Only start a new transition if we've changed state
    if (newState !== this.currentState && this.transitionProgress >= 0.95) {
      this.currentConfig = {
        fogDensity: this.fogDensity,
        rainIntensity: this.rainIntensity,
        darkness: this.weatherDarkness,
      };
      this.targetConfig = { ...WEATHER_CONFIGS[newState] };
      this.transitionProgress = 0;
      this.currentState = newState;
    }
  }

  /**
   * Smoothly interpolate all weather parameters toward the target state.
   */
  private updateTransition(dt: number): void {
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + dt / TRANSITION_DURATION);

      // Smooth ease-in-out
      const t = this.smoothstep(this.transitionProgress);

      this.fogDensity = THREE.MathUtils.lerp(this.currentConfig.fogDensity, this.targetConfig.fogDensity, t);
      this.rainIntensity = THREE.MathUtils.lerp(this.currentConfig.rainIntensity, this.targetConfig.rainIntensity, t);
      this.weatherDarkness = THREE.MathUtils.lerp(this.currentConfig.darkness, this.targetConfig.darkness, t);
    }
  }

  /**
   * Handle lightning flashes during storm weather.
   */
  private updateLightning(dt: number, cameraPos: THREE.Vector3): void {
    // Lightning only happens when there's significant storm intensity
    const stormStrength = Math.max(0, (this.rainIntensity - 0.7) / 0.3); // 0 when rain<0.7, 1 at full storm

    if (this.lightningPhase === 'idle') {
      if (stormStrength > 0.1) {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          // Trigger a flash!
          this.lightningPhase = 'flash';
          this.lightningPhaseTimer = LIGHTNING_FLASH_DURATION;

          // Position the lightning light at a random spot in the sky around camera
          this.lightningLight.position.set(
            cameraPos.x + (Math.random() - 0.5) * 600,
            200 + Math.random() * 200,
            cameraPos.z + (Math.random() - 0.5) * 600
          );
        }
      } else {
        // Reset timer when not stormy, so lightning doesn't trigger immediately
        // when a storm begins
        this.lightningTimer = LIGHTNING_MIN_INTERVAL + Math.random() * (LIGHTNING_MAX_INTERVAL - LIGHTNING_MIN_INTERVAL);
      }
    }

    if (this.lightningPhase === 'flash') {
      this.lightningPhaseTimer -= dt;
      // Intensity ramps up fast then holds
      this.lightningFlash = 1.0 * stormStrength;

      if (this.lightningPhaseTimer <= 0) {
        this.lightningPhase = 'decay';
        this.lightningPhaseTimer = LIGHTNING_DECAY_DURATION;
      }
    }

    if (this.lightningPhase === 'decay') {
      this.lightningPhaseTimer -= dt;
      const decayT = Math.max(0, this.lightningPhaseTimer / LIGHTNING_DECAY_DURATION);
      this.lightningFlash = decayT * decayT * stormStrength; // quadratic falloff

      if (this.lightningPhaseTimer <= 0) {
        this.lightningPhase = 'idle';
        this.lightningFlash = 0;
        this.lightningTimer = LIGHTNING_MIN_INTERVAL + Math.random() * (LIGHTNING_MAX_INTERVAL - LIGHTNING_MIN_INTERVAL);
      }
    }

    // Apply flash to lights
    this.lightningLight.intensity = this.lightningFlash * 8;
    this.ambientLight.intensity = this.lightningFlash * 0.5;
  }

  /** Hermite smooth step for nice easing. */
  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }
}
