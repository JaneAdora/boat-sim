import { clamp } from '../utils/math';

/**
 * One-shot weapon sound effects synthesized via Web Audio API.
 * Follows the same lazy-init pattern as AmbientSoundscape.
 */
export class SoundEffects {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;
  private userVolume = 0.5; // 0..1, shared with the volume slider
  private static readonly GAIN_SCALE = 1.2; // SFX sit slightly above ambient

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();

      // Limiter so overlapping explosions don't sum past 1.0 and hard-clip.
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -6;
      this.compressor.knee.value = 6;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.compressor.connect(this.audioCtx.destination);

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.effectiveGain();
      this.masterGain.connect(this.compressor);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private effectiveGain(): number {
    return this.muted ? 0 : Math.min(1, this.userVolume * SoundEffects.GAIN_SCALE);
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
    this.masterGain.gain.setTargetAtTime(this.effectiveGain(), this.audioCtx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.audioCtx?.state === 'running') this.audioCtx.suspend();
  }

  resume(): void {
    this.audioCtx?.resume().catch(() => {});
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number, white = false): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      if (white) {
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } else {
        let lastOut = 0;
        for (let i = 0; i < length; i++) {
          const w = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * w) / 1.02;
          data[i] = lastOut * 3.5;
        }
      }
    }
    return buffer;
  }

  /**
   * Short percussive compressed-air tube launch sound (~1.2s).
   * Sine "thump" dropping from 120→40 Hz + brown noise "hiss" through bandpass.
   */
  playTorpedoLaunch(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Sine "thump": 120→40 Hz over 0.15s, gain 0.5→0 over 0.3s
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(120, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.5, now);
    thumpGain.gain.linearRampToValueAtTime(0, now + 0.3);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.masterGain!);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.4);

    // Noise "hiss": brown noise, highpass 1500 Hz + lowpass 6000 Hz, gain 0.3→0 over 1.0s
    const hissBuffer = this.createNoiseBuffer(ctx, 1.2);
    const hissSource = ctx.createBufferSource();
    hissSource.buffer = hissBuffer;

    const hissHP = ctx.createBiquadFilter();
    hissHP.type = 'highpass';
    hissHP.frequency.value = 1500;

    const hissLP = ctx.createBiquadFilter();
    hissLP.type = 'lowpass';
    hissLP.frequency.value = 6000;

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.3, now);
    hissGain.gain.linearRampToValueAtTime(0, now + 1.0);

    hissSource.connect(hissHP);
    hissHP.connect(hissLP);
    hissLP.connect(hissGain);
    hissGain.connect(this.masterGain!);
    hissSource.start(now);
    hissSource.stop(now + 1.2);
  }

  /**
   * Rocket whoosh launch sound (~2s).
   * Sawtooth sweep through bandpass + brown noise roar.
   */
  playMissileLaunch(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Sawtooth sweep: 200→800 Hz over 0.3s then →100 Hz over 1.5s
    const sweepOsc = ctx.createOscillator();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(200, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
    sweepOsc.frequency.exponentialRampToValueAtTime(100, now + 1.8);

    const sweepBP = ctx.createBiquadFilter();
    sweepBP.type = 'bandpass';
    sweepBP.frequency.value = 400;
    sweepBP.Q.value = 2;

    const sweepGain = ctx.createGain();
    sweepGain.gain.setValueAtTime(0, now);
    sweepGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
    sweepGain.gain.linearRampToValueAtTime(0, now + 1.5);

    sweepOsc.connect(sweepBP);
    sweepBP.connect(sweepGain);
    sweepGain.connect(this.masterGain!);
    sweepOsc.start(now);
    sweepOsc.stop(now + 2.0);

    // Noise roar: brown noise, bandpass 1000 Hz Q=0.5, gain 0→0.35 over 0.1s then →0 over 2.0s
    const roarBuffer = this.createNoiseBuffer(ctx, 2.0);
    const roarSource = ctx.createBufferSource();
    roarSource.buffer = roarBuffer;

    const roarBP = ctx.createBiquadFilter();
    roarBP.type = 'bandpass';
    roarBP.frequency.value = 1000;
    roarBP.Q.value = 0.5;

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0, now);
    roarGain.gain.linearRampToValueAtTime(0.35, now + 0.1);
    roarGain.gain.linearRampToValueAtTime(0, now + 2.0);

    roarSource.connect(roarBP);
    roarBP.connect(roarGain);
    roarGain.connect(this.masterGain!);
    roarSource.start(now);
    roarSource.stop(now + 2.0);
  }

  /**
   * Low boom + crackle explosion sound (~2.5s).
   * Low sine boom + white noise crackle + sub-bass sine punch.
   */
  playExplosion(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Low boom: sine 80→20 Hz over 0.5s, through lowpass 150Hz, gain 0.7→0 over 1.5s
    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(80, now);
    boomOsc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

    const boomLP = ctx.createBiquadFilter();
    boomLP.type = 'lowpass';
    boomLP.frequency.value = 150;

    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.7, now);
    boomGain.gain.linearRampToValueAtTime(0, now + 1.5);

    boomOsc.connect(boomLP);
    boomLP.connect(boomGain);
    boomGain.connect(this.masterGain!);
    boomOsc.start(now);
    boomOsc.stop(now + 1.6);

    // Crackle: white noise, bandpass 2000Hz Q=2, gain 0→0.3 delayed 0.05s then →0 over 2.0s
    const crackleBuffer = this.createNoiseBuffer(ctx, 2.5, true);
    const crackleSource = ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;

    const crackleBP = ctx.createBiquadFilter();
    crackleBP.type = 'bandpass';
    crackleBP.frequency.value = 2000;
    crackleBP.Q.value = 2;

    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0, now);
    crackleGain.gain.setValueAtTime(0, now + 0.05);
    crackleGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    crackleGain.gain.linearRampToValueAtTime(0, now + 2.0);

    crackleSource.connect(crackleBP);
    crackleBP.connect(crackleGain);
    crackleGain.connect(this.masterGain!);
    crackleSource.start(now);
    crackleSource.stop(now + 2.5);

    // Sub-bass punch: sine 40→15 Hz over 0.3s, gain 0.5→0 over 0.5s
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(40, now);
    subOsc.frequency.exponentialRampToValueAtTime(15, now + 0.3);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.linearRampToValueAtTime(0, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain!);
    subOsc.start(now);
    subOsc.stop(now + 0.6);
  }

  /**
   * Bright sparkle chime for magical mode impacts (~1.2s).
   * Major chord (C6 + E6 + G6) with shimmer noise.
   */
  playMagicChime(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Major chord: C6, E6, G6
    const freqs = [1047, 1319, 1568];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      // Gentle upward glide for sparkle feel
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 1.02, now + 0.3);

      const gain = ctx.createGain();
      const delay = i * 0.04; // stagger each note slightly
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 + delay);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + delay);
      osc.stop(now + 1.0 + delay);
    }

    // High sparkle: a second set of quiet high harmonics
    const sparkleOsc = ctx.createOscillator();
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(2637, now); // C7-ish
    sparkleOsc.frequency.exponentialRampToValueAtTime(3136, now + 0.4); // G7

    const sparkleGain = ctx.createGain();
    sparkleGain.gain.setValueAtTime(0, now);
    sparkleGain.gain.linearRampToValueAtTime(0.12, now + 0.01);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(this.masterGain!);
    sparkleOsc.start(now);
    sparkleOsc.stop(now + 0.7);

    // Shimmer: white noise burst through very high bandpass
    const shimmerBuffer = this.createNoiseBuffer(ctx, 0.5, true);
    const shimmerSource = ctx.createBufferSource();
    shimmerSource.buffer = shimmerBuffer;

    const shimmerBP = ctx.createBiquadFilter();
    shimmerBP.type = 'bandpass';
    shimmerBP.frequency.value = 8000;
    shimmerBP.Q.value = 4;

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    shimmerGain.gain.linearRampToValueAtTime(0, now + 0.4);

    shimmerSource.connect(shimmerBP);
    shimmerBP.connect(shimmerGain);
    shimmerGain.connect(this.masterGain!);
    shimmerSource.start(now);
    shimmerSource.stop(now + 0.5);
  }

  /**
   * Soft two-note ship's bell for island discovery (~1.5s).
   * Rising perfect fourth (E5 → A5), gentle attack, long decay — meant to
   * feel like a reward without breaking the soothing mood.
   */
  playDiscovery(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const notes = [659.3, 880]; // E5, A5
    for (let i = 0; i < notes.length; i++) {
      const at = now + i * 0.22;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], at);

      // Quiet upper partial gives it a bell-like timbre instead of a pure beep
      const partial = ctx.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(notes[i] * 2.76, at);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 1.3);

      const partialGain = ctx.createGain();
      partialGain.gain.setValueAtTime(0, at);
      partialGain.gain.linearRampToValueAtTime(0.04, at + 0.01);
      partialGain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);

      osc.connect(gain);
      partial.connect(partialGain);
      gain.connect(this.masterGain!);
      partialGain.connect(this.masterGain!);
      osc.start(at);
      osc.stop(at + 1.4);
      partial.start(at);
      partial.stop(at + 0.6);
    }
  }

  stop(): void {
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this.masterGain = null;
      this.compressor = null;
    }
  }
}
