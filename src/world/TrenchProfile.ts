import { STORY_LOCATIONS } from '../state/StoryBeats';

/**
 * The trench depth profile — Act 2's single source of depth truth.
 *
 * Every consumer of "how deep is the world here" reads THIS object: the
 * submarine's floor, the seabed visual, prop placement depths, the deep
 * fog/tint curve, and the interaction bands of beats 12/13/16. Retuning the
 * deep zone (the spec's fallback) means editing these constants together,
 * never a literal scattered in a system.
 *
 * Pure math — no THREE, no DOM — so the blend and bands are unit-testable.
 */

/** Geometry: a circular trench with a smooth entry shelf. */
export const TRENCH = {
  centerX: STORY_LOCATIONS.trench.x,
  centerZ: STORY_LOCATIONS.trench.z,
  /** Fully deep inside this radius. */
  radius: 140,
  /** Blend width: floor eases from deep to standard across this ring. */
  shelf: 80,
  /** The sub's floor inside the trench (refitted). */
  deepFloor: -80,
  /** The sub's floor everywhere else — Act 1's world, unchanged. */
  standardFloor: -35,
  /** Seabed visual sits this far below the local sub floor. */
  seabedOffset: 8,
  /** Content placement depths. */
  ledgeDepth: -55, // beat 12: the sunken-boat procession
  hamletDepth: -76, // beat 13: the drowned hamlet on the trench floor
  /** Interaction bands (y ranges, negative-down). */
  contactBand: { min: -80, max: -50 }, // beat 12 sonar completion
  pickupBand: { min: -80, max: -55 }, // beat 13 soul pickup
  songBand: { min: -80, max: -50 }, // beat 16 calm passes
} as const;

/**
 * Act 3: the maelstrom opens the trench deeper than Act 2 ever went. The
 * deepening is an ERA, not a retune — `TRENCH` above is frozen forever (the
 * shipped Act 2 beats replay byte-identically), and the era switches only
 * while an Act 3 descent beat (≥ 20) is armed. MissionSystem owns the switch;
 * disarm always resets to act2.
 */
export const TRENCH_ACT3 = {
  ...TRENCH,
  deepFloor: -105,
  /** The heart of the deep and the ask both live in this band. */
  heartBand: { min: -105, max: -85 },
  /** Underwater deep-fade curve (start depth, range) — act3 fades longer. */
  fade: { start: 28, range: 45 },
} as const;

/** act2's fade curve = the shipped Underwater literals, frozen. */
const TRENCH_ACT2_FADE = { start: 28, range: 30 } as const;

export type TrenchEra = 'act2' | 'act3';
let era: TrenchEra = 'act2';

export function setEra(e: TrenchEra): void {
  era = e;
}

export function currentEra(): TrenchEra {
  return era;
}

/** The active era's floor inside the core. */
function coreFloor(): number {
  return era === 'act2' ? TRENCH.deepFloor : TRENCH_ACT3.deepFloor;
}

/** The active era's Underwater fade curve. */
export function fadeParams(): { start: number; range: number } {
  return era === 'act2' ? TRENCH_ACT2_FADE : TRENCH_ACT3.fade;
}

/** Reachability invariant (Act 3 plan): the sub can hold the WHOLE band at
 *  (x,z) only if the local floor reaches the band's bottom. */
export function bandReachable(x: number, z: number, band: { min: number; max: number }): boolean {
  return floorAt(x, z) <= band.min;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Horizontal distance from the trench center. */
export function trenchDist(x: number, z: number): number {
  return Math.hypot(x - TRENCH.centerX, z - TRENCH.centerZ);
}

/** True inside the fully-deep core. */
export function inTrench(x: number, z: number): boolean {
  return trenchDist(x, z) <= TRENCH.radius;
}

/**
 * The local floor (max dive depth) at a point. Deep in the core, standard
 * outside, smooth across the shelf — a sub crossing the boundary while deep
 * eases upward instead of snap-clamping.
 */
export function floorAt(x: number, z: number): number {
  const deep = coreFloor(); // era-aware: −80 in act2, −105 in act3
  const d = trenchDist(x, z);
  if (d <= TRENCH.radius) return deep;
  if (d >= TRENCH.radius + TRENCH.shelf) return TRENCH.standardFloor;
  const t = smoothstep((d - TRENCH.radius) / TRENCH.shelf);
  return deep + (TRENCH.standardFloor - deep) * t;
}

/** 0 at the surface → 1 at the local floor; drives the deep tint/fog curve. */
export function depthT(x: number, z: number, y: number): number {
  const floor = floorAt(x, z);
  if (y >= 0) return 0;
  return Math.min(1, Math.max(0, y / floor));
}

/** Is a y (sub depth) inside a named band? */
export function inBand(y: number, band: { min: number; max: number }): boolean {
  return y >= band.min && y <= band.max;
}
