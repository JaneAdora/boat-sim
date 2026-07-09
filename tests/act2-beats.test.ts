import { describe, it, expect } from 'vitest';
import { STORY_BEATS, validateBeatGraph } from '../src/state/StoryBeats';
import { ACT2_BEATS, ACT2_SHIPPED, ACT2_LOCATIONS } from '../src/state/StoryBeatsAct2';
import { JOURNAL_ENTRIES } from '../src/state/JournalTracker';
import { isOpenWater } from '../src/state/StoryHarbor';
import { TRENCH, inBand } from '../src/world/TrenchProfile';

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

describe('Act 2 beat graph', () => {
  it('ids are unique across BOTH acts', () => {
    const all = [...STORY_BEATS, ...ACT2_BEATS].map((b) => b.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('passes the static graph checks alongside Act 1', () => {
    expect(validateBeatGraph(KNOWN_BOATS)).toEqual([]);
    // The same checks applied to the combined array by hand:
    for (const b of ACT2_BEATS) {
      if (b.requiresBoat) expect(KNOWN_BOATS).toContain(b.requiresBoat);
      if (b.reward.unlockBoat) expect(KNOWN_BOATS).toContain(b.reward.unlockBoat);
    }
  });

  it('every deep beat requires the Submarine (the gate CRITICAL)', () => {
    const deep = ACT2_BEATS.filter((b) =>
      ['into-trench', 'drowned-choir', 'drowned-light'].includes(b.id),
    );
    expect(deep).toHaveLength(3);
    for (const b of deep) expect(b.requiresBoat).toBe('Submarine');
  });

  it('every reward journalKey exists in the catalog (entries ship with their stage)', () => {
    // Stage 2 shipped beats 9–13, so 'drowned-choir' is now legitimately in
    // the catalog. Future-stage keys go into PENDING_JOURNAL when authored.
    const PENDING_JOURNAL: string[] = [];
    for (const b of [...STORY_BEATS, ...ACT2_BEATS]) {
      if (b.reward.journalKey) {
        const known =
          JOURNAL_ENTRIES[b.reward.journalKey] !== undefined ||
          PENDING_JOURNAL.includes(b.reward.journalKey);
        expect(known, `${b.id} journalKey ${b.reward.journalKey}`).toBe(true);
      }
    }
    for (const key of PENDING_JOURNAL) {
      expect(JOURNAL_ENTRIES[key], `${key} must stay out of prod until its stage ships`).toBeUndefined();
    }
  });

  it('exactly the shipped beats are in the production working array', () => {
    // ACT2_SHIPPED must track the plan's stages: the full act as of stage 4.
    expect(ACT2_SHIPPED.map((b) => b.id)).toEqual([
      'tide-stayed',
      'exodus',
      'deep-refit',
      'into-trench',
      'drowned-choir',
      'old-enemy',
      'king-tide',
      'drowned-light',
    ]);
  });

  it('the finale carries both endings, the fates substitution, and in-trench points', () => {
    const finale = ACT2_BEATS.find((b) => b.id === 'drowned-light')!;
    expect(finale.reward.successLine).toContain('{saved}');
    expect(finale.reward.successLine).toContain('{kept}');
    expect(finale.reward.slainLine).toContain('{saved}');
    expect(finale.reward.flag).toBe('act2complete');
    if (finale.encounter.kind !== 'song-answer') throw new Error('wrong kind');
    for (const p of finale.encounter.points) {
      expect(Math.hypot(p.x - TRENCH.centerX, p.z - TRENCH.centerZ)).toBeLessThan(TRENCH.radius);
    }
    expect(inBand(-60, TRENCH.songBand)).toBe(true); // a sane cruising depth passes
  });

  it('the guardian beat carries both branch closings', () => {
    const guardian = ACT2_BEATS.find((b) => b.id === 'old-enemy')!;
    expect(guardian.reward.successLine.length).toBeGreaterThan(0);
    expect(guardian.reward.slainLine?.length).toBeGreaterThan(0);
    if (guardian.encounter.kind !== 'guardian') throw new Error('wrong kind');
    expect(guardian.encounter.slainSeconds).toBeGreaterThan(guardian.encounter.mercySeconds);
  });

  it('the drowned-choir success line names the kept soul', () => {
    const choir = ACT2_BEATS.find((b) => b.id === 'drowned-choir')!;
    expect(choir.reward.successLine).toContain('{kept}');
  });
});

describe('Act 2 locations are open water', () => {
  it('the flats derelict and night-waters mermaid float clear of land', () => {
    expect(isOpenWater(ACT2_LOCATIONS.flats.x, ACT2_LOCATIONS.flats.z)).toBe(true);
    expect(isOpenWater(ACT2_LOCATIONS.nightWaters.x, ACT2_LOCATIONS.nightWaters.z)).toBe(true);
  });

  it('the trench mouth and all king-tide rescue points are open water', () => {
    const guardian = ACT2_BEATS.find((b) => b.id === 'old-enemy')!;
    if (guardian.encounter.kind !== 'guardian') throw new Error('wrong kind');
    expect(isOpenWater(guardian.encounter.spawn.x, guardian.encounter.spawn.z)).toBe(true);
    const kt = ACT2_BEATS.find((b) => b.id === 'king-tide')!;
    if (kt.encounter.kind !== 'rescue-sequence') throw new Error('wrong kind');
    for (const p of kt.encounter.points) {
      expect(isOpenWater(p.x, p.z), `kt point (${p.x},${p.z})`).toBe(true);
    }
  });

  it('all salvage points sit in open water at the reef', () => {
    const refit = ACT2_BEATS.find((b) => b.id === 'deep-refit')!;
    if (refit.encounter.kind !== 'multi-pickup') throw new Error('wrong kind');
    for (const p of refit.encounter.points) {
      expect(isOpenWater(p.x, p.z, 30), `${p.id} @ (${p.x},${p.z})`).toBe(true);
    }
  });

  it('the hamlet sits inside the trench core, souls in the pickup band', () => {
    const choir = ACT2_BEATS.find((b) => b.id === 'drowned-choir')!;
    if (choir.encounter.kind !== 'soul-transport') throw new Error('wrong kind');
    const h = choir.encounter.hamlet;
    expect(Math.hypot(h.x - TRENCH.centerX, h.z - TRENCH.centerZ)).toBeLessThan(TRENCH.radius);
    expect(inBand(TRENCH.hamletDepth + 3, TRENCH.pickupBand)).toBe(true); // soul sprite height
  });
});
