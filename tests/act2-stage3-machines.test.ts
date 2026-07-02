import { describe, it, expect } from 'vitest';
import { HoldTimer } from '../src/state/HoldTimer';
import { RescueSequence } from '../src/state/RescueSequence';

describe('HoldTimer (beat 14)', () => {
  it('accumulates only while inside and completes at the required time', () => {
    const h = new HoldTimer(60);
    expect(h.step(30, true)).toBe(false);
    expect(h.elapsed()).toBe(30);
    expect(h.step(29.9, true)).toBe(false);
    expect(h.step(0.1, true)).toBe(true); // exact boundary
    expect(h.complete()).toBe(true);
  });

  it('leaving pauses — never resets', () => {
    const h = new HoldTimer(60);
    h.step(40, true);
    h.step(500, false); // wander off for a long time
    expect(h.elapsed()).toBe(40); // progress intact
    expect(h.step(20, true)).toBe(true);
  });

  it('dt overshoot completes cleanly and clamps', () => {
    const h = new HoldTimer(60);
    expect(h.step(1000, true)).toBe(true);
    expect(h.elapsed()).toBe(60);
    expect(h.progress()).toBe(1);
  });

  it('reset models the reload', () => {
    const h = new HoldTimer(60);
    h.step(59, true);
    h.reset();
    expect(h.elapsed()).toBe(0);
    expect(h.step(59.9, true)).toBe(false);
  });

  it('progress reports the feedback fraction', () => {
    const h = new HoldTimer(90); // the slain branch is longer
    h.step(45, true);
    expect(h.progress()).toBeCloseTo(0.5, 9);
  });
});

describe('RescueSequence (beat 15)', () => {
  it('runs three stages strictly in order', () => {
    const r = new RescueSequence(3);
    expect(r.currentStage()).toBe(0);
    expect(r.completeStage(1)).toBe(false); // skipping rejected
    expect(r.completeStage(0)).toBe(true);
    expect(r.completeStage(0)).toBe(false); // repeat rejected
    expect(r.currentStage()).toBe(1);
    r.completeStage(1);
    expect(r.complete()).toBe(false);
    r.completeStage(2);
    expect(r.complete()).toBe(true);
    expect(r.currentStage()).toBeNull();
    expect(r.completedCount()).toBe(3);
  });

  it('hydrates a completed prefix from sparse flags', () => {
    const r = new RescueSequence(3);
    r.hydrate([true, true, false]);
    expect(r.currentStage()).toBe(2);
    expect(r.completedCount()).toBe(2);
  });

  it('a gap ends the prefix — stale later flags are ignored', () => {
    const r = new RescueSequence(3);
    r.hydrate([true, false, true]); // stage 3 flag without stage 2 is invalid
    expect(r.currentStage()).toBe(1);
    expect(r.completedCount()).toBe(1);
  });

  it('hydrate is idempotent and resets stale state', () => {
    const r = new RescueSequence(3);
    r.completeStage(0);
    r.hydrate([]);
    expect(r.currentStage()).toBe(0); // fresh, per the (empty) flags
  });
});
