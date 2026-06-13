import * as THREE from 'three';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';
import {
  FishSpecies, FishBiome, CatchContext, FightState,
  pickSpecies, rollValue, newFight, reelTap, fightDecay, fightOutcome,
  recordCatch, hasRod,
} from '../state/Fishing';

export interface FishingCallbacks {
  /** Prompt/feedback banner (null clears). */
  onPrompt: (text: string | null) => void;
  /** Show the catch/tension bars (null hides). */
  onMeter: (state: FightState | null) => void;
  /** Fish landed — value banked; engine handles credits, ledger toast, journal.
   *  `firstOfSpecies` flows from the ledger write done here, so the engine
   *  doesn't re-record (which would clobber the first-catch detection). */
  onLanded: (species: FishSpecies, value: number, weight: number, firstOfSpecies: boolean) => void;
}

type Phase = 'idle' | 'waiting' | 'bite' | 'fighting';

const CAST_MAX_SPEED = 2.5;
const BITE_WINDOW = 1.8;
const CAST_RANGE = 6;

/**
 * Fishing — the calm verb. Cast when stopped over open water, wait for the
 * bobber to dip, set the hook, then win the tension fight by rhythm. The
 * bobber rides the real wave surface; the species depends on where, when,
 * and the weather. All the math lives in pure functions in state/Fishing;
 * this drives the state machine, the bobber mesh, and the prompts.
 */
export class FishingSystem {
  private phase: Phase = 'idle';
  private bobber: THREE.Group | null = null;
  private timer = 0;
  private species: FishSpecies | null = null;
  private fight: FightState = newFight();
  private time = 0;
  private rng = 0.123; // advanced per use; varied so casts differ within a session

