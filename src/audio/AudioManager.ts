import { Howl, Howler } from 'howler';

export class AudioManager {
  private sounds = new Map<string, Howl>();
  private initialized = false;
  private muted = false;

  constructor() {
    // Resume AudioContext on first user interaction (browser autoplay policy)
    const resume = () => {
      if (!this.initialized) {
        Howler.ctx?.resume();
        this.initialized = true;
      }
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  /**
   * Create and register a looping ambient sound.
   * Returns immediately — the sound is loaded asynchronously.
   */
  createLoop(name: string, src: string, volume: number = 0.5): Howl {
    const howl = new Howl({
      src: [src],
      loop: true,
      volume,
      preload: true,
    });
    this.sounds.set(name, howl);
    return howl;
  }

  /**
   * Create a one-shot sound effect.
   */
  createEffect(name: string, src: string, volume: number = 0.5): Howl {
    const howl = new Howl({
      src: [src],
      volume,
      preload: true,
    });
    this.sounds.set(name, howl);
    return howl;
  }

  get(name: string): Howl | undefined {
    return this.sounds.get(name);
  }

  setVolume(name: string, volume: number): void {
    this.sounds.get(name)?.volume(volume);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
