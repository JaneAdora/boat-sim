import { describe, expect, it } from 'vitest';
import {
  newCampaign,
  loadCampaign,
  saveCampaign,
  resetCampaign,
  advanceBeat,
  unlockBoat,
  setFlag,
  markCompleted,
} from '../src/state/CampaignState';
import { STORY_BEATS, validateBeatGraph } from '../src/state/StoryBeats';
import { JOURNAL_ENTRIES } from '../src/state/JournalTracker';
import { findStoryHarbor, isOpenWater } from '../src/state/StoryHarbor';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('CampaignState', () => {
  it('new campaign starts at beat 0 with only the tug unlocked', () => {
    const s = newCampaign();
    expect(s.started).toBe(true);
    expect(s.beat).toBe(0);
    expect(s.unlockedBoats).toEqual(['Tugboat']);
  });

  it('save → load round-trips', () => {
    const st = new MemoryStorage();
    const s = newCampaign();
    s.beat = 3;
    unlockBoat(s, 'Submarine');
    setFlag(s, 'goodwill');
    saveCampaign(s, st);
    const loaded = loadCampaign(st);
    expect(loaded).not.toBeNull();
    expect(loaded!.beat).toBe(3);
    expect(loaded!.unlockedBoats).toContain('Submarine');
    expect(loaded!.flags.goodwill).toBe(true);
  });

  it('missing save loads null; corrupt save loads null', () => {
    const st = new MemoryStorage();
    expect(loadCampaign(st)).toBeNull();
    st.setItem('tb-story', '{not json');
    expect(loadCampaign(st)).toBeNull();
  });

  it('advanceBeat clears armedBeat and is a no-op past the end', () => {
    const s = newCampaign();
    s.beat = 0;
    s.armedBeat = 0;
    advanceBeat(s);
    expect(s.beat).toBe(1);
    expect(s.armedBeat).toBeNull();
    s.beat = 999;
    advanceBeat(s);
    expect(s.beat).toBe(999);
  });

  it('markCompleted is idempotent (reward-once guard)', () => {
    const s = newCampaign();
    markCompleted(s, 'empty-berth');
    markCompleted(s, 'empty-berth');
    expect(s.completed.filter((x) => x === 'empty-berth')).toHaveLength(1);
  });

  it('resetCampaign wipes only tb-story', () => {
    const st = new MemoryStorage();
    st.setItem('tb-credits', '500');
    saveCampaign(newCampaign(), st);
    resetCampaign(st);
    expect(loadCampaign(st)).toBeNull();
    expect(st.getItem('tb-credits')).toBe('500');
  });
});

describe('StoryBeats graph', () => {
  it('has 8 beats with unique ids', () => {
    expect(STORY_BEATS).toHaveLength(8);
    expect(new Set(STORY_BEATS.map((b) => b.id)).size).toBe(8);
  });

  it('every journalKey reward exists in JOURNAL_ENTRIES', () => {
    for (const b of STORY_BEATS) {
      if (b.reward.journalKey) expect(b.reward.journalKey in JOURNAL_ENTRIES).toBe(true);
    }
  });

  it('every encounter coordinate is finite', () => {
    for (const b of STORY_BEATS) {
      const e = b.encounter as { spawn?: { x: number; z: number } };
      if (e.spawn) {
        expect(Number.isFinite(e.spawn.x)).toBe(true);
        expect(Number.isFinite(e.spawn.z)).toBe(true);
      }
    }
  });

  it('the chain ends at the leviathan boss', () => {
    expect(STORY_BEATS[STORY_BEATS.length - 1].encounter.kind).toBe('leviathan-boss');
  });

  it('unlocks the submarine before the beat that requires it', () => {
    const unlockIdx = STORY_BEATS.findIndex((b) => b.reward.unlockBoat === 'Submarine');
    const requireIdx = STORY_BEATS.findIndex((b) => b.requiresBoat === 'Submarine');
    expect(unlockIdx).toBeGreaterThanOrEqual(0);
    expect(requireIdx).toBeGreaterThan(unlockIdx);
  });

  it('validateBeatGraph returns no errors for known boat names', () => {
    expect(validateBeatGraph(['Tugboat', 'Submarine'])).toEqual([]);
  });
});

describe('StoryHarbor', () => {
  it('finds a deterministic eligible harbor near origin', () => {
    const a = findStoryHarbor();
    const b = findStoryHarbor();
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.radius).toBeGreaterThan(55);
  });

  it('every story encounter coordinate is open water', () => {
    for (const beat of STORY_BEATS) {
      const e = beat.encounter as { spawn?: { x: number; z: number } };
      if (e.spawn) {
        expect(isOpenWater(e.spawn.x, e.spawn.z)).toBe(true);
      }
    }
  });
});
