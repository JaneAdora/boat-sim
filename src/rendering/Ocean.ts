import * as THREE from 'three';
import oceanVertShader from '../shaders/ocean.vert.glsl';
import oceanFragShader from '../shaders/ocean.frag.glsl';

export interface WaveParams {
  direction: [number, number]; // normalized 2D direction
  amplitude: number;
  frequency: number;
  steepness: number;
  speed: number;
}

// Default wave configuration for a soothing ocean
const DEFAULT_WAVES: WaveParams[] = [
  { direction: [0.8, 0.6], amplitude: 0.6, frequency: 0.18, steepness: 0.4, speed: 0.8 },
  { direction: [-0.3, 0.95], amplitude: 0.35, frequency: 0.28, steepness: 0.35, speed: 1.1 },
  { direction: [0.5, -0.86], amplitude: 0.2, frequency: 0.4, steepness: 0.3, speed: 1.4 },
  { direction: [-0.7, -0.7], amplitude: 0.15, frequency: 0.55, steepness: 0.25, speed: 1.8 },
  { direction: [0.95, -0.3], amplitude: 0.08, frequency: 0.9, steepness: 0.2, speed: 2.2 },
  { direction: [-0.5, 0.86], amplitude: 0.05, frequency: 1.3, steepness: 0.15, speed: 2.8 },
];

export class Ocean {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private waves: WaveParams[];
  private baseAmplitudes: number[];
  private stormScale = 1;
  private time = 0;

  constructor(waves: WaveParams[] = DEFAULT_WAVES) {
    // Clone: storm scaling mutates amplitudes, and the defaults are shared
    this.waves = waves.map((w) => ({ ...w }));
    this.baseAmplitudes = waves.map((w) => w.amplitude);

    const geometry = new THREE.PlaneGeometry(600, 600, 256, 256);
    geometry.rotateX(-Math.PI / 2);

    const waveDirections = new Array(8).fill(null).map((_, i) =>
      i < waves.length ? new THREE.Vector2(waves[i].direction[0], waves[i].direction[1]) : new THREE.Vector2(0, 0)
    );
    const waveAmplitudes = new Array(8).fill(0).map((_, i) => i < waves.length ? waves[i].amplitude : 0);
    const waveFrequencies = new Array(8).fill(0).map((_, i) => i < waves.length ? waves[i].frequency : 0);
    const waveSteepness = new Array(8).fill(0).map((_, i) => i < waves.length ? waves[i].steepness : 0);
    const waveSpeeds = new Array(8).fill(0).map((_, i) => i < waves.length ? waves[i].speed : 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: oceanVertShader,
      fragmentShader: oceanFragShader,
      uniforms: {
        uTime: { value: 0 },
        uWaveDirections: { value: waveDirections },
        uWaveAmplitudes: { value: waveAmplitudes },
        uWaveFrequencies: { value: waveFrequencies },
        uWaveSteepness: { value: waveSteepness },
        uWaveSpeeds: { value: waveSpeeds },
        uWaveCount: { value: waves.length },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.3, 0.8).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
        uDeepColor: { value: new THREE.Color(0.005, 0.03, 0.14) },
        uShallowColor: { value: new THREE.Color(0.02, 0.18, 0.35) },
        uFoamColor: { value: new THREE.Color(0.9, 0.95, 1.0) },
        uFoamThreshold: { value: 0.3 },
        uCameraPosition: { value: new THREE.Vector3() },
      },
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /**
   * Scale wave amplitudes with the weather (1 = calm baseline). Updates the
   * shader uniform and the CPU mirror together so rendering, buoyancy, and
   * collision all see the same sea state.
   */
  setStormScale(scale: number): void {
    if (Math.abs(scale - this.stormScale) < 0.002) return;
    this.stormScale = scale;
    const amps = this.material.uniforms.uWaveAmplitudes.value as number[];
    for (let i = 0; i < this.waves.length; i++) {
      this.waves[i].amplitude = this.baseAmplitudes[i] * scale;
      amps[i] = this.waves[i].amplitude;
    }
  }

  /**
   * Get the wave height at a world-space (x, z) position and time.
   * This mirrors the Gerstner wave math in the vertex shader.
   */
  getWaveHeight(x: number, z: number, time?: number): number {
    const t = time ?? this.time;
    let height = 0;

    for (const wave of this.waves) {
      const dx = wave.direction[0];
      const dz = wave.direction[1];
      const phase = (dx * x + dz * z) * wave.frequency + t * wave.speed;
      height += wave.amplitude * Math.sin(phase);
    }

    return height;
  }

  /**
   * Get the wave normal at a world-space (x, z) position.
   * Computed analytically from partial derivatives of the Gerstner displacement.
   */
  getWaveNormal(x: number, z: number, time?: number): THREE.Vector3 {
    const t = time ?? this.time;
    const tangent = new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3(0, 0, 1);

    for (const wave of this.waves) {
      const dx = wave.direction[0];
      const dz = wave.direction[1];
      const freq = wave.frequency;
      const amp = wave.amplitude;
      const steep = wave.steepness;
      const q = steep / (freq * amp * this.waves.length);
      const phase = (dx * x + dz * z) * freq + t * wave.speed;
      const c = Math.cos(phase);
      const s = Math.sin(phase);

      tangent.x += -q * dx * dx * freq * amp * s;
      tangent.y += dx * freq * amp * c;
      tangent.z += -q * dx * dz * freq * amp * s;

      binormal.x += -q * dx * dz * freq * amp * s;
      binormal.y += dz * freq * amp * c;
      binormal.z += -q * dz * dz * freq * amp * s;
    }

    return new THREE.Vector3().crossVectors(binormal, tangent).normalize();
  }

  update(dt: number, cameraPos: THREE.Vector3, sunDirection?: THREE.Vector3): void {
    this.time += dt;

    // Snap ocean position to camera, quantized to reduce vertex swimming
    const snapSize = 600 / 256; // one vertex spacing
    this.mesh.position.x = Math.round(cameraPos.x / snapSize) * snapSize;
    this.mesh.position.z = Math.round(cameraPos.z / snapSize) * snapSize;

    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);

    if (sunDirection) {
      this.material.uniforms.uSunDirection.value.copy(sunDirection);
    }
  }

  setSunColor(color: THREE.Color): void {
    this.material.uniforms.uSunColor.value.copy(color);
  }

  setDeepColor(color: THREE.Color): void {
    this.material.uniforms.uDeepColor.value.copy(color);
  }

  setShallowColor(color: THREE.Color): void {
    this.material.uniforms.uShallowColor.value.copy(color);
  }
}
