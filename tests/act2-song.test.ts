import { describe, it, expect } from 'vitest';
import { SongAnswer } from '../src/state/SongAnswer';

const OPTS = { radius: 25, dwellSeconds: 5, maxSpeed: 3, band: { min: -80, max: -50 } };
const mk = () => new SongAnswer(3, OPTS);
// A compliant tick: inside, in band, slow.
const good = (s: SongAnswer, dt: number) => s.step(dt, 10, -60, 2);

describe('SongAnswer (beat 16)', () => {
  it('banks a pass after an uninterrupted dwell', () => {
    const s = mk();
    expect(good(s, 4.9)).toBe(false);
    expect(good(s, 0.1)).toBe(true); // exact boundary
    expect(s.passesBanked()).toBe(1);
    expect(s.currentPoint()).toBe(1);
  });

  it('any violation resets the dwell but never the banked passes', () => {
    const s = mk();
    good(s, 5); // pass 1
    good(s, 4.5); // almost pass 2...
    s.step(1, 10, -60, 5); // too fast — dwell dies
    expect(s.lastViolation()).toBe('too-fast');
    expect(s.passesBanked()).toBe(1); // pass 1 survives
    expect(good(s, 4.9)).toBe(false); // dwell restarted from zero
    expect(good(s, 0.2)).toBe(true);
  });

  it('names each failure mode for the feedback lines', () => {
    const s = mk();
    s.step(1, 60, -60, 2);
    expect(s.lastViolation()).toBe('outside');
    s.step(1, 10, -40, 2);
    expect(s.lastViolation()).toBe('too-shallow');
    s.step(1, 10, -85, 2);
    expect(s.lastViolation()).toBe('too-deep');
    s.step(1, 10, -60, 9);
    expect(s.lastViolation()).toBe('too-fast');
    s.step(1, 10, -60, 2);
    expect(s.lastViolation()).toBe('none');
  });

  it('band and speed boundaries are exact', () => {
    const s = mk();
    s.step(1, 25, -50, 3); // all at the edge — valid
    expect(s.lastViolation()).toBe('none');
    s.step(1, 25.001, -50, 3);
    expect(s.lastViolation()).toBe('outside');
  });

  it('a single overshooting dt banks at most one pass', () => {
    const s = mk();
    expect(good(s, 500)).toBe(true);
    expect(s.passesBanked()).toBe(1); // no double-bank from one long frame
  });

  it('completes after three ordered passes and then ignores input', () => {
    const s = mk();
    good(s, 5);
    good(s, 5);
    expect(s.complete()).toBe(false);
    good(s, 5);
    expect(s.complete()).toBe(true);
    expect(s.currentPoint()).toBeNull();
    expect(good(s, 5)).toBe(false); // no fourth pass
    expect(s.passesBanked()).toBe(3);
  });

  it('reset models the reload — single-sitting finale', () => {
    const s = mk();
    good(s, 5);
    good(s, 5);
    s.reset();
    expect(s.passesBanked()).toBe(0);
    expect(s.currentPoint()).toBe(0);
  });
});
