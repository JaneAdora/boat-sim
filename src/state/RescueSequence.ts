/**
 * Beat 15 ("The King Tide"): three rescues, one at a time, in order.
 *
 * Pure sequencing state: the MissionSystem runs each stage through the
 * existing scripted-rescue contract and commits a per-stage flag on
 * completion; hydration accepts sparse flags (only a completed prefix counts —
 * a gap means the later flag is ignored, since stages are strictly ordered).
 */
export class RescueSequence {
  private done: boolean[];

  constructor(private readonly stages: number) {
    this.done = new Array(stages).fill(false);
  }

  /** Restore from persisted flags (index-aligned, sparse-safe: only the
   *  completed prefix is honored). */
  hydrate(flags: readonly boolean[]): void {
    this.done = new Array(this.stages).fill(false);
    for (let i = 0; i < this.stages; i++) {
      if (flags[i]) this.done[i] = true;
      else break; // a gap ends the prefix — later flags are stale/invalid
    }
  }

  /** The stage to run now, or null when all are done. */
  currentStage(): number | null {
    const i = this.done.indexOf(false);
    return i === -1 ? null : i;
  }

  /** Complete a stage — only the current one; repeats and skips are rejected. */
  completeStage(i: number): boolean {
    if (i !== this.currentStage()) return false;
    this.done[i] = true;
    return true;
  }

  completedCount(): number {
    return this.done.filter(Boolean).length;
  }

  complete(): boolean {
    return this.done.every(Boolean);
  }
}
