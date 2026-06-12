/**
 * The mermaid's song — a synthesized voice you navigate by.
 *
 * A slow A-minor-pentatonic line with vibrato and long releases, through a
 * StereoPanner driven by her bearing off your bow and a gain driven by
 * distance. No waypoint marks her; the panning is the quest.
 */
export class MermaidSong {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private distanceGain: GainNode | null = null;

  private muted = false;
  private userVolume = 0.5;
  private static readonly GAIN_SCALE = 0.55; // she carries over the soundscape

  private noteTimer = 0.5;
  private phraseStep = 0;

  // A4 minor pentatonic, voice-like register
  private static readonly NOTES = [440, 523.25, 587.33, 659.25, 783.99, 880];
  // Phrases lean on contour, not randomness — she's singing, not noodling
  private static readonly PHRASE = [0, 2, 3, 2, 4, 3, 5, 3];

  start(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.effectiveGain();
    this.master.connect(this.ctx.destination);

    this.panner = this.ctx.createStereoPanner();
    this.distanceGain = this.ctx.createGain();
    this.distanceGain.gain.value = 0;
    this.distanceGain.connect(this.panner);
    this.panner.connect(this.master);
  }

  /** Steer the voice: pan ∈ [−1, 1], closeness ∈ [0, 1]. */
  setListener(pan: number, closeness: number): void {
    if (!this.ctx || !this.panner || !this.distanceGain) return;
    const now = this.ctx.currentTime;
    this.panner.pan.setTargetAtTime(pan, now, 0.15);
    // Square the falloff — she stays faint until you commit to the hunt
    this.distanceGain.gain.setTargetAtTime(closeness * closeness, now, 0.25);
  }

  /** Advance the melody; called per frame so pausing pauses her too. */
  update(dt: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      this.noteTimer = 1.7 + Math.random() * 0.9;
      this.sing(MermaidSong.NOTES[MermaidSong.PHRASE[this.phraseStep]]);
      this.phraseStep = (this.phraseStep + 1) % MermaidSong.PHRASE.length;
    }
  }

  private sing(freq: number): void {
    if (!this.ctx || !this.distanceGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Vibrato — the breath in the voice
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = freq * 0.004;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.16, now + 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    // A faint octave above — the shimmer that says "not human"
    const shimmer = this.ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const shimmerEnv = this.ctx.createGain();
    shimmerEnv.gain.setValueAtTime(0, now);
    shimmerEnv.gain.linearRampToValueAtTime(0.035, now + 0.7);
    shimmerEnv.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(env);
    env.connect(this.distanceGain);
    shimmer.connect(shimmerEnv);
    shimmerEnv.connect(this.distanceGain);
    osc.start(now);
    osc.stop(now + 3.6);
    lfo.start(now);
    lfo.stop(now + 3.6);
    shimmer.start(now);
    shimmer.stop(now + 3);
  }

  // ── Volume / lifecycle plumbing (mirrors the other audio engines) ──

  private effectiveGain(): number {
    return this.muted ? 0 : this.userVolume * MermaidSong.GAIN_SCALE;
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
      this.panner = null;
      this.distanceGain = null;
    }
  }
}
