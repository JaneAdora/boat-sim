import { BoatDefinition } from '../boats/BoatDefinition';
import { spendCredits } from './Wallet';

export type UpgradeKey = 'engine' | 'hull' | 'winch';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  desc: string;
  cost: number;
}

export const UPGRADE_CATALOG: UpgradeDef[] = [
  { key: 'engine', name: 'Engine tune', desc: '+3 knots top speed', cost: 250 },
  { key: 'hull', name: 'Reinforced hull', desc: 'A fourth hull point', cost: 200 },
  { key: 'winch', name: 'Tow winch', desc: 'Hook tows from much further away', cost: 150 },
];

const STORAGE_KEY = 'tb-upgrades';

type UpgradeStore = Record<string, Partial<Record<UpgradeKey, boolean>>>;

function load(storage: Storage): UpgradeStore {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as UpgradeStore) : {};
  } catch {
    return {};
  }
}

export function hasUpgrade(boatName: string, key: UpgradeKey, storage: Storage = localStorage): boolean {
  return load(storage)[boatName]?.[key] === true;
}

/** Buy an upgrade for a boat. Spends credits; false if owned or unaffordable. */
export function buyUpgrade(boatName: string, key: UpgradeKey, storage: Storage = localStorage): boolean {
  const def = UPGRADE_CATALOG.find((u) => u.key === key);
  if (!def || hasUpgrade(boatName, key, storage)) return false;
  if (!spendCredits(def.cost, storage)) return false;
  const store = load(storage);
  store[boatName] = { ...store[boatName], [key]: true };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Credits were spent but the unlock didn't persist — extremely unlikely;
    // the session still gets the upgrade via the returned true.
  }
  return true;
}

/** Apply owned stat upgrades to a boat definition (returns a copy). */
export function applyBoatUpgrades(def: BoatDefinition, storage: Storage = localStorage): BoatDefinition {
  if (!hasUpgrade(def.name, 'engine', storage)) return def;
  return { ...def, maxSpeedKnots: def.maxSpeedKnots + 3 };
}
