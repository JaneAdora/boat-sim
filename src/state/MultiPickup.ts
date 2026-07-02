/**
 * Beat 11 ("Built for the Pressure"): the three-salvage collection machine.
 *
 * Pure state (no THREE, no storage): the MissionSystem feeds it collect events
 * and persists each collection to a campaign flag immediately; on load it
 * hydrates from those flags so only uncollected salvage respawns.
 */
export class MultiPickup {
  private collected = new Set<string>();

  constructor(private readonly ids: readonly string[]) {}

  /** Restore from persisted flags. Unknown ids are ignored; repeat calls are
   *  harmless (idempotent). */
  hydrate(collectedIds: readonly string[]): void {
    for (const id of collectedIds) {
      if (this.ids.includes(id)) this.collected.add(id);
    }
  }

  /** Collect one salvage. False for unknown ids and repeats — a prop that
   *  somehow lingers can't double-count. */
  collect(id: string): boolean {
    if (!this.ids.includes(id) || this.collected.has(id)) return false;
    this.collected.add(id);
    return true;
  }

  isCollected(id: string): boolean {
    return this.collected.has(id);
  }

  remaining(): string[] {
    return this.ids.filter((id) => !this.collected.has(id));
  }

  allCollected(): boolean {
    return this.remaining().length === 0;
  }
}
