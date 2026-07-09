/**
 * Beat 16 ("The Drowned Light"): answering the song.
 *
 * Three marked points, in order, passed SLOWLY: hold inside the point's
 * radius, inside the depth band, under the calm-speed ceiling, for the dwell
 * time. Any violation resets the dwell (never the banked passes); passes are
 * inherently ordered because only the current point counts. A reload resets
 * everything — the finale is a single sitting by design.
 *
 * Pure state, LureCounter-inspired but its own machine (the gate was right:
 * ring-crossing hysteresis can't express ordered dwell).
 */
export type SongViolation = 'none' | 'outside' | 'too-fast' | 'too-shallow' | 'too-deep';

export interface SongAnswerOpts {
  radius: number;
  dwellSeconds: number;
  maxSpeed: number;
  band: { min: number; max: number }; // y range, negative-down (the default)
  /** Act 3 (descent gates): optional per-point band overrides, index-aligned;
   *  missing entries fall back to `band`. Act 2's finale passes none and is
   *  behavior-identical. */
  bands?: ({ min: number; max: number } | undefined)[];
}

export class SongAnswer {
  private banked = 0;
  private dwell = 0;
  private violation: SongViolation = 'outside';

  constructor(
    private readonly points: number,
    private readonly opts: SongAnswerOpts,
  ) {}

  /** The band the CURRENT point is judged against. */
  private currentBand(): { min: number; max: number } {
    return this.opts.bands?.[this.banked] ?? this.opts.band;
  }

  /**
   * Advance one tick against the CURRENT point.
   * @param dist  planar distance to the current point
   * @param y     sub depth (negative down)
   * @param speed current speed, engine units
   * @returns true when a pass banked this tick
   */
  step(dt: number, dist: number, y: number, speed: number): boolean {
    if (this.complete()) return false;
    const band = this.currentBand();
    this.violation =
      dist > this.opts.radius
        ? 'outside'
        : speed > this.opts.maxSpeed
          ? 'too-fast'
          : y > band.max
            ? 'too-shallow'
            : y < band.min
              ? 'too-deep'
              : 'none';
    if (this.violation !== 'none') {
      this.dwell = 0; // any violation restarts the point's dwell — not the arc
      return false;
    }
    this.dwell += dt;
    if (this.dwell >= this.opts.dwellSeconds) {
      this.banked++;
      this.dwell = 0;
      return true;
    }
    return false;
  }

  /** Index of the point to answer now, or null when the song is answered. */
  currentPoint(): number | null {
    return this.banked >= this.points ? null : this.banked;
  }

  passesBanked(): number {
    return this.banked;
  }

  /** The current failure mode, for live feedback lines. */
  lastViolation(): SongViolation {
    return this.violation;
  }

  /** 0..1 dwell progress at the current point. */
  dwellProgress(): number {
    return Math.min(1, this.dwell / this.opts.dwellSeconds);
  }

  complete(): boolean {
    return this.banked >= this.points;
  }

  reset(): void {
    this.banked = 0;
    this.dwell = 0;
    this.violation = 'outside';
  }
}
