import { STORY_BEATS, type StoryBeat } from './StoryBeats';
import { ACT2_SHIPPED } from './StoryBeatsAct2';
import { ACT3_SHIPPED } from './StoryBeatsAct3';

const STORAGE_KEY = 'tb-story';
const START_BOAT = 'Tugboat';

/**
 * The working beat array: Act 1 plus every shipped act suffix (the SHIPPED
 * arrays grow stage by stage). The dev harness (VITE_STORY_HARNESS builds
 * only) swaps in the FULL later-act sets so unshipped beats are playable
 * before they ship; nothing in a normal build calls devExtendBeats.
 */
let WORKING_BEATS: readonly StoryBeat[] = [...STORY_BEATS, ...ACT2_SHIPPED, ...ACT3_SHIPPED];

export function devExtendBeats(extra: StoryBeat[]): void {
  WORKING_BEATS = [...STORY_BEATS, ...extra];
}

export function workingBeats(): readonly StoryBeat[] {
  return WORKING_BEATS;
}

/** The dev harness plays with a synthetic beat pointer — its session must
 *  never overwrite the real save. Default on; harness switches it off. */
let persistEnabled = true;
export function setPersistEnabled(on: boolean): void {
  persistEnabled = on;
}

/**
 * Story Mode campaign progress — the save for "The Vanishing Tide".
 * Pure + storage-injectable (same pattern as Karma/Wallet/Harbor). Credits,
 * karma, journal and upgrades stay in their own lifetime modules; this only
 * orchestrates the beat sequence, unlocks, and flags.
 */
/** Act 2: the named souls of the Drowned Choir. Stable save keys — display
 *  names (Mara, Edda, Tomas) live in beat content, never in the save. */
export type SoulId = 'survivor_wife' | 'soul_lampkeeper' | 'soul_deckhand';
export type SoulFate = 'saved' | 'kept';
const SOUL_IDS: readonly string[] = ['survivor_wife', 'soul_lampkeeper', 'soul_deckhand'];
const SOUL_FATES: readonly string[] = ['saved', 'kept'];

/** Act 3 (What the Sea Asks): who stays below — or the seal. */
export type Keeper =
  | { kind: 'leviathan' }
  | { kind: 'soul'; soulId: SoulId }
  | { kind: 'sealed' };

export interface CampaignState {
  started: boolean;
  beat: number; // index into STORY_BEATS
  armedBeat: number | null; // beat currently armed — clean re-arm on load
  completed: string[]; // completed beat ids — reward-once guard
  unlockedBoats: string[]; // boat def.name keys
  flags: Record<string, boolean>;
  /** Act 2 (Drowned Choir): what became of each named soul. Deliveries commit
   *  here immediately — a reload never un-rescues anyone. */
  fates: Partial<Record<SoulId, SoulFate>>;
  /** Act 3: delivery order from the choir (appended at each beat-13 delivery;
   *  older saves derive best-effort via savedOrderFor). */
  savedOrder: SoulId[];
  /** Act 3 (beat 22): the sea's companion, or the seal. Null until asked. */
  keeper: Keeper | null;
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
    fates: {},
    savedOrder: [],
    keeper: null,
    lastBoat: START_BOAT,
  };
}

/** A soul was actually saved on this save (the keeper/casting validity test). */
function isSaved(state: Pick<CampaignState, 'fates'>, id: string): id is SoulId {
  return SOUL_IDS.includes(id) && state.fates[id as SoulId] === 'saved';
}

/** Keep only well-formed, actually-saved, unique soul ids, order preserved. */
function sanitizeSavedOrder(raw: unknown, fates: CampaignState['fates']): SoulId[] {
  if (!Array.isArray(raw)) return [];
  const out: SoulId[] = [];
  for (const id of raw) {
    if (
      typeof id === 'string' &&
      SOUL_IDS.includes(id) &&
      fates[id as SoulId] === 'saved' &&
      !out.includes(id as SoulId)
    ) {
      out.push(id as SoulId);
    }
  }
  return out;
}

