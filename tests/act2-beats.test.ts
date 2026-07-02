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
    const deep = ACT2_BEATS.filter((b) => ['into-trench', 'drowned-choir'].includes(b.id));
    expect(deep).toHaveLength(2);
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
    // ACT2_SHIPPED must track the plan's stages: 9–13 as of stage 2.
    expect(ACT2_SHIPPED.map((b) => b.id)).toEqual([
      'tide-stayed',
      'exodus',
      'deep-refit',
      'into-trench',
      'drowned-choir',
    ]);
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
