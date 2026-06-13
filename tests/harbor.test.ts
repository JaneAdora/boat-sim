import { describe, expect, it } from 'vitest';
import {
  harborEligible, dockmasterName, dockGreeting, tavernRumor,
  HARBOR_MIN_RADIUS, ROD_COST,
} from '../src/state/Harbor';
import { islandName } from '../src/world/IslandNames';

describe('harborEligible', () => {
  it('rejects islands at or below the minimum radius regardless of hash', () => {
    for (let cx = 0; cx < 40; cx++) {
      for (let cz = 0; cz < 4; cz++) {
        expect(harborEligible(HARBOR_MIN_RADIUS, cx, cz)).toBe(false);
        expect(harborEligible(HARBOR_MIN_RADIUS - 10, cx, cz)).toBe(false);
      }
    }
  });

  it('is deterministic for the same coordinates', () => {
    for (let i = 0; i < 50; i++) {
      const a = harborEligible(80, i, i * 3);
      const b = harborEligible(80, i, i * 3);
      expect(a).toBe(b);
    }
  });

  it('splits big islands into roughly half harbours (hash is not degenerate)', () => {
    let yes = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      if (harborEligible(80, i % 20, Math.floor(i / 20))) yes++;
    }
    // chunkHash(...,21) < 0.5 → expect close to half, allow a wide band.
    expect(yes).toBeGreaterThan(N * 0.3);
    expect(yes).toBeLessThan(N * 0.7);
  });
});

describe('dockmasterName', () => {
  it('returns the same name for the same island every time', () => {
    expect(dockmasterName(3, 7)).toBe(dockmasterName(3, 7));
  });

  it('draws different names across different islands', () => {
    const names = new Set<string>();
    for (let cx = 0; cx < 8; cx++) {
      for (let cz = 0; cz < 8; cz++) names.add(dockmasterName(cx, cz));
    }
    // The 16-name pool should yield real variety over 64 islands.
    expect(names.size).toBeGreaterThan(6);
  });
});

describe('dockGreeting', () => {
  it('names both the harbour-master and the island, deterministically', () => {
    const greeting = dockGreeting(5, 9, 'tropical');
    expect(greeting).toContain(dockmasterName(5, 9));
    expect(greeting).toContain(islandName(5, 9, 'tropical'));
    expect(dockGreeting(5, 9, 'tropical')).toBe(greeting);
  });
});

describe('tavernRumor', () => {
  it('returns a stable, non-empty rumour per island', () => {
    const r = tavernRumor(2, 11);
    expect(r.length).toBeGreaterThan(10);
    expect(tavernRumor(2, 11)).toBe(r);
  });

  it('surfaces more than one distinct rumour across islands', () => {
    const seen = new Set<string>();
    for (let cx = 0; cx < 10; cx++) {
      for (let cz = 0; cz < 10; cz++) seen.add(tavernRumor(cx, cz));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('ROD_COST', () => {
  it('is the agreed 200 credits', () => {
    expect(ROD_COST).toBe(200);
  });
});
