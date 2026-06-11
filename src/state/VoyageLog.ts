export interface VoyageStats {
  bestKills: number;
  voyages: number;
  contracts: number;
}

const STORAGE_KEY = 'tb-stats';

export function loadStats(storage: Storage = localStorage): VoyageStats {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    const o = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    return {
      bestKills: typeof o.bestKills === 'number' ? o.bestKills : 0,
      voyages: typeof o.voyages === 'number' ? o.voyages : 0,
      contracts: typeof o.contracts === 'number' ? o.contracts : 0,
    };
  } catch {
    return { bestKills: 0, voyages: 0, contracts: 0 };
  }
}

function save(stats: VoyageStats, storage: Storage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable — stats just don't persist.
  }
}

export function recordVoyageStart(storage: Storage = localStorage): void {
  const stats = loadStats(storage);
  stats.voyages++;
  save(stats, storage);
}

export function bumpContracts(storage: Storage = localStorage): void {
  const stats = loadStats(storage);
  stats.contracts++;
  save(stats, storage);
}

/**
 * Raise the persisted best-kills high-water mark. Called periodically during
 * play (not on exit) so closing the tab mid-voyage never loses a record.
 */
export function bumpBestKills(kills: number, storage: Storage = localStorage): void {
  const stats = loadStats(storage);
  if (kills <= stats.bestKills) return;
  stats.bestKills = kills;
  save(stats, storage);
}
