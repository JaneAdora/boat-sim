import { describe, expect, it } from 'vitest';
import { getCredits, addCredits, spendCredits } from '../src/state/Wallet';
import { buyUpgrade, hasUpgrade, applyBoatUpgrades, UPGRADE_CATALOG } from '../src/state/Upgrades';
import { TUGBOAT } from '../src/boats/Tugboat';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('Wallet', () => {
  it('accumulates and spends, refusing overdrafts', () => {
    const s = new MemoryStorage();
    addCredits(100, s);
    addCredits(25, s);
    expect(getCredits(s)).toBe(125);
    expect(spendCredits(200, s)).toBe(false);
    expect(spendCredits(120, s)).toBe(true);
    expect(getCredits(s)).toBe(5);
  });

  it('treats corrupt or negative storage as zero', () => {
    const s = new MemoryStorage();
    s.setItem('tb-credits', 'lots');
    expect(getCredits(s)).toBe(0);
    s.setItem('tb-credits', '-50');
    expect(getCredits(s)).toBe(0);
  });
});

describe('Upgrades', () => {
  it('buys once, charges the catalog price, persists', () => {
    const s = new MemoryStorage();
    const engine = UPGRADE_CATALOG.find((u) => u.key === 'engine')!;
    addCredits(engine.cost + 10, s);

    expect(buyUpgrade('Tugboat', 'engine', s)).toBe(true);
    expect(getCredits(s)).toBe(10);
    expect(hasUpgrade('Tugboat', 'engine', s)).toBe(true);
    // already owned — no double charge
    expect(buyUpgrade('Tugboat', 'engine', s)).toBe(false);
    expect(getCredits(s)).toBe(10);
    // other boats unaffected
    expect(hasUpgrade('Speedboat', 'engine', s)).toBe(false);
  });

  it('refuses when unaffordable', () => {
    const s = new MemoryStorage();
    addCredits(5, s);
    expect(buyUpgrade('Tugboat', 'hull', s)).toBe(false);
    expect(getCredits(s)).toBe(5);
  });

  it('applies a karma price factor when given one', () => {
    const s = new MemoryStorage();
    const hull = UPGRADE_CATALOG.find((u) => u.key === 'hull')!;
    addCredits(hull.cost, s); // enough at list price...
    expect(buyUpgrade('Tugboat', 'hull', s, 1.3)).toBe(false); // ...not at outlaw markup
    expect(buyUpgrade('Tugboat', 'hull', s, 0.9)).toBe(true); // guardian discount
    expect(getCredits(s)).toBe(hull.cost - Math.round(hull.cost * 0.9));
  });

  it('engine tune adds 3 knots to the boat definition copy', () => {
    const s = new MemoryStorage();
    addCredits(1000, s);
    expect(applyBoatUpgrades(TUGBOAT, s).maxSpeedKnots).toBe(TUGBOAT.maxSpeedKnots);
    buyUpgrade(TUGBOAT.name, 'engine', s);
    const tuned = applyBoatUpgrades(TUGBOAT, s);
    expect(tuned.maxSpeedKnots).toBe(TUGBOAT.maxSpeedKnots + 3);
    expect(TUGBOAT.maxSpeedKnots).toBe(18); // original untouched
  });
});
