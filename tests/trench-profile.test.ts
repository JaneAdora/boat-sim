import { describe, it, expect } from 'vitest';
import { TRENCH, floorAt, inTrench, trenchDist, depthT, inBand } from '../src/world/TrenchProfile';

const cx = TRENCH.centerX;
const cz = TRENCH.centerZ;

describe('TrenchProfile: floorAt', () => {
  it('is the deep floor everywhere inside the core radius', () => {
    expect(floorAt(cx, cz)).toBe(TRENCH.deepFloor);
    expect(floorAt(cx + TRENCH.radius - 1, cz)).toBe(TRENCH.deepFloor);
  });

  it('is the standard floor beyond the shelf', () => {
    expect(floorAt(cx + TRENCH.radius + TRENCH.shelf, cz)).toBe(TRENCH.standardFloor);
    expect(floorAt(cx + 5000, cz)).toBe(TRENCH.standardFloor);
    expect(floorAt(0, 0)).toBe(TRENCH.standardFloor); // Greyharbor water is Act 1's
  });

  it('blends monotonically across the shelf (no snap, no overshoot)', () => {
    let prev = TRENCH.deepFloor;
    for (let i = 0; i <= 20; i++) {
      const d = TRENCH.radius + (TRENCH.shelf * i) / 20;
      const f = floorAt(cx + d, cz);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9); // shallower or equal as we exit
      expect(f).toBeGreaterThanOrEqual(TRENCH.deepFloor);
      expect(f).toBeLessThanOrEqual(TRENCH.standardFloor);
      prev = f;
    }
  });

  it('shelf endpoints meet the plateaus exactly', () => {
    expect(floorAt(cx + TRENCH.radius, cz)).toBeCloseTo(TRENCH.deepFloor, 6);
    expect(floorAt(cx + TRENCH.radius + TRENCH.shelf, cz)).toBeCloseTo(TRENCH.standardFloor, 6);
  });
});

describe('TrenchProfile: predicates and bands', () => {
  it('inTrench matches the core radius boundary', () => {
    expect(inTrench(cx, cz)).toBe(true);
    expect(inTrench(cx + TRENCH.radius, cz)).toBe(true);
    expect(inTrench(cx + TRENCH.radius + 0.001, cz)).toBe(false);
  });

  it('trenchDist is planar distance from center', () => {
    expect(trenchDist(cx, cz)).toBe(0);
    expect(trenchDist(cx + 30, cz + 40)).toBeCloseTo(50, 9);
  });

  it('content depths sit within their bands and above the floor', () => {
    expect(TRENCH.ledgeDepth).toBeGreaterThan(TRENCH.deepFloor);
    expect(TRENCH.hamletDepth).toBeGreaterThan(TRENCH.deepFloor);
    expect(inBand(TRENCH.ledgeDepth, TRENCH.contactBand)).toBe(true);
    expect(inBand(TRENCH.hamletDepth, TRENCH.pickupBand)).toBe(true);
  });

  it('inBand honors exact boundaries', () => {
    expect(inBand(-50, TRENCH.contactBand)).toBe(true);
    expect(inBand(-49.999, TRENCH.contactBand)).toBe(false);
    expect(inBand(-80, TRENCH.contactBand)).toBe(true);
    expect(inBand(-80.001, TRENCH.contactBand)).toBe(false);
  });

  it('depthT is 0 at surface, 1 at the local floor, clamped', () => {
    expect(depthT(cx, cz, 0)).toBe(0);
    expect(depthT(cx, cz, 5)).toBe(0);
    expect(depthT(cx, cz, TRENCH.deepFloor)).toBe(1);
    expect(depthT(cx, cz, TRENCH.deepFloor - 10)).toBe(1);
    const mid = depthT(cx, cz, TRENCH.deepFloor / 2);
    expect(mid).toBeCloseTo(0.5, 9);
  });
});

// ── Act 3: depth eras ──
import { TRENCH_ACT3, setEra, currentEra, fadeParams, bandReachable } from '../src/world/TrenchProfile';
import { afterEach } from 'vitest';

describe('TrenchProfile: eras (Act 3)', () => {
  afterEach(() => setEra('act2')); // never leak the deep era into other tests

  it('defaults to act2 and act2 values are the shipped constants, frozen', () => {
    expect(currentEra()).toBe('act2');
    expect(TRENCH.deepFloor).toBe(-80);
    expect(TRENCH.standardFloor).toBe(-35);
    expect(TRENCH.radius).toBe(140);
    expect(TRENCH.shelf).toBe(80);
    expect(fadeParams()).toEqual({ start: 28, range: 30 }); // Underwater's shipped literals
    expect(floorAt(cx, cz)).toBe(-80); // byte-identical Act 2 behavior
  });

  it('act3 deepens the core; outside stays the standard world', () => {
    setEra('act3');
    expect(floorAt(cx, cz)).toBe(TRENCH_ACT3.deepFloor);
    expect(TRENCH_ACT3.deepFloor).toBe(-105);
    expect(floorAt(cx + 5000, cz)).toBe(TRENCH.standardFloor); // Greyharbor untouched
    expect(fadeParams()).toEqual({ start: 28, range: 45 });
  });

  it('switching back restores act2 exactly', () => {
    setEra('act3');
    setEra('act2');
    expect(floorAt(cx, cz)).toBe(-80);
    expect(fadeParams().range).toBe(30);
  });

  it('bandReachable enforces the reachability invariant', () => {
    // act2: the heart band's bottom (−105) is NOT reachable
    expect(bandReachable(cx, cz, TRENCH_ACT3.heartBand)).toBe(false);
    setEra('act3');
    expect(bandReachable(cx, cz, TRENCH_ACT3.heartBand)).toBe(true);
    // and never reachable outside the core, in any era
    expect(bandReachable(cx + 5000, cz, TRENCH_ACT3.heartBand)).toBe(false);
    expect(bandReachable(cx, cz, { min: -40, max: -10 })).toBe(true); // shallow band fine anywhere deep
  });
});
