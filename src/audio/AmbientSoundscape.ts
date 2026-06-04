import { clamp, lerp } from '../utils/math';

/**
 * Manages layered ambient audio that responds to game state.
 *
 * Since we don't have audio files yet, this creates synthetic
 * white-noise-based ocean sounds using the Web Audio API as a fallback.
 *
 * Engine sound is selected based on meshType:
 *   - tugboat / cruiseship / default: diesel rumble (sawtooth oscillators)
 *   - speedboat: higher-pitched triangle wave engine
 *   - vikingship: wind-based noise (no mechanical engine)
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
  private userVolume = 0.5; // 0..1 master level, driven by the volume slider
  private suspendTimer: number | null = null;

  private targetOceanVolume = 0.15;
  private targetWindVolume = 0.05;
  private currentOceanVolume = 0;
  private currentWindVolume = 0;
  private currentEngineVolume = 0;
  private currentRainVolume = 0;

  private meshType: string;
  private engineBaseFreq1 = 58;
  private engineBaseFreq2 = 63;
  private engineThrottleRange = 20;
  private vikingWindFilter: BiquadFilterNode | null = null;

  constructor(meshType: string = 'tugboat') {
    this.meshType = meshType;
  }

  /**
   * Initialize Web Audio synthesis as a fallback when no audio files are present.
   * Generates gentle noise-based ocean and wind ambience.
   */
  private initSynthetic(): void {
    if (this.audioCtx) return;

    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.userVolume;
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

    // Engine: dispatch based on meshType
    this.engineGain = this.audioCtx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);

    switch (this.meshType) {
      case 'speedboat':
        this.initSpeedboatEngine();
        break;
      case 'vikingship':
        this.initVikingWindEngine();
        break;
      default:
        this.initDieselEngine();
        break;
    }

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

  /**
   * Diesel engine: detuned sawtooth oscillators + exhaust noise.
   * Used for tugboat, cruiseship, and any other default boat.
   */
  private initDieselEngine(): void {
    const ctx = this.audioCtx!;

    this.engineBaseFreq1 = 58;
    this.engineBaseFreq2 = 63;
    this.engineThrottleRange = 20;

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 120;
    engineFilter.Q.value = 2;
    engineFilter.connect(this.engineGain!);

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = this.engineBaseFreq1;
    this.engineOsc.connect(engineFilter);
    this.engineOsc.start();

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = this.engineBaseFreq2;
    this.engineOsc2.connect(engineFilter);
    this.engineOsc2.start();

    // Exhaust noise layer
    const exhaustBuffer = this.createBrownNoise(ctx, 2);
    const exhaustSource = ctx.createBufferSource();
    exhaustSource.buffer = exhaustBuffer;
    exhaustSource.loop = true;
    const exhaustFilter = ctx.createBiquadFilter();
    exhaustFilter.type = 'lowpass';
    exhaustFilter.frequency.value = 200;
    exhaustFilter.Q.value = 0.5;
    exhaustSource.connect(exhaustFilter);
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0.3;
    exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(this.engineGain!);
    exhaustSource.start();
  }

  /**
   * Speedboat engine: higher-pitched triangle wave oscillators
   * with a lowpass filter and brown noise exhaust.
   */
  private initSpeedboatEngine(): void {
    const ctx = this.audioCtx!;

    this.engineBaseFreq1 = 160;
    this.engineBaseFreq2 = 175;
    this.engineThrottleRange = 80;

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 600;
    engineFilter.Q.value = 2;
    engineFilter.connect(this.engineGain!);

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'triangle';
    this.engineOsc.frequency.value = this.engineBaseFreq1;
    this.engineOsc.connect(engineFilter);
    this.engineOsc.start();

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = this.engineBaseFreq2;
    this.engineOsc2.connect(engineFilter);
    this.engineOsc2.start();

    // Brown noise exhaust layer through bandpass 400Hz
    const exhaustBuffer = this.createBrownNoise(ctx, 2);
    const exhaustSource = ctx.createBufferSource();
    exhaustSource.buffer = exhaustBuffer;
    exhaustSource.loop = true;
    const exhaustFilter = ctx.createBiquadFilter();
    exhaustFilter.type = 'bandpass';
    exhaustFilter.frequency.value = 400;
    exhaustFilter.Q.value = 1;
    exhaustSource.connect(exhaustFilter);
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0.25;
    exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(this.engineGain!);
    exhaustSource.start();
  }

  /**
   * Viking ship "engine": wind-based noise only, no mechanical oscillators.
   * Bandpass-filtered brown noise simulates wind in the sails.
   */
  private initVikingWindEngine(): void {
    const ctx = this.audioCtx!;

    // No oscillators for the viking ship
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineBaseFreq1 = 0;
    this.engineBaseFreq2 = 0;
    this.engineThrottleRange = 0;

    // Main wind noise through bandpass ~300 Hz
    const windBuffer = this.createBrownNoise(ctx, 3);
    const windSource = ctx.createBufferSource();
    windSource.buffer = windBuffer;
    windSource.loop = true;

    this.vikingWindFilter = ctx.createBiquadFilter();
    this.vikingWindFilter.type = 'bandpass';
    this.vikingWindFilter.frequency.value = 300;
    this.vikingWindFilter.Q.value = 1.0;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.4;

    windSource.connect(this.vikingWindFilter);
    this.vikingWindFilter.connect(windGain);
    windGain.connect(this.engineGain!);
    windSource.start();

    // Second noise source at 600 Hz for higher whistling wind
    const whistleBuffer = this.createBrownNoise(ctx, 3);
    const whistleSource = ctx.createBufferSource();
    whistleSource.buffer = whistleBuffer;
    whistleSource.loop = true;

    const whistleFilter = ctx.createBiquadFilter();
    whistleFilter.type = 'bandpass';
    whistleFilter.frequency.value = 600;
    whistleFilter.Q.value = 1.5;

    const whistleGain = ctx.createGain();
    whistleGain.gain.value = 0.2;

    whistleSource.connect(whistleFilter);
    whistleFilter.connect(whistleGain);
    whistleGain.connect(this.engineGain!);
    whistleSource.start();
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

  /** Called from within the user gesture that launches the game, so the
   *  AudioContext is allowed to start right away — no missed-first-gesture gap
   *  and no leaked one-shot window listeners. */
  start(): void {
    this.initSynthetic();
    if (this.audioCtx?.state === 'suspended') {
      this.audioCtx.resume();
    }
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

    // Pitch rises slightly with throttle (oscillator-based engines)
    if (this.engineOsc) {
      this.engineOsc.frequency.value = this.engineBaseFreq1 + absThrottle * this.engineThrottleRange;
    }
    if (this.engineOsc2) {
      this.engineOsc2.frequency.value = this.engineBaseFreq2 + absThrottle * this.engineThrottleRange;
    }

    // Viking ship: modulate wind filter center frequency with gust effect
    if (this.vikingWindFilter) {
      const gustEffect = Math.sin(Date.now() * 0.001 * 0.5) * 100;
      this.vikingWindFilter.frequency.value = 300 + absThrottle * 200 + gustEffect;
    }
  }

  /** 0..1 master volume (the slider). Ramped to avoid clicks. */
  setMasterVolume(v: number): void {
    this.userVolume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.masterGain || !this.audioCtx) return;
    const target = this.muted ? 0 : this.userVolume;
    this.masterGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.02);
  }

  /** Ramp to silence then suspend the context (called when the game pauses). */
  suspend(): void {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    const ctx = this.audioCtx;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    this.suspendTimer = window.setTimeout(() => {
      if (this.audioCtx === ctx && ctx.state === 'running') ctx.suspend();
    }, 80);
  }

  resume(): void {
    if (!this.audioCtx) return;
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    const ctx = this.audioCtx;
    ctx.resume().then(() => {
      if (this.audioCtx === ctx) this.applyMasterGain();
    }).catch(() => {});
  }

  stop(): void {
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this.masterGain = null;
      this.oceanGain = null;
      this.windGain = null;
      this.engineGain = null;
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.rainGain = null;
      this.vikingWindFilter = null;
      this.started = false;
    }
  }
}
