import { describe, expect, it } from 'vitest';
import { hasWitnessedLeviathan, recordLeviathanWitnessed } from '../src/state/LeviathanState';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('leviathan state', () => {
  it('starts unwitnessed, persists the sighting', () => {
    const s = new MemoryStorage();
    expect(hasWitnessedLeviathan(s)).toBe(false);
    recordLeviathanWitnessed(s);
    expect(hasWitnessedLeviathan(s)).toBe(true);
  });

  it('treats junk storage as unwitnessed', () => {
    const s = new MemoryStorage();
    s.setItem('tb-leviathan', 'maybe?');
    expect(hasWitnessedLeviathan(s)).toBe(false);
  });
});
