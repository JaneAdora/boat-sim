import { describe, expect, it } from 'vitest';
import {
  FISH, pickSpecies, speciesEligible, rollValue,
  newFight, reelTap, fightDecay, fightOutcome,
  recordCatch, loadLedger, hasRod, buyRod, ledgerCount,
} from '../src/state/Fishing';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const marlin = FISH.find((f) => f.id === 'marlin')!;
const mackerel = FISH.find((f) => f.id === 'mackerel')!;

/** Simulate a fight: tap every `gapMs`, decaying between taps. */
function simulate(species: typeof FISH[number], hasRod: boolean, gapMs: number): string {
  let s = newFight();
  for (let i = 0; i < 200; i++) {
    s = reelTap(s, species, hasRod);
    let out = fightOutcome(s);
    if (out !== 'fighting') return out;
    s = fightDecay(s, gapMs / 1000);
    out = fightOutcome(s);
    if (out !== 'fighting') return out;
  }
  return 'timeout';
}

describe('fishing — species table', () => {
  it('only surfaces the Thunder Marlin in a storm', () => {
    const stormCtx = { biome: 'open' as const, night: false, storm: true };
    const calmCtx = { biome: 'open' as const, night: false, storm: false };
    expect(speciesEligible(marlin, stormCtx)).toBe(true);
    expect(speciesEligible(marlin, calmCtx)).toBe(false);
  });

  it('never yields a night-only fish by day', () => {
    const dayCtx = { biome: 'open' as const, night: false, storm: false };
    for (let r = 0; r < 50; r++) {
      const picked = pickSpecies(dayCtx, () => r / 50);
      expect(picked.time).not.toBe('night');
    }
  });

  it('always has an eligible common, in every condition', () => {
    for (const biome of ['open', 'tropical', 'rocky', 'autumn', 'desert'] as const) {
      for (const night of [false, true]) {
        for (const storm of [false, true]) {
          const ctx = { biome, night, storm };
          expect(FISH.some((s) => speciesEligible(s, ctx))).toBe(true);
          expect(() => pickSpecies(ctx, () => 0.99)).not.toThrow();
        }
      }
    }
  });

  it('picks deterministically from the 0..1 source', () => {
    const ctx = { biome: 'open' as const, night: false, storm: false };
    expect(pickSpecies(ctx, () => 0).id).toBe(pickSpecies(ctx, () => 0).id);
    expect(rollValue(mackerel, () => 0)).toBe(mackerel.value[0]);
    expect(rollValue(mackerel, () => 1)).toBe(mackerel.value[1]);
  });
});

describe('fishing — the fight', () => {
  it('lands a common fish with steady reeling', () => {
    expect(simulate(mackerel, false, 250)).toBe('landed');
  });

  it('snaps the bare rod on a marlin but lands it with the Angler\'s Rod', () => {
    // Reeling a marlin hard on the bare line should snap it...
    expect(simulate(marlin, false, 120)).toBe('snapped');
    // ...but the rod's tension relief makes the same fight winnable.
    expect(simulate(marlin, true, 600)).toBe('landed');
  });

  it('lets tension bleed off when you pause', () => {
    let s = newFight();
    s = reelTap(s, marlin, false);
    const peak = s.tension;
    s = fightDecay(s, 1.0);
    expect(s.tension).toBeLessThan(peak);
  });
});

describe('fishing — the ledger', () => {
  it('records first-ever and first-of-species, keeps best weight', () => {
    const st = new MemoryStorage();
    expect(recordCatch('cod', 4.2, st)).toEqual({ firstEver: true, firstOfSpecies: true });
    expect(recordCatch('cod', 2.0, st)).toEqual({ firstEver: false, firstOfSpecies: false });
    expect(loadLedger(st).caught.cod).toBe(4.2); // best weight kept
    expect(recordCatch('mahi', 9.1, st)).toEqual({ firstEver: false, firstOfSpecies: true });
    expect(ledgerCount(st)).toBe(2);
  });

  it('persists the rod and tolerates corrupt storage', () => {
    const st = new MemoryStorage();
    expect(hasRod(st)).toBe(false);
    buyRod(st);
    expect(hasRod(st)).toBe(true);
    st.setItem('tb-fishing', '{broken');
    expect(loadLedger(st).caught).toEqual({});
    expect(hasRod(st)).toBe(false);
  });
});
