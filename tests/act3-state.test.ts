import { describe, it, expect } from 'vitest';
import {
  newCampaign,
  loadCampaign,
  saveCampaign,
  savedOrderFor,
  type CampaignState,
} from '../src/state/CampaignState';

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

const act2CompleteSave = (extra: object = {}) =>
  memStorage({
    'tb-story': JSON.stringify({
      started: true,
      beat: 16,
      armedBeat: null,
      completed: ['empty-berth', 'drowned-choir', 'drowned-light'],
      unlockedBoats: ['Tugboat', 'Submarine'],
      flags: { mercy: true, deepRefit: true },
      fates: { soul_lampkeeper: 'saved', survivor_wife: 'saved', soul_deckhand: 'kept' },
      lastBoat: 'Submarine',
      ...extra,
    }),
  });

describe('Act 3 state: keeper sanitizer', () => {
  it('new campaigns start with no keeper and empty savedOrder', () => {
    const s = newCampaign();
    expect(s.keeper).toBeNull();
    expect(s.savedOrder).toEqual([]);
  });

  it('accepts leviathan and sealed keepers', () => {
    expect(loadCampaign(act2CompleteSave({ keeper: { kind: 'leviathan' } }))!.keeper).toEqual({
      kind: 'leviathan',
    });
    expect(loadCampaign(act2CompleteSave({ keeper: { kind: 'sealed' } }))!.keeper).toEqual({
      kind: 'sealed',
    });
  });

  it('accepts a soul keeper only if that soul was actually saved', () => {
    const ok = loadCampaign(
      act2CompleteSave({ keeper: { kind: 'soul', soulId: 'survivor_wife' } }),
    );
    expect(ok!.keeper).toEqual({ kind: 'soul', soulId: 'survivor_wife' });
    // Tomas was kept, not saved — a plausible id that must be rejected.
    const bad = loadCampaign(
      act2CompleteSave({ keeper: { kind: 'soul', soulId: 'soul_deckhand' } }),
    );
    expect(bad!.keeper).toBeNull();
  });

  it('rejects junk keepers to null', () => {
    expect(loadCampaign(act2CompleteSave({ keeper: 'leviathan' }))!.keeper).toBeNull();
    expect(loadCampaign(act2CompleteSave({ keeper: { kind: 'kraken' } }))!.keeper).toBeNull();
  });
});

describe('Act 3 state: savedOrder + savedOrderFor', () => {
  it('sanitizes savedOrder: dedupes and drops unsaved/unknown souls', () => {
    const s = loadCampaign(
      act2CompleteSave({
        savedOrder: ['soul_lampkeeper', 'soul_lampkeeper', 'soul_deckhand', 'nonsense', 'survivor_wife'],
      }),
    );
    expect(s!.savedOrder).toEqual(['soul_lampkeeper', 'survivor_wife']);
    expect(savedOrderFor(s!)).toEqual(['soul_lampkeeper', 'survivor_wife']);
  });

  it('derives from fates insertion order when savedOrder is absent (older saves)', () => {
    const s = loadCampaign(act2CompleteSave());
    expect(s!.savedOrder).toEqual([]);
    // fates order in the fixture: lampkeeper first, then wife; deckhand kept.
    expect(savedOrderFor(s!)).toEqual(['soul_lampkeeper', 'survivor_wife']);
  });

  it('returns empty for a save with no saved souls (the zero edge)', () => {
    const s = loadCampaign(act2CompleteSave({ fates: {}, savedOrder: [] }));
    expect(savedOrderFor(s!)).toEqual([]);
  });

  it('savedOrder round-trips through save/load', () => {
    const storage = memStorage();
    const s: CampaignState = {
      ...newCampaign(),
      fates: { survivor_wife: 'saved' },
      savedOrder: ['survivor_wife'],
    };
    saveCampaign(s, storage);
    expect(loadCampaign(storage)!.savedOrder).toEqual(['survivor_wife']);
  });
});

describe('Act 3 state: act2complete derivation', () => {
  it('derives the flag for older finished saves that lack it', () => {
    const s = loadCampaign(act2CompleteSave()); // fixture has no act2complete flag
    expect(s!.flags.act2complete).toBe(true);
  });

  it('does not invent it for unfinished saves', () => {
    const s = loadCampaign(
      act2CompleteSave({ completed: ['empty-berth'], beat: 4 }),
    );
    expect(s!.flags.act2complete).toBeUndefined();
  });
});