  private castRequested = false;
  private reelRequested = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyC' || e.repeat) return;
    // One key, two intents: cast/cancel when not fighting, reel when fighting
    if (this.phase === 'fighting' || this.phase === 'bite') this.reelRequested = true;
    else this.castRequested = true;
  };

  constructor(
    private scene: THREE.Scene,
    private ocean: Ocean,
    private chunkManager: ChunkManager,
    private storage: Storage,
    private callbacks: FishingCallbacks,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.clearBobber();
  }

  isActive(): boolean {
    return this.phase !== 'idle';
  }

  private rand = (): number => {
    // Cheap LCG-ish hash so casts vary without Math.random in tests' way
    this.rng = (this.rng * 9301 + 0.49297) % 1;
    return this.rng;
  };

  update(dt: number, boatX: number, boatZ: number, boatSpeed: number, night: boolean, storm: boolean): void {
    this.time += dt;
    const cast = this.castRequested; this.castRequested = false;
    const reel = this.reelRequested; this.reelRequested = false;

    switch (this.phase) {
      case 'idle':
        if (cast) this.tryCast(boatX, boatZ, boatSpeed, night, storm);
        break;
      case 'waiting':
        this.updateBobber();
        if (cast) { this.reelIn('Line reeled in'); break; } // cancel
        this.timer -= dt;
        if (this.timer <= 0) this.beginBite();
        break;
      case 'bite':
        this.updateBobber();
        this.timer -= dt;
        if (reel) { this.beginFight(); break; }
        if (this.timer <= 0) this.reelIn('It got away…');
        break;
      case 'fighting':
        if (reel) this.fight = reelTap(this.fight, this.species!, hasRod(this.storage));
        this.fight = fightDecay(this.fight, dt);
        this.callbacks.onMeter(this.fight);
        this.resolveFight();
        break;
    }
  }

  private tryCast(boatX: number, boatZ: number, boatSpeed: number, night: boolean, storm: boolean): void {
    if (boatSpeed > CAST_MAX_SPEED) {
      this.flash('Slow down to cast');
      return;
    }
    // Drop the bobber a few meters ahead in open water
    const x = boatX;
    const z = boatZ + CAST_RANGE;
    if (this.chunkManager.getTerrainHeight(x, z) > 0) {
      this.flash('No room to cast here');
      return;
    }

    this.species = pickSpecies(this.context(x, z, night, storm), this.rand);
    this.bobber = createBobber();
    this.bobber.position.set(x, 0, z);
    this.scene.add(this.bobber);
    this.timer = 3 + this.rand() * 8;
    this.phase = 'waiting';
    this.callbacks.onPrompt('🎣 Line cast — wait for a bite…');
  }

  private context(x: number, z: number, night: boolean, storm: boolean): CatchContext {
    let biome: FishBiome = 'open';
    let best = 220; // only count an island whose waters you're fishing
    for (const isl of this.chunkManager.getIslandPositions()) {
      const d = Math.hypot(isl.x - x, isl.z - z) - isl.radius;
      if (d < best) { best = d; biome = isl.biome; }
    }
    return { biome, night, storm };
  }

  private beginBite(): void {
    this.phase = 'bite';
    this.timer = BITE_WINDOW;
    this.callbacks.onPrompt('❗ Fish on! Press C to set the hook');
  }

  private beginFight(): void {
    this.phase = 'fighting';
    this.fight = reelTap(newFight(), this.species!, hasRod(this.storage)); // the hook-set is the first reel
    this.callbacks.onPrompt('🐟 Reel! Tap C — but watch the line');
    this.callbacks.onMeter(this.fight);
  }

  private resolveFight(): void {
    const outcome = fightOutcome(this.fight);
    if (outcome === 'fighting') return;
    if (outcome === 'landed') {
      const s = this.species!;
      const value = rollValue(s, this.rand);
      const weight = Math.round((value / 6 + this.rand() * 3) * 10) / 10; // playful kg from value
      const { firstOfSpecies } = recordCatch(s.id, weight, this.storage);
      this.callbacks.onLanded(s, value, weight, firstOfSpecies);
    } else {
      this.flash('The line snapped!');
    }
    this.endFishing();
  }

  private reelIn(message: string): void {
    this.flash(message);
    this.endFishing();
  }

  private endFishing(): void {
    this.clearBobber();
    this.species = null;
    this.phase = 'idle';
    this.callbacks.onMeter(null);
  }

  private flash(message: string): void {
    this.callbacks.onPrompt(message);
    // The engine clears the banner on the next idle frame via a short timer;
    // we just leave the message — the HUD banner auto-replaces on next prompt.
    this.clearPromptSoon();
  }

  private promptClearTimer: ReturnType<typeof setTimeout> | null = null;
  private clearPromptSoon(): void {
    if (this.promptClearTimer) clearTimeout(this.promptClearTimer);
    this.promptClearTimer = setTimeout(() => {
      if (this.phase === 'idle') this.callbacks.onPrompt(null);
    }, 2500);
  }

  private updateBobber(): void {
    if (!this.bobber) return;
    const p = this.bobber.position;
    const wave = this.ocean.getWaveHeight(p.x, p.z, this.time);
    // A dip during the bite window; otherwise it rides the surface
    const dip = this.phase === 'bite' ? -0.5 - Math.abs(Math.sin(this.time * 9)) * 0.4 : 0;
    p.y = wave + 0.25 + dip;
    this.bobber.rotation.z = Math.sin(this.time * 2.3) * 0.25;
  }

  private clearBobber(): void {
    if (!this.bobber) return;
    this.scene.remove(this.bobber);
    this.bobber.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.bobber = null;
  }
}

function createBobber(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.5 }),
  );
  top.position.y = 0.18;
  g.add(top);
  const bottom = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.5 }),
  );
  bottom.position.y = -0.05;
  g.add(bottom);
  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5),
    new THREE.MeshBasicMaterial({ color: 0x9a7448 }),
  );
  tip.position.y = 0.5;
  g.add(tip);
  return g;
}
