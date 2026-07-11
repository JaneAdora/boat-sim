import { describe, it, expect, afterEach } from 'vitest';
import { STORY_BEATS, validateBeatGraph } from '../src/state/StoryBeats';
import { ACT2_BEATS } from '../src/state/StoryBeatsAct2';
import {
  ACT3_BEATS,
  ACT3_APPROACH,
  ACT3_DESCENT,
  ACT3_CLOSE,
  ACT3_SHIPPED,
  ACT3_LOCATIONS,
  keeperOptionsFor,
  keeperLineFor,
} from '../src/state/StoryBeatsAct3';
import { JOURNAL_ENTRIES } from '../src/state/JournalTracker';
import { findStoryHarbor, isOpenWater } from '../src/state/StoryHarbor';
import { TRENCH, TRENCH_ACT3, setEra, bandReachable, inBand } from '../src/world/TrenchProfile';
import { SongAnswer } from '../src/state/SongAnswer';

const KNOWN_BOATS = [
  'Tugboat',
  'Speedboat',
  'Cruise Ship',
  'Viking Ship',
  'Jet Ski',
  'Hovercraft',
  'Seaplane',
  'Submarine',
];

afterEach(() => setEra('act2'));

describe('Act 3 beat graph', () => {
  it('composes exactly from the three stage arrays, in beat order', () => {
    expect(ACT3_APPROACH).toHaveLength(3);
    expect(ACT3_DESCENT).toHaveLength(3);
    expect(ACT3_CLOSE).toHaveLength(2);
    expect(ACT3_BEATS.map((b) => b.id)).toEqual([
      'false-calm',
      'cracked-charm',
      'all-hands',
      'into-maelstrom',
      'heart-deep',
      'what-sea-asks',
      'slack-water',
      'homecoming',
    ]);
  });

  it('ids are unique across all THREE acts and the graph checks pass', () => {
    const all = [...STORY_BEATS, ...ACT2_BEATS, ...ACT3_BEATS];
    expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
    expect(validateBeatGraph(KNOWN_BOATS, all)).toEqual([]);
  });

  it('nothing ships before stage 2 (the append boundary holds)', () => {
    expect(ACT3_SHIPPED).toEqual([]);
  });

  it('exactly the descent beats (20-22) require the Submarine', () => {
    for (const b of ACT3_BEATS) {
      if (['into-maelstrom', 'heart-deep', 'what-sea-asks'].includes(b.id)) {
        expect(b.requiresBoat, b.id).toBe('Submarine');
      } else {
        expect(b.requiresBoat, b.id).toBeUndefined();
      }
    }
  });

  it('the cracked charm waits for night as data, not an id special-case', () => {
    const b = ACT3_BEATS.find((x) => x.id === 'cracked-charm')!;
    if (b.encounter.kind !== 'mermaid') throw new Error('wrong kind');
    expect(b.encounter.requiresNight).toBe(true);
  });

  it('journal keys resolve, with the-turning-tide PENDING until stage 4 ships it', () => {
    const PENDING_JOURNAL: string[] = ['the-turning-tide'];
    for (const b of ACT3_BEATS) {
      if (b.reward.journalKey) {
        const known =
          JOURNAL_ENTRIES[b.reward.journalKey] !== undefined ||
          PENDING_JOURNAL.includes(b.reward.journalKey);
        expect(known, `${b.id} journalKey ${b.reward.journalKey}`).toBe(true);
      }
    }
    for (const key of PENDING_JOURNAL) {
      expect(
        JOURNAL_ENTRIES[key],
        `${key} must stay out of prod until its stage ships`,
      ).toBeUndefined();
    }
  });

  it('the finale carries the fates substitution and the campaign flag', () => {
    const b = ACT3_BEATS.find((x) => x.id === 'homecoming')!;
    for (const line of [b.reward.successLine, b.reward.slainLine!]) {
      expect(line).toContain('{saved}');
      expect(line).toContain('{kept}');
    }
    expect(b.reward.flag).toBe('campaignComplete');
  });
});

describe('Act 3 locations', () => {
  it('the bell and every open-sea point float clear of land', () => {
    // The bell shares the salvage points' 30-clearance standard (it sits on
    // the flats, near shore by design); the deep points get the full 60.
    expect(isOpenWater(ACT3_LOCATIONS.bell.x, ACT3_LOCATIONS.bell.z, 30)).toBe(true);
    expect(isOpenWater(ACT3_LOCATIONS.approach.x, ACT3_LOCATIONS.approach.z)).toBe(true);
    const gates = ACT3_BEATS.find((x) => x.id === 'into-maelstrom')!;
    if (gates.encounter.kind !== 'descent-gates') throw new Error('wrong kind');
    for (const g of gates.encounter.gates) {
      expect(isOpenWater(g.x, g.z), `gate (${g.x},${g.z})`).toBe(true);
    }
  });

  it('the pier point IS the runtime Greyharbor dock (not open water — a pier)', () => {
    const dock = findStoryHarbor()!.dock;
    expect(Math.hypot(ACT3_LOCATIONS.pier.x - dock.x, ACT3_LOCATIONS.pier.z - dock.z)).toBeLessThan(
      8,
    );
    const home = ACT3_BEATS.find((x) => x.id === 'homecoming')!;
    if (home.encounter.kind !== 'ascend') throw new Error('wrong kind');
    expect(home.encounter.spawn).toEqual(ACT3_LOCATIONS.pier);
  });
});

