export class KillTracker {
  boatsDestroyed = 0;
  lighthousesDestroyed = 0;

  get total(): number {
    return this.boatsDestroyed + this.lighthousesDestroyed;
  }

  recordBoatKill(): void {
    this.boatsDestroyed++;
  }

  recordLighthouseKill(): void {
    this.lighthousesDestroyed++;
  }

  reset(): void {
    this.boatsDestroyed = 0;
    this.lighthousesDestroyed = 0;
  }
}
