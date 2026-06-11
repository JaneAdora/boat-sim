const STORAGE_KEY = 'tb-credits';

/** Salvage credits — earned from contracts, rescues, records, discoveries. */
export function getCredits(storage: Storage = localStorage): number {
  const n = parseInt(storage.getItem(STORAGE_KEY) ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function addCredits(amount: number, storage: Storage = localStorage): number {
  const next = getCredits(storage) + Math.max(0, Math.round(amount));
  try {
    storage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable — credits just don't persist.
  }
  return next;
}

/** Returns false (and spends nothing) if the balance is insufficient. */
export function spendCredits(amount: number, storage: Storage = localStorage): boolean {
  const current = getCredits(storage);
  if (current < amount) return false;
  try {
    storage.setItem(STORAGE_KEY, String(current - amount));
  } catch {
    return false;
  }
  return true;
}
