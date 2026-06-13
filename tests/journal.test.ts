import { describe, expect, it } from 'vitest';
import { JournalTracker, JOURNAL_ENTRIES, JOURNAL_TOTAL, journalCount } from '../src/state/JournalTracker';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('JournalTracker', () => {
  it('logs each sighting exactly once, with its catalog text', () => {
    const j = new JournalTracker(new MemoryStorage());
    expect(j.log('whale')).toBe(JOURNAL_ENTRIES.whale);
    expect(j.log('whale')).toBeNull();
    expect(j.count()).toBe(1);
  });

  it('persists across sessions and reports lifetime count', () => {
    const storage = new MemoryStorage();
    const first = new JournalTracker(storage);
    first.log('dolphins');
    first.log('storm');

    const second = new JournalTracker(storage);
    expect(second.log('dolphins')).toBeNull();
    expect(journalCount(storage)).toBe(2);
  });

  it('ignores unknown keys and corrupt storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('tb-journal', '{bad');
    const j = new JournalTracker(storage);
    expect(j.log('kraken' as never)).toBeNull();
    expect(j.count()).toBe(0);
    expect(JOURNAL_TOTAL).toBe(20);
  });
});
