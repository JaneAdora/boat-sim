import { ChunkManager } from '../world/ChunkManager';
import { DiscoveryTracker } from '../state/DiscoveryTracker';
import { Biome } from '../world/IslandGenerator';
import { HarborPanel } from '../ui/HarborPanel';
import { dockGreeting, tavernRumor, ROD_COST } from '../state/Harbor';
import { islandName } from '../world/IslandNames';
import { hasRod, buyRod, ledgerCount, FISH_TOTAL } from '../state/Fishing';
import { getCredits, spendCredits } from '../state/Wallet';

export interface HarborCallbacks {
  /** Dockside prompt banner (null clears it). */
  onPrompt: (text: string | null) => void;
  /** Rod bought — engine plays a sound and toasts. */
  onPurchase: () => void;
}

/** How close (to the dock head) the boat docks, and how slow it must be. */
const DOCK_RANGE = 38;
const DOCK_MAX_SPEED = 3.5;

interface Harbor { chunkX: number; chunkZ: number; biome: Biome; x: number; z: number; }

/**
 * Harbour towns — pull up slow to a discovered island's dock and press L to
 * open the notice board: greeting, catch log, the Angler's Rod for sale, and a
 * tavern rumour. The deterministic content lives in state/Harbor and the docks
 * in ChunkManager; this drives proximity, the L key, and the purchase.
 */
export class HarborSystem {
  private panel = new HarborPanel();
  private current: Harbor | null = null; // the harbour the open panel belongs to
  private toggleRequested = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'KeyL') this.toggleRequested = true;
    // Esc also opens the pause menu (handled in main); close the board first so
    // it never floats over that overlay. Done synchronously, independent of the
    // update loop, which may be paused while the menu is up.
    else if (e.code === 'Escape' && this.panel.isOpen()) this.close();
  };

  constructor(
    private chunkManager: ChunkManager,
    private discovery: DiscoveryTracker,
    private storage: Storage,
    private callbacks: HarborCallbacks,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.panel.dispose();
  }

  isOpen(): boolean {
    return this.panel.isOpen();
  }

  update(_dt: number, boatX: number, boatZ: number, boatSpeed: number): void {
    const toggle = this.toggleRequested;
    this.toggleRequested = false;

    // Panel open: hold it until L again or the boat drifts off the dock.
    if (this.panel.isOpen()) {
      if (toggle) { this.close(); return; }
      if (this.current) {
        const dx = this.current.x - boatX;
        const dz = this.current.z - boatZ;
        if (dx * dx + dz * dz > (DOCK_RANGE + 14) ** 2) this.close();
      }
      return;
    }

    // Panel closed: offer to dock at the nearest discovered harbour if stopped.
    const near = this.nearestDockable(boatX, boatZ);
    if (near && boatSpeed <= DOCK_MAX_SPEED) {
      this.callbacks.onPrompt(`⚓ L — Dock at ${islandName(near.chunkX, near.chunkZ, near.biome)}`);
      if (toggle) this.open(near);
    } else {
      this.callbacks.onPrompt(null);
    }
  }

  private nearestDockable(boatX: number, boatZ: number): Harbor | null {
    let best: Harbor | null = null;
    let bestSq = DOCK_RANGE * DOCK_RANGE;
    for (const h of this.chunkManager.getHarbors()) {
      if (!this.discovery.isDiscovered(h.chunkX, h.chunkZ)) continue;
      const dx = h.x - boatX;
      const dz = h.z - boatZ;
      const sq = dx * dx + dz * dz;
      if (sq < bestSq) { bestSq = sq; best = h; }
    }
    return best;
  }

  private open(h: Harbor): void {
    this.current = h;
    this.callbacks.onPrompt(null);
    this.render();
  }

  private render(): void {
    const h = this.current;
    if (!h) return;
    this.panel.open(
      {
        title: islandName(h.chunkX, h.chunkZ, h.biome),
        greeting: dockGreeting(h.chunkX, h.chunkZ, h.biome),
        catchText: `${ledgerCount(this.storage)} / ${FISH_TOTAL} species`,
        rumor: tavernRumor(h.chunkX, h.chunkZ),
        rodOwned: hasRod(this.storage),
        credits: getCredits(this.storage),
        rodCost: ROD_COST,
      },
      {
        onBuy: () => this.buy(),
        onClose: () => this.close(),
      },
    );
  }

  private buy(): void {
    if (hasRod(this.storage)) return;
    if (spendCredits(ROD_COST, this.storage)) {
      buyRod(this.storage);
      this.callbacks.onPurchase();
    }
    // Re-render either way: success shows "in your kit"; a failed spend (balance
    // changed under us) re-disables the button against the real balance.
    this.render();
  }

  private close(): void {
    this.panel.close();
    this.current = null;
  }
}