describe('Act 3 reachability (the era invariant)', () => {
  it('every gate band is fully reachable ONLY under the act3 era', () => {
    const gates = ACT3_BEATS.find((x) => x.id === 'into-maelstrom')!;
    if (gates.encounter.kind !== 'descent-gates') throw new Error('wrong kind');
    setEra('act3');
    for (const g of gates.encounter.gates) {
      expect(bandReachable(g.x, g.z, g.band), `gate (${g.x},${g.z})`).toBe(true);
      // Inside the core, so the whole band is at full depth (no shelf blend).
      expect(Math.hypot(g.x - TRENCH.centerX, g.z - TRENCH.centerZ)).toBeLessThanOrEqual(
        TRENCH.radius,
      );
    }
    // The deepest gate is the act's point: Act 2's frozen floor cannot reach it.
    setEra('act2');
    const last = gates.encounter.gates[2];
    expect(bandReachable(last.x, last.z, last.band)).toBe(false);
  });

  it('the heart and the ask share the heart band, reachable at the center in act3', () => {
    for (const id of ['heart-deep', 'what-sea-asks']) {
      const b = ACT3_BEATS.find((x) => x.id === id)!;
      const e = b.encounter;
      if (e.kind !== 'listen' && e.kind !== 'keeper-choice') throw new Error('wrong kind');
      expect(e.band).toEqual(TRENCH_ACT3.heartBand);
      expect(e.spawn).toEqual({ x: TRENCH.centerX, z: TRENCH.centerZ });
      setEra('act3');
      expect(bandReachable(e.spawn.x, e.spawn.z, e.band)).toBe(true);
      setEra('act2');
      expect(bandReachable(e.spawn.x, e.spawn.z, e.band)).toBe(false);
    }
  });

  it('the gates descend: each band strictly deeper than the last', () => {
    const gates = ACT3_BEATS.find((x) => x.id === 'into-maelstrom')!;
    if (gates.encounter.kind !== 'descent-gates') throw new Error('wrong kind');
    const bands = gates.encounter.gates.map((g) => g.band);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].max).toBeLessThan(bands[i - 1].max);
      expect(bands[i].min).toBeLessThan(bands[i - 1].min);
    }
    // A depth mid-band at each gate is judged in-band (sanity on min/max sense).
    for (const b of bands) expect(inBand((b.min + b.max) / 2, b)).toBe(true);
  });

  it('the descent arc banks through the machine with the real gate data', () => {
    const gates = ACT3_BEATS.find((x) => x.id === 'into-maelstrom')!;
    if (gates.encounter.kind !== 'descent-gates') throw new Error('wrong kind');
    const e = gates.encounter;
    const song = new SongAnswer(e.gates.length, {
      radius: e.radius,
      dwellSeconds: e.dwellSeconds,
      maxSpeed: e.maxSpeed,
      band: e.gates[0].band,
      bands: e.gates.map((g) => g.band),
    });
    // Hold each gate mid-band, slow, at zero distance: dwell then bank.
    const steps = Math.round(e.dwellSeconds / 0.5); // 10 half-second ticks
    for (const g of e.gates) {
      const y = (g.band.min + g.band.max) / 2;
      for (let i = 0; i < steps - 1; i++) {
        expect(song.step(0.5, 0, y, 1)).toBe(false);
      }
      expect(song.step(0.5, 0, y, 1)).toBe(true);
    }
    expect(song.complete()).toBe(true);
    // Gate 1's ceiling would be a violation at gate 3's depth and vice versa.
    song.reset();
    expect(song.step(0.5, 0, -90, 1)).toBe(false);
    expect(song.lastViolation()).toBe('too-deep');
  });
});

describe('Beat 22: the keeper option matrix (spec)', () => {
  it('mercy + a saved soul: three answers, refusal last', () => {
    const opts = keeperOptionsFor(true, 'survivor_wife');
    expect(opts.map((o) => o.keeper.kind)).toEqual(['leviathan', 'soul', 'sealed']);
    expect(opts[1].label).toBe('Let Mara stay — she is willing');
  });

  it('mercy + zero saved: the Leviathan or the seal', () => {
    const opts = keeperOptionsFor(true, null);
    expect(opts.map((o) => o.keeper.kind)).toEqual(['leviathan', 'sealed']);
  });

  it('slain + a saved soul: the soul or the seal — and pronouns follow the soul', () => {
    const opts = keeperOptionsFor(false, 'soul_deckhand');
    expect(opts.map((o) => o.keeper.kind)).toEqual(['soul', 'sealed']);
    expect(opts[0].label).toBe('Let Tomas stay — he is willing');
    expect(opts[0].keeper).toEqual({ kind: 'soul', soulId: 'soul_deckhand' });
  });

  it('slain + zero saved: the one-option ask is still an ask', () => {
    const opts = keeperOptionsFor(false, null);
    expect(opts.map((o) => o.keeper.kind)).toEqual(['sealed']);
  });

  it('every keeper has an authored closing line; the soul line names her', () => {
    expect(keeperLineFor({ kind: 'leviathan' })).toContain('Leviathan');
    expect(keeperLineFor({ kind: 'sealed' })).toContain('quiet');
    expect(keeperLineFor({ kind: 'soul', soulId: 'soul_lampkeeper' })).toContain('Edda');
  });
});