/** A keeper is valid only if its shape is known AND (for souls) that soul was
 *  actually saved — a plausible-but-unsaved id is rejected to null. */
function sanitizeKeeper(raw: unknown, fates: CampaignState['fates']): Keeper | null {
  if (!raw || typeof raw !== 'object') return null;
  const k = raw as Record<string, unknown>;
  if (k.kind === 'leviathan') return { kind: 'leviathan' };
  if (k.kind === 'sealed') return { kind: 'sealed' };
  if (k.kind === 'soul' && typeof k.soulId === 'string' && isSaved({ fates }, k.soulId)) {
    return { kind: 'soul', soulId: k.soulId };
  }
  return null;
}

/**
 * The soul thread, one answer for every consumer (beats 17, 22, 24): the
 * sanitized savedOrder when present, else derived from fates insertion order,
 * deterministically. Pure.
 */
export function savedOrderFor(state: CampaignState): SoulId[] {
  const explicit = sanitizeSavedOrder(state.savedOrder, state.fates);
  if (explicit.length) return explicit;
  return (Object.keys(state.fates) as SoulId[]).filter((id) => isSaved(state, id));
}

/** The finale outcome flags must resolve to at most one truth. If a save ever
 *  carries both (bug, tinkering), mercy wins — the kinder read. */
export function normalizeOutcome(flags: Record<string, boolean>): void {
  if (flags.mercy && flags.slain) delete flags.slain;
}

/** Keep only well-formed soul fates; invalid entries are dropped one by one
 *  (never reject the whole save over a bad fate). */
function sanitizeFates(raw: unknown): Partial<Record<SoulId, SoulFate>> {
  const out: Partial<Record<SoulId, SoulFate>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SOUL_IDS.includes(k) && typeof v === 'string' && SOUL_FATES.includes(v)) {
      out[k as SoulId] = v as SoulFate;
    }
  }
  return out;
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
    const flags =
      o.flags && typeof o.flags === 'object' ? (o.flags as Record<string, boolean>) : {};
    normalizeOutcome(flags);
    const completed = Array.isArray(o.completed)
      ? (o.completed as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    // Older finished-Act-2 saves predate the act2complete flag — derive it.
    if (completed.includes('drowned-light')) flags.act2complete = true;
    const fates = sanitizeFates(o.fates); // pre-Act-2 saves have none → {}
    return {
      started: o.started === true,
      beat: Number.isInteger(o.beat) ? (o.beat as number) : 0,
      armedBeat: Number.isInteger(o.armedBeat) ? (o.armedBeat as number) : null,
      completed,
      unlockedBoats: boats.length ? boats : [START_BOAT],
      flags,
      fates,
      savedOrder: sanitizeSavedOrder(o.savedOrder, fates),
      keeper: sanitizeKeeper(o.keeper, fates),
      lastBoat: typeof o.lastBoat === 'string' ? (o.lastBoat as string) : START_BOAT,
    };
  } catch {
    return null;
  }
}

export function saveCampaign(state: CampaignState, storage: Storage = localStorage): void {
  if (!persistEnabled) return; // dev harness session — never touch the real save
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
  return WORKING_BEATS[state.beat] ?? null;
}

export function isComplete(state: CampaignState): boolean {
  return state.beat >= WORKING_BEATS.length;
}

export function markCompleted(state: CampaignState, id: string): void {
  if (!state.completed.includes(id)) state.completed.push(id);
}

export function advanceBeat(state: CampaignState): CampaignState {
  if (state.beat < WORKING_BEATS.length) state.beat++;
  state.armedBeat = null;
  return state;
}

export function unlockBoat(state: CampaignState, key: string): void {
  if (!state.unlockedBoats.includes(key)) state.unlockedBoats.push(key);
}

export function setFlag(state: CampaignState, key: string, val = true): void {
  state.flags[key] = val;
}
