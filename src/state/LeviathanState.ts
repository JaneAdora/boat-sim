const STORAGE_KEY = 'tb-leviathan';

/** Has this player ever witnessed the leviathan take a ship? Spectacle
 *  comes before threat: the boss only hunts players who have seen it. */
export function hasWitnessedLeviathan(storage: Storage = localStorage): boolean {
  return storage.getItem(STORAGE_KEY) === 'seen';
}

export function recordLeviathanWitnessed(storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, 'seen');
  } catch {
    // Storage unavailable — they'll get the show again. Worse fates exist.
  }
}
