const STORAGE_KEY = 'tb-mermaid';

export const MERMAID_MAX = 3;

/** Encounters completed (0–3). Three nights, three gifts. */
export function getMermaidLevel(storage: Storage = localStorage): number {
  const n = parseInt(storage.getItem(STORAGE_KEY) ?? '0', 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MERMAID_MAX, n));
}

export function recordMermaidEncounter(storage: Storage = localStorage): number {
  const next = Math.min(MERMAID_MAX, getMermaidLevel(storage) + 1);
  try {
    storage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable — she'll sing the same song again. A mercy, really.
  }
  return next;
}

/**
 * Stereo pan for a sound source heard from a boat: 0 dead ahead, +1 hard to
 * starboard, −1 hard to port. The ear is the only navigation instrument the
 * mermaid allows, so this little function IS the quest mechanic.
 */
export function bearingPan(boatHeading: number, dx: number, dz: number): number {
  const bearing = Math.atan2(dx, dz);
  let rel = bearing - boatHeading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return Math.max(-1, Math.min(1, Math.sin(rel)));
}
