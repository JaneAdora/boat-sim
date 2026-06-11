const STORAGE_KEY = 'tb-journal';

/** The field journal's catalog: sighting key → toast text. */
export const JOURNAL_ENTRIES: Record<string, string> = {
  dolphins: 'Dolphins riding your bow wake',
  whale: 'A whale surfacing',
  fishing: 'A fishing boat at work',
  cargo: 'A cargo ship on the trade routes',
  battleship: 'A battleship on patrol',
  night: 'Sailing under the stars',
  storm: 'Weathered a storm',
  rescue: 'Answered a mayday call',
};

export const JOURNAL_TOTAL = Object.keys(JOURNAL_ENTRIES).length;

function loadKeys(storage: Storage): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Lifetime journal entry count (for the selector stats line). */
export function journalCount(storage: Storage = localStorage): number {
  let n = 0;
  for (const key of loadKeys(storage)) {
    if (key in JOURNAL_ENTRIES) n++;
  }
  return n;
}

/**
 * The wildlife field journal: persisted first-time sightings, the soothing
 * counterpart to the kill counter. Same pattern as island discovery.
 */
export class JournalTracker {
  private logged: Set<string>;

  constructor(private storage: Storage = localStorage) {
    this.logged = loadKeys(storage);
  }

  /** Log a sighting; returns its journal text the first time, else null. */
  log(key: keyof typeof JOURNAL_ENTRIES & string): string | null {
    if (!(key in JOURNAL_ENTRIES) || this.logged.has(key)) return null;
    this.logged.add(key);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify([...this.logged]));
    } catch {
      // Storage unavailable — sighting still counts this session.
    }
    return JOURNAL_ENTRIES[key];
  }

  count(): number {
    let n = 0;
    for (const key of this.logged) {
      if (key in JOURNAL_ENTRIES) n++;
    }
    return n;
  }
}
