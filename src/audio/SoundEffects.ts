import { clamp } from '../utils/math';

/**
 * One-shot weapon sound effects synthesized via Web Audio API.
 * Follows the same lazy-init pattern as AmbientSoundscape.
 */
export class SoundEffects {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
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

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.8;
    }
    return this.muted;
  }

  stop(): void {
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this.masterGain = null;
    }
  }
}
