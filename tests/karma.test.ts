import { describe, expect, it } from 'vitest';
import { addKarma, getKarma, karmaPriceFactor, karmaTitle, KARMA_MAX, KARMA_MIN } from '../src/state/Karma';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe('karma ledger', () => {
  it('starts neutral and accumulates both directions', () => {
    const s = fakeStorage();
    expect(getKarma(s)).toBe(0);
    expect(addKarma(15, s)).toBe(15);
    expect(addKarma(-25, s)).toBe(-10);
    expect(getKarma(s)).toBe(-10);
  });

  it('clamps to the ledger bounds', () => {
    const s = fakeStorage();
    addKarma(-5000, s);
    expect(getKarma(s)).toBe(KARMA_MIN);
    addKarma(5000, s);
    expect(getKarma(s)).toBe(KARMA_MAX);
  });

  it('treats corrupt storage as neutral', () => {
    const s = fakeStorage();
    s.setItem('tb-karma', 'barnacles');
    expect(getKarma(s)).toBe(0);
  });

  it('maps karma to titles at the spec thresholds', () => {
    expect(karmaTitle(-100)).toBe('Terror of the Tides');
    expect(karmaTitle(-60)).toBe('Terror of the Tides');
    expect(karmaTitle(-59)).toBe('Outlaw');
    expect(karmaTitle(-25)).toBe('Outlaw');
    expect(karmaTitle(-24)).toBe('Drifter');
    expect(karmaTitle(0)).toBe('Drifter');
    expect(karmaTitle(24)).toBe('Drifter');
    expect(karmaTitle(25)).toBe('Good Samaritan');
    expect(karmaTitle(59)).toBe('Good Samaritan');
    expect(karmaTitle(60)).toBe('Guardian of the Sea');
    expect(karmaTitle(100)).toBe('Guardian of the Sea');
  });

  it('prices the shipyard by reputation', () => {
    expect(karmaPriceFactor(0)).toBe(1);
    expect(karmaPriceFactor(-30)).toBe(1.15);
    expect(karmaPriceFactor(-70)).toBe(1.3);
    expect(karmaPriceFactor(30)).toBe(0.95);
    expect(karmaPriceFactor(70)).toBe(0.9);
  });
});
