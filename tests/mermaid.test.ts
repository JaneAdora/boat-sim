import { describe, expect, it } from 'vitest';
import { getMermaidLevel, recordMermaidEncounter, bearingPan, MERMAID_MAX } from '../src/state/MermaidState';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('mermaid progress', () => {
  it('counts three encounters and stops', () => {
    const s = new MemoryStorage();
    expect(getMermaidLevel(s)).toBe(0);
    expect(recordMermaidEncounter(s)).toBe(1);
    expect(recordMermaidEncounter(s)).toBe(2);
    expect(recordMermaidEncounter(s)).toBe(3);
    expect(recordMermaidEncounter(s)).toBe(MERMAID_MAX); // saturates
    expect(getMermaidLevel(s)).toBe(3);
  });

  it('treats corrupt storage as a fresh start', () => {
    const s = new MemoryStorage();
    s.setItem('tb-mermaid', 'song?');
    expect(getMermaidLevel(s)).toBe(0);
    s.setItem('tb-mermaid', '99');
    expect(getMermaidLevel(s)).toBe(MERMAID_MAX); // clamped, not trusted
  });
});

describe('bearingPan — the ear as compass', () => {
  it('is silent-centered dead ahead and fully panned abeam', () => {
    // Boat heading 0 = facing +z. Source dead ahead (dx 0, dz +): pan 0.
    expect(bearingPan(0, 0, 100)).toBeCloseTo(0, 5);
    // Source hard to starboard (+x): pan +1.
    expect(bearingPan(0, 100, 0)).toBeCloseTo(1, 5);
    // Source hard to port (−x): pan −1.
    expect(bearingPan(0, -100, 0)).toBeCloseTo(-1, 5);
  });

  it('tracks the boat\'s own heading', () => {
    // Boat facing +x (heading π/2), source at +x → dead ahead → 0
    expect(bearingPan(Math.PI / 2, 100, 0)).toBeCloseTo(0, 5);
    // Same boat, source at +z → now off the PORT bow → negative
    expect(bearingPan(Math.PI / 2, 0, 100)).toBeLessThan(0);
  });

  it('mirrors behind the boat without exceeding [-1, 1]', () => {
    const p = bearingPan(0, 50, -50); // behind-right
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
