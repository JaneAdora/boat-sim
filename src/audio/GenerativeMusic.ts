/**
 * Generative ambient soundtrack — Eno-style, fully synthesized (no files).
 *
 * Two layers:
 *  - A breathing pad: three detuned sines on a slowly-cycling chord,
 *    behind a lowpass that darkens with the weather.
 *  - Sparse pentatonic bells over the current chord root.
 *
 * Mood inputs (storm / night / danger) reshape register, density, and
 * timbre rather than switching tracks, so transitions are seamless.
 */
export class GenerativeMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private pulseGain: GainNode | null = null;

  private muted = false;
  private userVolume = 0.5;
  private static readonly GAIN_SCALE = 0.4; // music sits well under the SFX

  private chordTimer = 4;
  private chordIndex = 0;
  private noteTimer = 6;
  private pulseTimer = 0;
  private mermaidMotif = false;
  private motifTimer = 30;

  private storm = 0;       // 0..1
  private night = false;
  private danger = false;

  private static readonly BASE = 130.81; // C3
  // Chord roots in semitones from C: a gentle I-vi-IV-V wander
  private static readonly CALM_ROOTS = [0, -3, 5, 7];
  // Stormy: lower, minor-leaning
  private static readonly STORM_ROOTS = [-7, -10, -5];
  // Pad voicing (semitones above the root)
  private static readonly CALM_VOICING = [0, 7, 16];
  private static readonly STORM_VOICING = [0, 7, 15];
  // Bell scale: major pentatonic
  private static readonly PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

  /** Must be called inside a user gesture (boat-select click qualifies). */
  start(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.effectiveGain();
    this.master.connect(this.ctx.destination);

    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.master);

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.padFilter);
      osc.start();
      this.padOscs.push(osc);
      this.padGains.push(gain);
    }

    // Low danger pulse (silent until a battleship is near)
    const pulse = this.ctx.createOscillator();
    pulse.type = 'sine';
    pulse.frequency.value = 55;
    this.pulseGain = this.ctx.createGain();
    this.pulseGain.gain.value = 0;
    pulse.connect(this.pulseGain);
    this.pulseGain.connect(this.master);
    pulse.start();

    this.applyChord(true);
  }

  /** Her gift: the mermaid's phrase recurs in the soundtrack, forever. */
  enableMermaidMotif(): void {
    this.mermaidMotif = true;
  }

  /** Mood comes from the engine at ~2Hz; cheap to call. */
  setMood(storm: number, night: boolean, danger: boolean): void {
    this.storm = storm;
    this.night = night;
    this.danger = danger;
    if (this.ctx && this.padFilter) {
      // Storm darkens the pad
      this.padFilter.frequency.setTargetAtTime(900 - storm * 620, this.ctx.currentTime, 0.8);
    }
  }

  /** Advance timers — called every frame with dt so pause stops the music. */
  update(dt: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;

    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordTimer = 22 + Math.random() * 14;
      this.chordIndex++;
      this.applyChord(false);
    }

    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      const base = this.storm > 0.5 ? 9 : this.night ? 7 : 4.5;
      this.noteTimer = base + Math.random() * base;
      this.playBell();
    }

    if (this.mermaidMotif) {
      this.motifTimer -= dt;
      if (this.motifTimer <= 0) {
        this.motifTimer = 50 + Math.random() * 30;
        this.playMermaidMotif();
      }
    }

    if (this.pulseGain) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 1.1;
        if (this.danger && !this.muted) {
          const now = this.ctx.currentTime;
          this.pulseGain.gain.setTargetAtTime(0.05, now, 0.05);
          this.pulseGain.gain.setTargetAtTime(0, now + 0.35, 0.2);
        }
      }
    }
  }

  private currentRoot(): number {
    const roots = this.storm > 0.5 ? GenerativeMusic.STORM_ROOTS : GenerativeMusic.CALM_ROOTS;
    return roots[this.chordIndex % roots.length];
  }

  private applyChord(immediate: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const root = this.currentRoot();
    const voicing = this.storm > 0.5 ? GenerativeMusic.STORM_VOICING : GenerativeMusic.CALM_VOICING;
    for (let i = 0; i < this.padOscs.length; i++) {
      const freq = GenerativeMusic.BASE * Math.pow(2, (root + voicing[i]) / 12);
      // ±2 cents of drift keeps the pad alive
      const drifted = freq * (1 + (Math.random() - 0.5) * 0.0023);
      this.padOscs[i].frequency.setTargetAtTime(drifted, now, immediate ? 0.01 : 4.0);
      this.padGains[i].gain.setTargetAtTime(0.05 - i * 0.012, now, immediate ? 0.5 : 4.0);
    }
  }

  /** Four rising notes over the current root — her signature, in bell voice. */
  private playMermaidMotif(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const root = this.currentRoot();
    const steps = [16, 19, 21, 24]; // E–G–A–C above the root, octave up
    for (let i = 0; i < steps.length; i++) {
      const freq = GenerativeMusic.BASE * Math.pow(2, (root + steps[i] + 12) / 12);
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const at = now + i * 0.5;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.05, at + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + 4);
    }
  }

  private playBell(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const scale = GenerativeMusic.PENTATONIC;
    const step = scale[Math.floor(Math.random() * scale.length)];
    const octave = this.night ? 36 : 24; // night bells ring higher
    const freq = GenerativeMusic.BASE * Math.pow(2, (this.currentRoot() + step + octave) / 12);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.night ? 0.045 : 0.07, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 5);
  }

  // ── Volume / lifecycle plumbing (mirrors the other audio engines) ──

  private effectiveGain(): number {
    return this.muted ? 0 : this.userVolume * GenerativeMusic.GAIN_SCALE;
  }

  setMasterVolume(v: number): void {
    this.userVolume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.effectiveGain(), this.ctx.currentTime, 0.1);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  stop(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.padFilter = null;
      this.padOscs = [];
      this.padGains = [];
      this.pulseGain = null;
    }
  }
}
