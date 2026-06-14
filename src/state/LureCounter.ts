/**
 * The no-weapons finale: counting "lure passes" instead of kills.
 *
 * When the player has switched weapons off (tb-disarmed), the Leviathan can't be
 * sunk — so beat 8 is won by baiting it. Each time you draw the chasing beast in
 * close to the trench mouth (within LURE_IN) and then pull back out past LURE_OUT
 * to re-arm, that's one pass. Three passes and it's lured into the deep.
 *
 * This is a PURE state machine (no Three.js, no time, no storage): feed it the
 * boat→trench distance and whether the boss is alive-and-chasing each tick, and
 * it tracks the edge + pass count. Hysteresis (the LURE_IN/LURE_OUT band) stops a
 * single hover near the rim from racking up passes. Fleeing very far (LURE_FLEE)
 * only resets the edge, never the hard-won pass count — so you can regroup.
 */

/** Inside this range of the trench (with the boss chasing) counts a pass. */
export const LURE_IN = 90;
/** Must pull back beyond this to re-arm the next pass (chase-gated hysteresis). */
export const LURE_OUT = 220;
/** Fleeing past this resets the inside edge even if the boss broke off — but
 *  never the pass count, so progress survives a regroup. */
export const LURE_FLEE = 600;

export class LureCounter {
  /** Whether the boat is currently counted as "inside" the lure ring. */
  private inside = false;
  private passes = 0;

  constructor(private readonly passesNeeded = 3) {}

  /**
   * Advance one tick.
   * @param dist        boat→trench distance (metres)
   * @param bossChasing the scripted boss is alive and pursuing
   * @returns true once enough passes have been completed (also via isComplete()).
   */
  step(dist: number, bossChasing: boolean): boolean {
    // Re-arm the edge by pulling the chasing beast back out past LURE_OUT.
    if (bossChasing && dist > LURE_OUT) this.inside = false;

    // A long flight resets the edge regardless of the chase (so re-engaging
    // counts fresh) — but it must NOT wipe the pass count.
    if (dist > LURE_FLEE) this.inside = false;

    // Crossing in close, with the boss in tow, banks a pass once.
    if (bossChasing && !this.inside && dist < LURE_IN) {
      this.inside = true;
      this.passes++;
    }

    return this.isComplete();
  }

  isComplete(): boolean {
    return this.passes >= this.passesNeeded;
  }

  getPasses(): number {
    return this.passes;
  }

  /** Reset to a fresh lure (used when (re)arming the beat). */
  reset(): void {
    this.inside = false;
    this.passes = 0;
  }
}
