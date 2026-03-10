import { AudioManager } from './AudioManager';
import { clamp, lerp } from '../utils/math';

/**
 * Manages layered ambient audio that responds to game state.
 *
 * Since we don't have audio files yet, this creates synthetic
 * white-noise-based ocean sounds using the Web Audio API as a fallback.
 */
export class AmbientSoundscape {
  private audioCtx: AudioContext | null = null;
  private oceanGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private rainGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private started = false;
  private muted = false;

  private targetOceanVolume = 0.15;
  private targetWindVolume = 0.05;
  private currentOceanVolume = 0;
  private currentWindVolume = 0;
  private currentEngineVolume = 0;
  private currentRainVolume = 0;

  constructor() {}

  /**
   * Initialize Web Audio synthesis as a fallback when no audio files are present.
   * Generates gentle noise-based ocean and wind ambience.
   */
  private initSynthetic(): void {
    if (this.audioCtx) return;

    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.audioCtx.destination);

    // Ocean: filtered brown noise
    this.oceanGain = this.audioCtx.createGain();
    this.oceanGain.gain.value = 0;
    this.oceanGain.connect(this.masterGain);

    const oceanBuffer = this.createBrownNoise(this.audioCtx, 4);
    const oceanSource = this.audioCtx.createBufferSource();
    oceanSource.buffer = oceanBuffer;
    oceanSource.loop = true;

    const oceanFilter = this.audioCtx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.value = 400;
    oceanFilter.Q.value = 0.5;

    oceanSource.connect(oceanFilter);
    oceanFilter.connect(this.oceanGain);
    oceanSource.start();

    // Engine: detuned sawtooth oscillators + noise for diesel rumble
    this.engineGain = this.audioCtx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);

    const engineFilter = this.audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 120;
    engineFilter.Q.value = 2;
    engineFilter.connect(this.engineGain);

    this.engineOsc = this.audioCtx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 58;
    this.engineOsc.connect(engineFilter);
    this.engineOsc.start();

    this.engineOsc2 = this.audioCtx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 63;
    this.engineOsc2.connect(engineFilter);
    this.engineOsc2.start();

    // Exhaust noise layer
    const exhaustBuffer = this.createBrownNoise(this.audioCtx, 2);
    const exhaustSource = this.audioCtx.createBufferSource();
    exhaustSource.buffer = exhaustBuffer;
    exhaustSource.loop = true;
    const exhaustFilter = this.audioCtx.createBiquadFilter();
    exhaustFilter.type = 'lowpass';
    exhaustFilter.frequency.value = 200;
    exhaustFilter.Q.value = 0.5;
    exhaustSource.connect(exhaustFilter);
    const exhaustGain = this.audioCtx.createGain();
    exhaustGain.gain.value = 0.3;
    exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(this.engineGain);
    exhaustSource.start();

    // Wind: filtered white noise with higher frequency
    this.windGain = this.audioCtx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.masterGain);

    const windBuffer = this.createBrownNoise(this.audioCtx, 3);
    const windSource = this.audioCtx.createBufferSource();
    windSource.buffer = windBuffer;
    windSource.loop = true;

    const windFilter = this.audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.3;

    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    windSource.start();

    // Rain: higher-pitched filtered noise (like rain on water)
    this.rainGain = this.audioCtx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.masterGain);

    const rainBuffer = this.createBrownNoise(this.audioCtx, 3);
    const rainSource = this.audioCtx.createBufferSource();
    rainSource.buffer = rainBuffer;
    rainSource.loop = true;

    const rainFilter = this.audioCtx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2000;
    rainFilter.Q.value = 0.3;

    const rainFilter2 = this.audioCtx.createBiquadFilter();
    rainFilter2.type = 'lowpass';
    rainFilter2.frequency.value = 8000;
    rainFilter2.Q.value = 0.5;

    rainSource.connect(rainFilter);
    rainFilter.connect(rainFilter2);
    rainFilter2.connect(this.rainGain);
    rainSource.start();

    this.started = true;
  }

  private createBrownNoise(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5; // amplify
      }
    }

    return buffer;
  }

  start(): void {
    const initOnInteraction = () => {
      this.initSynthetic();
      if (this.audioCtx?.state === 'suspended') {
        this.audioCtx.resume();
      }
    };
    window.addEventListener('click', initOnInteraction, { once: true });
    window.addEventListener('keydown', initOnInteraction, { once: true });
  }

  update(windStrength: number, nearIsland: boolean, dt: number, rainIntensity: number = 0): void {
    if (!this.started || this.muted) return;

    // Target volumes based on conditions
    this.targetOceanVolume = 0.1 + clamp(windStrength * 0.02, 0, 0.15);
    this.targetWindVolume = clamp(windStrength * 0.015, 0.02, 0.12);
    const targetRainVolume = clamp(rainIntensity * 0.2, 0, 0.2);

    // Smooth volume transitions
    this.currentOceanVolume = lerp(this.currentOceanVolume, this.targetOceanVolume, 1 - Math.exp(-2 * dt));
    this.currentWindVolume = lerp(this.currentWindVolume, this.targetWindVolume, 1 - Math.exp(-2 * dt));
    this.currentRainVolume = lerp(this.currentRainVolume, targetRainVolume, 1 - Math.exp(-1.5 * dt));

    if (this.oceanGain) {
      this.oceanGain.gain.value = this.currentOceanVolume;
    }
    if (this.windGain) {
      this.windGain.gain.value = this.currentWindVolume;
    }
    if (this.rainGain) {
      this.rainGain.gain.value = this.currentRainVolume;
    }
  }

  updateEngine(throttle: number, dt: number): void {
    if (!this.started || this.muted) return;

    const absThrottle = Math.abs(throttle);
    const targetVolume = clamp(absThrottle * 0.18, 0, 0.18);
    this.currentEngineVolume = lerp(this.currentEngineVolume, targetVolume, 1 - Math.exp(-4 * dt));

    if (this.engineGain) {
      this.engineGain.gain.value = this.currentEngineVolume;
    }
    // Pitch rises slightly with throttle
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 58 + absThrottle * 20;
    }
    if (this.engineOsc2) {
      this.engineOsc2.frequency.value = 63 + absThrottle * 20;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
    }
    return this.muted;
  }
}
