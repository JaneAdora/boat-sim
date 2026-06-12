import { Biome } from '../world/IslandGenerator';

const STORAGE_KEY = 'tb-fishing';

export type FishBiome = Biome | 'open';

export interface FishSpecies {
  id: string;
  name: string;
  /** Eligible biome, or 'any'. */
  biome: FishBiome | 'any';
  /** Eligible time, or 'any'. */
  time: 'day' | 'night' | 'any';
  /** Eligible weather, or 'any'. */
  weather: 'calm' | 'storm' | 'any';
  /** Selection weight among eligible species (higher = more common). */
  weight: number;
  /** Credit value range [min, max]. */
  value: [number, number];
  /** Catch progress per reel tap. */
  reel: number;
  /** Line tension added per reel tap (before rod relief). */
  pull: number;
}

/**
 * The catch table. Condition fields turn weather and time into content: the
 * Thunder Marlin only bites in a storm, the Moonfish only at night. Common
 * fish carry every condition so a cast is never fruitless.
 */
export const FISH: FishSpecies[] = [
  { id: 'mackerel', name: 'Mackerel', biome: 'any', time: 'any', weather: 'any', weight: 10, value: [8, 15], reel: 0.14, pull: 0.12 },
  { id: 'cod', name: 'Cod', biome: 'any', time: 'any', weather: 'any', weight: 9, value: [10, 20], reel: 0.13, pull: 0.13 },
  { id: 'herring', name: 'Herring', biome: 'open', time: 'any', weather: 'any', weight: 8, value: [9, 16], reel: 0.15, pull: 0.11 },
  { id: 'seabass', name: 'Sea Bass', biome: 'rocky', time: 'any', weather: 'any', weight: 6, value: [18, 30], reel: 0.11, pull: 0.16 },
  { id: 'mahi', name: 'Mahi-mahi', biome: 'tropical', time: 'day', weather: 'any', weight: 5, value: [26, 42], reel: 0.10, pull: 0.18 },
  { id: 'copperfin', name: 'Copperfin', biome: 'autumn', time: 'any', weather: 'any', weight: 6, value: [20, 34], reel: 0.11, pull: 0.15 },
  { id: 'sunray', name: 'Sunscale Ray', biome: 'desert', time: 'day', weather: 'calm', weight: 5, value: [24, 38], reel: 0.10, pull: 0.17 },
  { id: 'lanternfish', name: 'Lanternfish', biome: 'any', time: 'night', weather: 'calm', weight: 5, value: [22, 36], reel: 0.11, pull: 0.15 },
  { id: 'moonfish', name: 'Moonfish', biome: 'any', time: 'night', weather: 'any', weight: 3, value: [40, 70], reel: 0.09, pull: 0.20 },
  { id: 'marlin', name: 'Thunder Marlin', biome: 'open', time: 'any', weather: 'storm', weight: 3, value: [60, 110], reel: 0.08, pull: 0.24 },
];

export interface CatchContext {
  biome: FishBiome;
  night: boolean;
  storm: boolean;
}

/** True if a species can bite in the given conditions. */
export function speciesEligible(s: FishSpecies, ctx: CatchContext): boolean {
  if (s.biome !== 'any' && s.biome !== ctx.biome) return false;
  if (s.time !== 'any' && s.time !== (ctx.night ? 'night' : 'day')) return false;
  if (s.weather !== 'any' && s.weather !== (ctx.storm ? 'storm' : 'calm')) return false;
  return true;
}

/**
 * Pick a species for the conditions, weighted by rarity. Pure given `rand`
 * (a 0..1 source) so the fight and the table are unit-testable. There is
 * always at least one eligible species (the commons carry every condition).
 */
export function pickSpecies(ctx: CatchContext, rand: () => number): FishSpecies {
  const eligible = FISH.filter((s) => speciesEligible(s, ctx));
  const total = eligible.reduce((sum, s) => sum + s.weight, 0);
  let roll = rand() * total;
  for (const s of eligible) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return eligible[eligible.length - 1];
}

/** Resolve a catch value within the species range, deterministic from `rand`. */
export function rollValue(s: FishSpecies, rand: () => number): number {
  const [lo, hi] = s.value;
  return Math.round(lo + rand() * (hi - lo));
}

// ── The fight: a pure tension minigame ───────────────────────

export interface FightState {
  catch: number;   // progress 0..1 — fill to land
  tension: number; // stress 0..1 — reach 1 and the line snaps
}

/** Tension relief from owning the Angler's Rod (subtracted per tap). */
export const ROD_RELIEF = 0.05;
const TENSION_BLEED = 0.32; // per second the line relaxes when you pause
const CATCH_SLIP = 0.04;    // per second the fish takes back

export function newFight(): FightState {
  return { catch: 0, tension: 0 };
}

/** One reel tap: gain progress, but raise tension (rod eases it). */
export function reelTap(state: FightState, s: FishSpecies, hasRod: boolean): FightState {
  return {
    catch: Math.min(1, state.catch + s.reel),
    tension: state.tension + Math.max(0.02, s.pull - (hasRod ? ROD_RELIEF : 0)),
  };
}

/** Time passing between taps: tension bleeds off, the fish slips a little. */
export function fightDecay(state: FightState, dt: number): FightState {
  return {
    catch: Math.max(0, state.catch - CATCH_SLIP * dt),
    tension: Math.max(0, state.tension - TENSION_BLEED * dt),
  };
}

export function fightOutcome(state: FightState): 'fighting' | 'landed' | 'snapped' {
  // Landing wins ties: the reel that fills the catch lands the fish even if
  // it also maxes the line. Tension only rises on a tap, so both resolve here.
  if (state.catch >= 1) return 'landed';
  if (state.tension >= 1) return 'snapped';
  return 'fighting';
}

// ── Persistence: the fish ledger ─────────────────────────────

export interface FishLedger {
  caught: Record<string, number>; // species id → best weight (kg)
  rod: boolean;
}

function blank(): FishLedger {
  return { caught: {}, rod: false };
}

export function loadLedger(storage: Storage = localStorage): FishLedger {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return blank();
    const p = parsed as Partial<FishLedger>;
    return {
      caught: p.caught && typeof p.caught === 'object' ? p.caught as Record<string, number> : {},
      rod: p.rod === true,
    };
  } catch {
    return blank();
  }
}

function save(ledger: FishLedger, storage: Storage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // Storage unavailable — the ledger just doesn't persist this session.
  }
}

/** Record a catch; returns { firstEver, firstOfSpecies } for toast logic. */
export function recordCatch(
  speciesId: string,
  weight: number,
  storage: Storage = localStorage,
): { firstEver: boolean; firstOfSpecies: boolean } {
  const ledger = loadLedger(storage);
  const firstEver = Object.keys(ledger.caught).length === 0;
  const firstOfSpecies = !(speciesId in ledger.caught);
  ledger.caught[speciesId] = Math.max(ledger.caught[speciesId] ?? 0, weight);
  save(ledger, storage);
  return { firstEver, firstOfSpecies };
}

export function hasRod(storage: Storage = localStorage): boolean {
  return loadLedger(storage).rod;
}

export function buyRod(storage: Storage = localStorage): void {
  const ledger = loadLedger(storage);
  ledger.rod = true;
  save(ledger, storage);
}

export function ledgerCount(storage: Storage = localStorage): number {
  return Object.keys(loadLedger(storage).caught).length;
}

export const FISH_TOTAL = FISH.length;
