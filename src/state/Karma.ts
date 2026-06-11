const STORAGE_KEY = 'tb-karma';

export const KARMA_MIN = -100;
export const KARMA_MAX = 100;

/**
 * Karma — the permanent moral ledger. Rescues raise it, piracy and cruelty
 * lower it; ordinary work (contracts, races, fighting armed battleships) is
 * neutral. Distinct from heat, which is the short-term naval response.
 */
export function getKarma(storage: Storage = localStorage): number {
  const n = parseInt(storage.getItem(STORAGE_KEY) ?? '0', 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(KARMA_MIN, Math.min(KARMA_MAX, n));
}

export function addKarma(delta: number, storage: Storage = localStorage): number {
  const next = Math.max(KARMA_MIN, Math.min(KARMA_MAX, getKarma(storage) + Math.round(delta)));
  try {
    storage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable — karma just doesn't persist.
  }
  return next;
}

export function karmaTitle(karma: number): string {
  if (karma <= -60) return 'Terror of the Tides';
  if (karma <= -25) return 'Outlaw';
  if (karma >= 60) return 'Guardian of the Sea';
  if (karma >= 25) return 'Good Samaritan';
  return 'Drifter';
}

/** Shipyard price multiplier — dockmasters gossip about your reputation. */
export function karmaPriceFactor(karma: number): number {
  if (karma <= -60) return 1.3;
  if (karma <= -25) return 1.15;
  if (karma >= 60) return 0.9;
  if (karma >= 25) return 0.95;
  return 1;
}
