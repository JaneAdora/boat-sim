import { describe, it, expect } from 'vitest';
import { MultiPickup } from '../src/state/MultiPickup';
import { SoulTransport } from '../src/state/SoulTransport';

const SALVAGE = ['salvage_plating', 'salvage_viewport', 'salvage_gauges'];
const SOULS = ['survivor_wife', 'soul_lampkeeper', 'soul_deckhand'];

describe('MultiPickup (beat 11)', () => {
  it('collects each id exactly once', () => {
    const m = new MultiPickup(SALVAGE);
    expect(m.collect('salvage_plating')).toBe(true);
    expect(m.collect('salvage_plating')).toBe(false); // duplicate rejected
    expect(m.isCollected('salvage_plating')).toBe(true);
    expect(m.allCollected()).toBe(false);
  });

  it('rejects unknown ids', () => {
    const m = new MultiPickup(SALVAGE);
    expect(m.collect('salvage_gold')).toBe(false);
    expect(m.remaining()).toHaveLength(3);
  });

  it('completes when all three are collected, in any order', () => {
    const m = new MultiPickup(SALVAGE);
    m.collect('salvage_gauges');
    m.collect('salvage_plating');
    expect(m.allCollected()).toBe(false);
    m.collect('salvage_viewport');
    expect(m.allCollected()).toBe(true);
    expect(m.remaining()).toEqual([]);
  });

  it('hydrates from flags, ignoring junk, idempotently', () => {
    const m = new MultiPickup(SALVAGE);
    m.hydrate(['salvage_viewport', 'bogus', 'salvage_viewport']);
    expect(m.isCollected('salvage_viewport')).toBe(true);
    expect(m.remaining()).toEqual(['salvage_plating', 'salvage_gauges']);
    m.hydrate(['salvage_viewport']); // again — no change
    expect(m.remaining()).toHaveLength(2);
  });
});

describe('SoulTransport (beat 13)', () => {
  it('runs the intended two-trip story', () => {
    const s = new SoulTransport(SOULS);
    expect(s.pickup('survivor_wife')).toBe(true);
    expect(s.carrying()).toBe('survivor_wife');
    expect(s.deliver()).toBe('survivor_wife');
    expect(s.deliveriesDone()).toBe(1);
    expect(s.complete()).toBe(false);

    expect(s.pickup('soul_lampkeeper')).toBe(true);
    expect(s.deliver()).toBe('soul_lampkeeper');
    expect(s.complete()).toBe(true);
    expect(s.keptSouls()).toEqual(['soul_deckhand']); // the sea keeps Tomas
  });

  it('carries one soul at a time', () => {
    const s = new SoulTransport(SOULS);
    s.pickup('survivor_wife');
    expect(s.pickup('soul_lampkeeper')).toBe(false); // hands full
    expect(s.canPickup('soul_lampkeeper')).toBe(false);
  });

  it('rejects unknown, delivered, and post-completion pickups', () => {
    const s = new SoulTransport(SOULS);
    expect(s.pickup('barnacle_bill')).toBe(false);
    s.pickup('survivor_wife');
    s.deliver();
    expect(s.pickup('survivor_wife')).toBe(false); // already safe
    s.pickup('soul_deckhand');
    s.deliver();
    expect(s.complete()).toBe(true);
    expect(s.pickup('soul_lampkeeper')).toBe(false); // trips exhausted
    expect(s.keptSouls()).toEqual(['soul_lampkeeper']);
  });

  it('deliver without a carry is a null no-op', () => {
    const s = new SoulTransport(SOULS);
    expect(s.deliver()).toBeNull();
    expect(s.deliveriesDone()).toBe(0);
  });

  it('hydration restores deliveries and always discards the carry', () => {
    const s = new SoulTransport(SOULS);
    s.pickup('soul_deckhand'); // in-flight when the "reload" happens
    s.hydrate(['survivor_wife', 'survivor_wife', 'nonsense']);
    expect(s.carrying()).toBeNull(); // carry discarded by design
    expect(s.deliveriesDone()).toBe(1); // deduped, junk dropped
    expect(s.complete()).toBe(false);
    expect(s.canPickup('soul_deckhand')).toBe(true); // free to try again
  });

  it('discardCarry models the reload mid-carry', () => {
    const s = new SoulTransport(SOULS);
    s.pickup('survivor_wife');
    s.discardCarry();
    expect(s.carrying()).toBeNull();
    expect(s.deliveriesDone()).toBe(0);
    expect(s.canPickup('survivor_wife')).toBe(true); // she's back at the hamlet
  });
});
