import { createNoise2D, createNoise3D } from 'simplex-noise';

/**
 * Simple seeded PRNG (Mulberry32).
 * Converts a string seed to a deterministic random function.
 */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class SeededNoise {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise3D: ReturnType<typeof createNoise3D>;

  constructor(seed: string = 'boat-sim-default') {
    const prng = seededRandom(seed);
    this.noise2D = createNoise2D(prng);
    this.noise3D = createNoise3D(prng);
  }

  /** Single sample of 2D simplex noise, range [-1, 1]. */
  sample2D(x: number, y: number): number {
    return this.noise2D(x, y);
  }

  /** Single sample of 3D simplex noise, range [-1, 1]. */
  sample3D(x: number, y: number, z: number): number {
    return this.noise3D(x, y, z);
  }

  /** Fractal Brownian Motion — layered octaves of 2D noise. */
  fbm2D(x: number, y: number, octaves: number = 6, lacunarity: number = 2.0, gain: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }

  /** Ridged multi-fractal noise. Good for mountain ridges. */
  ridged2D(x: number, y: number, octaves: number = 6, lacunarity: number = 2.0, gain: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(this.noise2D(x * frequency, y * frequency));
      n = n * n;
      value += amplitude * n;
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }
}
