import { describe, expect, it } from 'vitest';
import { Ocean } from '../src/rendering/Ocean';

describe('storm wave scaling', () => {
  it('scales the CPU height mirror and the shader uniform together', () => {
    const ocean = new Ocean();
    const calm = ocean.getWaveHeight(12.3, -45.6, 2.0);
    const calmAmps = [...(ocean['material'].uniforms.uWaveAmplitudes.value as number[])];

    ocean.setStormScale(1.9);
    const storm = ocean.getWaveHeight(12.3, -45.6, 2.0);
    const stormAmps = ocean['material'].uniforms.uWaveAmplitudes.value as number[];

    // Height is a sum of amplitude·sin terms — scaling amplitudes scales it exactly
    expect(storm).toBeCloseTo(calm * 1.9, 6);
    for (let i = 0; i < 6; i++) {
      expect(stormAmps[i]).toBeCloseTo(calmAmps[i] * 1.9, 6);
    }

    // And back to calm restores the baseline
    ocean.setStormScale(1);
    expect(ocean.getWaveHeight(12.3, -45.6, 2.0)).toBeCloseTo(calm, 6);
  });

  it('does not mutate the shared default wave table across instances', () => {
    const a = new Ocean();
    a.setStormScale(2);
    const b = new Ocean();
    // A fresh ocean starts calm regardless of what a previous one did
    expect(b.getWaveHeight(5, 5, 1)).toBeCloseTo(a.getWaveHeight(5, 5, 1) / 2, 6);
  });
});
