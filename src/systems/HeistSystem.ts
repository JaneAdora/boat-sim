import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { TowingSystem } from './TowingSystem';

export interface HeistCallbacks {
  onKarma: (delta: number, reason: string, journalKey?: string) => void;
  /** Persistent hot-cargo banner (null clears it). */
  onBanner: (text: string | null) => void;
  /** Fence complete — payout in credits (engine adds journal + toast). */
  onFence: (payout: number) => void;
  /** Heat level changed (0–3) — drives the HUD stars and naval response. */
  onHeat: (stars: number) => void;
  isSafeHarbor: (x: number, z: number) => boolean;
}

const PLUNDER_RANGE = 30;
const FENCE_MIN_DIST = 600;   // can't fence in sight of the crime
const HEAT_DECAY_SECONDS = 75; // per star, while no hot cargo on the line
const HUNTER_SPAWN_DIST = 300; // inside the wildlife cull radius (350), outside gun range

/**
 * Cargo heists — the working half of a life of piracy.
 *
 * F alongside a cargo ship rips a container overboard and auto-hooks it to
 * the tow line: hot cargo. Fence it at a discovered harbor far from the
 * theft for a payout. Every theft stains karma and raises naval heat (☠ 1–3):
 * patrols vector toward you, engage from further out, and at three stars a
 * hunter destroyer is dispatched. Heat cools off while your line is clean.
 */
export class HeistSystem {
  private hotCargo: WildlifeEntity | null = null;
  private theftX = 0;
  private theftZ = 0;
  private heat = 0;
  private heatTimer = 0;
  private hunter: WildlifeEntity | null = null;
  private plundered = new WeakSet<WildlifeEntity>();
  private plunderRequested = false;
  private noticeTimer = 0; // transient notices override the banner briefly

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyF' && !e.repeat) this.plunderRequested = true;
  };

  constructor(
    private wildlife: WildlifeSystem,
    private towing: TowingSystem,
    private callbacks: HeistCallbacks,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  update(dt: number, boatX: number, boatZ: number): void {
    const requested = this.plunderRequested;
    this.plunderRequested = false;
    if (requested) this.tryPlunder(boatX, boatZ);

    this.updateBanner(dt, boatX, boatZ);
    this.updateFence(boatX, boatZ);
    this.updateHeat(dt, boatX, boatZ);
  }

  private tryPlunder(boatX: number, boatZ: number): void {
    if (this.hotCargo) {
      this.notice('💰 One container at a time — fence what you have');
      return;
    }
    if (this.towing.getTowedEntity()) {
      this.notice('💰 Your tow line is busy — release it first (G)');
      return;
    }
    const ship = this.nearestCargoShip(boatX, boatZ);
    if (!ship) return; // nothing in reach — F stays silent
    if (this.plundered.has(ship)) {
      this.notice('💰 That deck is already bare');
      return;
    }

    // Splash a container into the water between the two ships
    const mx = (boatX + ship.mesh.position.x) / 2;
    const mz = (boatZ + ship.mesh.position.z) / 2;
    const container = this.wildlife.spawnStolenContainer(mx, mz);
    this.towing.towEntity(container);
    this.plundered.add(ship);
    this.hotCargo = container;
    this.theftX = mx;
    this.theftZ = mz;

    this.heat = Math.min(3, this.heat + 1);
    this.heatTimer = 0;
    if (this.heat >= 3 && !this.hunter) {
      const angle = Math.random() * Math.PI * 2;
      this.hunter = this.wildlife.spawnHunterBattleship(
        boatX + Math.cos(angle) * HUNTER_SPAWN_DIST,
        boatZ + Math.sin(angle) * HUNTER_SPAWN_DIST,
      );
    }
    this.callbacks.onHeat(this.heat);
    this.callbacks.onKarma(-10, 'Stole a cargo container');
  }

  private nearestCargoShip(x: number, z: number): WildlifeEntity | null {
    const found = this.wildlife.findNearestVesselOrZone(x, z, PLUNDER_RANGE);
    return found && found.entity.type === 'cargo_ship' && !found.entity.towed ? found.entity : null;
  }

  private notice(text: string): void {
    this.callbacks.onBanner(text);
    this.noticeTimer = 3;
  }

  private updateBanner(dt: number, boatX: number, boatZ: number): void {
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer > 0) return; // let the notice breathe
    }
    if (!this.hotCargo) {
      this.callbacks.onBanner(null);
      return;
    }
    const attached = this.towing.getTowedEntity() === this.hotCargo;
    if (!attached) {
      this.callbacks.onBanner('💰 Hot cargo adrift — hook it back up (G)');
      return;
    }
    const dist = Math.round(Math.hypot(boatX - this.theftX, boatZ - this.theftZ));
    this.callbacks.onBanner(
      dist < FENCE_MIN_DIST
        ? `💰 Hot cargo — get clear of the theft · ${dist}/${FENCE_MIN_DIST}m`
        : '💰 Hot cargo — fence it at any discovered harbor',
    );
  }

  private updateFence(boatX: number, boatZ: number): void {
    if (!this.hotCargo || this.towing.getTowedEntity() !== this.hotCargo) return;
    if (!this.callbacks.isSafeHarbor(boatX, boatZ)) return;
    const dist = Math.hypot(boatX - this.theftX, boatZ - this.theftZ);
    if (dist < FENCE_MIN_DIST) return; // banner already explains

    const payout = Math.min(150, Math.max(60, Math.round(dist / 10)));
    this.towing.releaseEntity(this.hotCargo);
    this.wildlife.removeEntity(this.hotCargo);
    this.hotCargo = null;
    this.callbacks.onBanner(null);
    this.callbacks.onFence(payout);
  }

  private updateHeat(dt: number, boatX: number, boatZ: number): void {
    // Cooling: only while the line is clean of hot cargo
    const carryingHot = this.hotCargo !== null && this.towing.getTowedEntity() === this.hotCargo;
    if (this.heat > 0 && !carryingHot) {
      this.heatTimer += dt;
      if (this.heatTimer >= HEAT_DECAY_SECONDS) {
        this.heatTimer = 0;
        this.heat--;
        this.callbacks.onHeat(this.heat);
      }
    }

    // 1★+: the nearest patrol noses toward your position
    if (this.heat >= 1) {
      let nearest: WildlifeEntity | null = null;
      let nearestDist = Infinity;
      for (const bs of this.wildlife.getBattleships()) {
        const d = Math.hypot(bs.mesh.position.x - boatX, bs.mesh.position.z - boatZ);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = bs;
        }
      }
      if (nearest) this.steerToward(nearest, boatX, boatZ, 0.25, dt);
    }

    // 3★: the hunter runs you down
    if (this.hunter) {
      if (!this.wildlife.isEntityAlive(this.hunter)) {
        this.hunter = null; // sunk or expired — the sea forgets
      } else if (this.heat >= 3) {
        this.steerToward(this.hunter, boatX, boatZ, 0.8, dt);
      } else {
        this.hunter.speed = 2.5; // stand down to ordinary patrol speed
        this.hunter = null;
      }
    }
  }

  private steerToward(e: WildlifeEntity, x: number, z: number, turnRate: number, dt: number): void {
    const target = Math.atan2(x - e.mesh.position.x, z - e.mesh.position.z);
    let diff = target - e.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.heading += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
  }
}
