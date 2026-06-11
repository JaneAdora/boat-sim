import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { ChunkManager } from '../world/ChunkManager';
import { islandName } from '../world/IslandNames';

interface ActiveContract {
  barge: WildlifeEntity;
  destX: number;
  destZ: number;
  destRadius: number;
  destName: string;
  sourceName: string;
}

export interface ContractCallbacks {
  /** Update (or clear, with null) the persistent contract banner. */
  onBanner: (text: string | null) => void;
  /** A contract was just completed at the named island. */
  onComplete: (destName: string) => void;
}

/**
 * Salvage contracts: a derelict barge drifts near a source island; tow it
 * (G) to a named destination island. No timers, no failure state — the barge
 * waits as long as it takes.
 */
export class ContractSystem {
  private active: ActiveContract | null = null;
  private cooldown = 12; // grace period before the first offer
  private bannerTimer = 0;

  private static readonly SOURCE_RANGE = 700;   // island near the player
  private static readonly DEST_MIN = 350;       // contract leg length bounds
  private static readonly DEST_MAX = 1600;
  private static readonly DELIVERY_MARGIN = 55; // how close to the dest island counts

  constructor(
    private wildlife: WildlifeSystem,
    private chunkManager: ChunkManager,
    private callbacks: ContractCallbacks,
  ) {}

  update(dt: number, boatX: number, boatZ: number): void {
    if (this.active) {
      this.updateActive(dt);
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = 10; // retry cadence when no contract could be generated
      this.tryGenerate(boatX, boatZ);
    }
  }

  /** Destination beacon for the minimap, or null when no contract is active. */
  getMarker(): { x: number; z: number } | null {
    return this.active ? { x: this.active.destX, z: this.active.destZ } : null;
  }

  private tryGenerate(boatX: number, boatZ: number): void {
    const islands = this.chunkManager.getIslandPositions();
    if (islands.length < 2) return;

    // Source: nearest island to the player within range
    let source: (typeof islands)[number] | null = null;
    let sourceDist = ContractSystem.SOURCE_RANGE;
    for (const isl of islands) {
      const d = Math.hypot(isl.x - boatX, isl.z - boatZ);
      if (d < sourceDist) {
        sourceDist = d;
        source = isl;
      }
    }
    if (!source) return;

    // Destination: a different island at a satisfying towing distance
    const candidates = islands.filter((isl) => {
      if (isl === source) return false;
      const d = Math.hypot(isl.x - source.x, isl.z - source.z);
      return d >= ContractSystem.DEST_MIN && d <= ContractSystem.DEST_MAX;
    });
    if (candidates.length === 0) return;
    const dest = candidates[Math.floor(Math.random() * candidates.length)];

    // Spawn the barge offshore of the source island, on the player's side
    const toPlayerX = boatX - source.x;
    const toPlayerZ = boatZ - source.z;
    const len = Math.hypot(toPlayerX, toPlayerZ) || 1;
    const offshore = source.radius + 35;
    const barge = this.wildlife.spawnBarge(
      source.x + (toPlayerX / len) * offshore,
      source.z + (toPlayerZ / len) * offshore,
    );

    this.active = {
      barge,
      destX: dest.x,
      destZ: dest.z,
      destRadius: dest.radius,
      destName: islandName(dest.chunkX, dest.chunkZ, dest.biome),
      sourceName: islandName(source.chunkX, source.chunkZ, source.biome),
    };
    this.bannerTimer = 0;
  }

  private updateActive(dt: number): void {
    const c = this.active!;

    // Barge vanished somehow (defensive) — drop the contract quietly
    if (!this.wildlife.isEntityAlive(c.barge)) {
      this.active = null;
      this.callbacks.onBanner(null);
      this.cooldown = 20;
      return;
    }

    const bargeX = c.barge.mesh.position.x;
    const bargeZ = c.barge.mesh.position.z;
    const dist = Math.hypot(bargeX - c.destX, bargeZ - c.destZ);

    // Delivered?
    if (dist <= c.destRadius + ContractSystem.DELIVERY_MARGIN) {
      this.wildlife.removeEntity(c.barge);
      this.active = null;
      this.callbacks.onBanner(null);
      this.callbacks.onComplete(c.destName);
      this.cooldown = 30; // breather before the next offer
      return;
    }

    // Refresh the banner ~1Hz (distance readout)
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) {
      this.bannerTimer = 1;
      const verb = c.barge.towed ? 'Deliver to' : `Barge adrift off ${c.sourceName} — tow it to`;
      this.callbacks.onBanner(`⚓ ${verb} ${c.destName} · ${Math.round(dist)}m`);
    }
  }
}
