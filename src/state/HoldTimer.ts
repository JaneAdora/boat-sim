/**
 * Beat 14 ("An Old Enemy"): the hold-the-line timer.
 *
 * Cumulative time inside the hold — leaving PAUSES the clock, never resets it
 * (the sea asks patience, not perfection); a reload starts the hold over.
 * Pure state: the MissionSystem feeds it dt + whether the player is surfaced
 * inside the radius. Mission-owned and authoritative for BOTH branches — the
 * guardian Leviathan is visuals, not logic, so the slain branch (nobody
 * comes) completes identically.
 */
export class HoldTimer {
  private held = 0;

  constructor(private readonly required: number) {}

  /** Advance one tick. Accumulates only while inside; returns completion. */
  step(dt: number, inside: boolean): boolean {
    if (inside && !this.complete()) this.held += dt;
    return this.complete();
  }

  elapsed(): number {
    return Math.min(this.held, this.required);
  }

  /** 0..1 for feedback lines. */
  progress(): number {
    return this.required > 0 ? Math.min(1, this.held / this.required) : 1;
  }

  complete(): boolean {
    return this.held >= this.required;
  }

  reset(): void {
    this.held = 0;
  }
}
