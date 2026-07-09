import { describe, it, expect } from 'vitest';
import {
  newCampaign,
  loadCampaign,
  saveCampaign,
  normalizeOutcome,
  type CampaignState,
} from '../src/state/CampaignState';

/** Minimal in-memory Storage stub (same pattern as campaign.test.ts). */
function memStorage(seed?: Record<string, string>): Storage {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
}

const legacySave = (extra: object = {}) =>
  memStorage({
    'tb-story': JSON.stringify({
      started: true,
      beat: 8,
      armedBeat: null,
      completed: ['empty-berth'],
      unlockedBoats: ['Tugboat', 'Submarine'],
      flags: {},
      lastBoat: 'Tugboat',
      ...extra,
    }),
  });

describe('Act 2 state groundwork: fates', () => {
  it('newCampaign seeds an empty fates map', () => {
    expect(newCampaign().fates).toEqual({});
  });

  it('a pre-Act-2 save (no fates field) loads with fates {}', () => {
    const s = loadCampaign(legacySave());
    expect(s).not.toBeNull();
    expect(s!.fates).toEqual({});
  });

  it('valid fates survive a save/load round trip', () => {
    const storage = memStorage();
    const s: CampaignState = { ...newCampaign(), fates: { survivor_wife: 'saved' } };
    saveCampaign(s, storage);
    expect(loadCampaign(storage)!.fates).toEqual({ survivor_wife: 'saved' });
  });

  it('invalid fate entries are dropped individually, never the whole save', () => {
    const s = loadCampaign(
      legacySave({
        fates: {
          survivor_wife: 'saved', // valid — kept
          soul_lampkeeper: 'vaporized', // invalid value — dropped
          barnacle_bill: 'kept', // unknown soul — dropped
          soul_deckhand: 7, // wrong type — dropped
        },
      }),
    );
    expect(s).not.toBeNull();
    expect(s!.fates).toEqual({ survivor_wife: 'saved' });
    expect(s!.beat).toBe(8); // the rest of the save is intact
  });

  it('a non-object fates field loads as {}', () => {
    expect(loadCampaign(legacySave({ fates: 'oops' }))!.fates).toEqual({});
  });
});

describe('Act 2 state groundwork: outcome normalization', () => {
  it('mercy wins when both finale flags coexist', () => {
    const flags = { mercy: true, slain: true };
    normalizeOutcome(flags);
    expect(flags).toEqual({ mercy: true });
  });

  it('single flags pass through untouched', () => {
    const a = { mercy: true };
    normalizeOutcome(a);
    expect(a).toEqual({ mercy: true });
    const b = { slain: true };
    normalizeOutcome(b);
    expect(b).toEqual({ slain: true });
    const c = {};
    normalizeOutcome(c);
    expect(c).toEqual({});
  });

  it('loadCampaign normalizes a both-flags save to mercy', () => {
    const s = loadCampaign(legacySave({ flags: { mercy: true, slain: true, goodwill: true } }));
    expect(s!.flags.mercy).toBe(true);
    expect(s!.flags.slain).toBeUndefined();
    expect(s!.flags.goodwill).toBe(true); // unrelated flags untouched
  });
});
