import { STORY_BEATS } from './StoryBeats';

const STORAGE_KEY = 'tb-story';
const START_BOAT = 'Tugboat';

/**
 * Story Mode campaign progress — the save for "The Vanishing Tide".
 * Pure + storage-injectable (same pattern as Karma/Wallet/Harbor). Credits,
 * karma, journal and upgrades stay in their own lifetime modules; this only
 * orchestrates the beat sequence, unlocks, and flags.
 */
export interface CampaignState {
  started: boolean;
  beat: number; // index into STORY_BEATS
  armedBeat: number | null; // beat currently armed — clean re-arm on load
  completed: string[]; // completed beat ids — reward-once guard
  unlockedBoats: string[]; // boat def.name keys
  flags: Record<string, boolean>;
  lastBoat: string;
}

export function newCampaign(): CampaignState {
  return {
    started: true,
    beat: 0,
    armedBeat: null,
    completed: [],
    unlockedBoats: [START_BOAT],
    flags: {},
    lastBoat: START_BOAT,
  };
}

export function loadCampaign(storage: Storage = localStorage): CampaignState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const boats = Array.isArray(o.unlockedBoats)
      ? (o.unlockedBoats as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return {
      started: o.started === true,
      beat: Number.isInteger(o.beat) ? (o.beat as number) : 0,
      armedBeat: Number.isInteger(o.armedBeat) ? (o.armedBeat as number) : null,
      completed: Array.isArray(o.completed)
        ? (o.completed as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      unlockedBoats: boats.length ? boats : [START_BOAT],
      flags: o.flags && typeof o.flags === 'object' ? (o.flags as Record<string, boolean>) : {},
      lastBoat: typeof o.lastBoat === 'string' ? (o.lastBoat as string) : START_BOAT,
    };
  } catch {
    return null;
  }
}

export function saveCampaign(state: CampaignState, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — progress just doesn't persist this session.
  }
}

export function resetCampaign(storage: Storage = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function currentBeat(state: CampaignState) {
  return STORY_BEATS[state.beat] ?? null;
}

export function isComplete(state: CampaignState): boolean {
  return state.beat >= STORY_BEATS.length;
}

export function markCompleted(state: CampaignState, id: string): void {
  if (!state.completed.includes(id)) state.completed.push(id);
}

export function advanceBeat(state: CampaignState): CampaignState {
  if (state.beat < STORY_BEATS.length) state.beat++;
  state.armedBeat = null;
  return state;
}

export function unlockBoat(state: CampaignState, key: string): void {
  if (!state.unlockedBoats.includes(key)) state.unlockedBoats.push(key);
}

export function setFlag(state: CampaignState, key: string, val = true): void {
  state.flags[key] = val;
}
