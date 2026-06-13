import { World, EntityId } from '../ecs/World';
import { Ocean } from '../rendering/Ocean';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';

export interface TrickCallbacks {
  /** A landed trick — credits earned plus a toast headline. */
  onTrick: (credits: number, headline: string) => void;
}

const CLEARANCE = 1.1;  // hull this far above the wave face counts as airborne
const MIN_AIR = 0.45;   // ignore ordinary wave-hop
const WARMUP = 3;       // ignore the spawn drop-in
const MAX_CREDITS = 25;

/**
 * Airtime trick scoring — the jet ski's reason to sail INTO the storm.
 * Hangtime plus spin banks style, style pays salvage credits. The wave
 * field is the skate park; any hull that catches air counts.
 */
export class TrickSystem {
  private airTime = 0;
  private spinAccum = 0;
  private airborne = false;
  private elapsed = 0;
  // Only a NEW personal best (this session) is worth a popup + ding. Starts at
  // MIN_AIR so the first real jump counts, then you must beat your own record —
  // no more notification on every wave-hop. Resets each game (in-memory).
  private bestAir = MIN_AIR;

  constructor(
    private world: World,
    private boatEntity: EntityId,
    private ocean: Ocean,
    private callbacks: TrickCallbacks,
  ) {}

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
    const rb = this.world.getComponent<RigidBody>(this.boatEntity, 'RigidBody');
    if (!t || !rb) return;

    const waveY = this.ocean.getWaveHeight(t.position.x, t.position.z);
    const clear = t.position.y - waveY > CLEARANCE;

    if (clear) {
      this.airTime += dt;
      this.spinAccum += Math.abs(rb.angularVelocity.y) * dt;
      this.airborne = true;
    } else if (this.airborne) {
      this.land();
      this.airborne = false;
      this.airTime = 0;
      this.spinAccum = 0;
    }
  }

  private land(): void {
    // Stay silent unless this beats the session's best hang time.
    if (this.elapsed < WARMUP || this.airTime <= this.bestAir) return;
    this.bestAir = this.airTime;
    const degrees = Math.round((this.spinAccum * 180) / Math.PI);
    const style = Math.round(this.airTime * 10) + Math.round(degrees / 180) * 8;
    const credits = Math.max(1, Math.min(MAX_CREDITS, Math.round(style / 3)));
    const spinNote = degrees >= 120 ? ` · ${degrees}° spin` : '';
    this.callbacks.onTrick(credits, `${this.airTime.toFixed(1)}s airtime${spinNote} · +${credits} cr`);
  }
}
