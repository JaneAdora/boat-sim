/**
 * Beat 13 ("The Drowned Choir"): the soul-transport machine.
 *
 * One soul at a time, `deliveriesNeeded` trips home, and whoever is left when
 * the trips run out stays — chosen by omission, which is the design. Pure
 * state: the MissionSystem drives transitions from 3D contact/surfacing checks
 * and commits each delivery to `fates` immediately (a reload never un-rescues);
 * hydration derives delivered souls from `fates` and always discards any
 * in-flight carry (the sub surfaces from a reload empty-handed).
 */
export class SoulTransport {
  private delivered: string[] = [];
  private carryingId: string | null = null;

  constructor(
    private readonly ids: readonly string[],
    private readonly deliveriesNeeded = 2,
  ) {}

  /** Restore from fates. Unknown ids are ignored, repeats deduped, and any
   *  carry state is discarded by design. */
  hydrate(deliveredIds: readonly string[]): void {
    this.delivered = [];
    this.carryingId = null;
    for (const id of deliveredIds) {
      if (this.ids.includes(id) && !this.delivered.includes(id)) this.delivered.push(id);
    }
  }

  canPickup(id: string): boolean {
    return (
      this.ids.includes(id) &&
      !this.delivered.includes(id) &&
      this.carryingId === null &&
      !this.complete()
    );
  }

  pickup(id: string): boolean {
    if (!this.canPickup(id)) return false;
    this.carryingId = id;
    return true;
  }

  carrying(): string | null {
    return this.carryingId;
  }

  /** Surface with a soul: commits the carry. Returns the delivered id (for the
   *  fates write + toast), or null if nothing was aboard. */
  deliver(): string | null {
    if (this.carryingId === null) return null;
    const id = this.carryingId;
    this.carryingId = null;
    this.delivered.push(id);
    return id;
  }

  /** Reload semantics: an in-flight carry does not survive. */
  discardCarry(): void {
    this.carryingId = null;
  }

  deliveriesDone(): number {
    return this.delivered.length;
  }

  complete(): boolean {
    return this.delivered.length >= this.deliveriesNeeded;
  }

  /** The souls the sea keeps — meaningful once complete. */
  keptSouls(): string[] {
    return this.ids.filter((id) => !this.delivered.includes(id));
  }
}
