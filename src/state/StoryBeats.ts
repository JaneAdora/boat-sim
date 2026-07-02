import type { JOURNAL_ENTRIES } from './JournalTracker';

export type V2 = { x: number; z: number };

/** What the scripted-encounter layer spawns for a beat and how it completes. */
export type EncounterSpec =
  | { kind: 'tow-derelict'; spawn: V2; radius: number } // dock resolved to Greyharbor at runtime
  | { kind: 'pickup'; spawn: V2; radius: number }
  | { kind: 'rescue'; spawn: V2; safeRadius: number }
  | { kind: 'sonar-contact'; spawn: V2; radius: number; depth: number }
  | { kind: 'mermaid'; spawn: V2; radius: number }
  | { kind: 'leviathan-witness'; spawn: V2; radius: number }
  | { kind: 'leviathan-boss'; spawn: V2; lurePasses: number }
  // ── Act 2 ──
  | {
      kind: 'multi-pickup'; // beat 11: N salvage contacts, then return to dock
      points: { id: string; x: number; z: number }[];
      radius: number;
      dockRadius: number;
    }
  | {
      kind: 'soul-transport'; // beat 13: the Drowned Choir
      hamlet: V2; // trench-floor site (depths come from TrenchProfile)
      souls: { id: string; name: string; dx: number; dz: number }[];
      pickupRadius: number; // 3D contact
      deliverRadius: number; // surfaced, near the recovery vessel
    };

export interface StoryBeat {
  id: string;
  title: string;
  brief: string; // narration toast on begin
  objective: string; // quest-log imperative
  requiresBoat?: string; // def.name — launch guard + quest-log nudge
  encounter: EncounterSpec;
  reward: {
    credits?: number;
    karma?: number;
    unlockBoat?: string;
    journalKey?: keyof typeof JOURNAL_ENTRIES;
    flag?: string;
    successLine: string;
  };
}

/**
 * Open-water trail, compact and heading east from Greyharbor (dock ≈ (-540,96)),
 * so the slow tug/sub legs stay ~300-560m. All points validated open water vs the
 * real generator (see tests/campaign.test.ts). Re-derive with the layout helper if
 * WORLD_SEED ever changes.
 */
export const STORY_LOCATIONS = {
  drift: { x: 20, z: 56 },
  reef: { x: 360, z: 136 },
  mayday: { x: 200, z: -124 },
  trench: { x: 1100, z: 86 },
} as const;

export const STORY_BEATS: StoryBeat[] = [
  {
    id: 'empty-berth',
    title: 'The Empty Berth',
    brief: 'Dockmaster: "The Marigold never came in. Find her, Captain."',
    objective: 'Reach the Marigold, then tow her home to Greyharbor.',
    encounter: { kind: 'tow-derelict', spawn: { x: -240, z: 56 }, radius: 44 },
    reward: {
      credits: 60,
      journalKey: 'rescue',
      successLine: 'The Marigold is home — and empty. "Quiet water out east," someone mutters.',
    },
  },
  {
    id: 'message-swell',
    title: 'Message in the Swell',
    brief: 'Search the eastern drift where the Marigold was lost.',
    objective: 'Recover the bottled message at the eastern drift.',
    encounter: { kind: 'pickup', spawn: STORY_LOCATIONS.drift, radius: 22 },
    reward: {
      credits: 40,
      journalKey: 'treasure',
      successLine: 'A captain’s last note: "a sound like the whole sea breathing." A reef is marked.',
    },
  },
  {
    id: 'reef-wrecks',
    title: 'The Reef of Wrecks',
    brief: 'Make for the marked reef.',
    objective: 'Recover floating wreckage at the reef.',
    encounter: { kind: 'pickup', spawn: STORY_LOCATIONS.reef, radius: 26 },
    reward: {
      credits: 50,
      journalKey: 'wrecks',
      successLine: 'A torn net and a scale the size of a dinner plate. The answers are deeper than you can reach.',
    },
  },
  {
    id: 'souls-water',
    title: 'Souls in the Water',
    brief: 'MAYDAY on the coastguard channel — a ship is going down nearby.',
    objective: 'Reach the mayday and tow the foundering vessel clear.',
    encounter: { kind: 'rescue', spawn: STORY_LOCATIONS.mayday, safeRadius: 170 },
    reward: {
      credits: 80,
      karma: 10,
      flag: 'goodwill',
      unlockBoat: 'Submarine', // R2: unlock on beat-4 completion (coastguard loans the sub)
      journalKey: 'rescue',
      successLine:
        'Survivors safe. One is raving: "it came up under us, big as the harbor." The coastguard owes you — take their survey sub.',
    },
  },
  {
    id: 'down-dark',
    title: 'Down to the Dark',
    brief: 'Take the submarine out and dive the reef.',
    objective: 'Dive the reef wrecks in the submarine.',
    requiresBoat: 'Submarine',
    encounter: { kind: 'sonar-contact', spawn: STORY_LOCATIONS.reef, radius: 70, depth: -12 },
    reward: {
      journalKey: 'wrecks',
      successLine:
        'Sonar paints a contact too big for any whale, and a hull raked by something clawed. A song drifts up the trench.',
    },
  },
  {
    id: 'mermaid-warning',
    title: "The Mermaid's Warning",
    brief: 'Follow the song toward the trench.',
    objective: 'Find the mermaid by ear near the trench.',
    encounter: { kind: 'mermaid', spawn: { x: 740, z: 16 }, radius: 16 },
    reward: {
      credits: 60,
      journalKey: 'mermaid',
      successLine: 'She names what woke below and presses a charm into your hand. "Do not go quiet into that water."',
    },
  },
  {
    id: 'witness',
    title: 'Witness',
    brief: 'Make for the trench coordinates.',
    objective: 'Reach the trench — and survive what you find.',
    encounter: { kind: 'leviathan-witness', spawn: STORY_LOCATIONS.trench, radius: 120 },
    reward: {
      credits: 100,
      journalKey: 'leviathan',
      successLine: 'You watch it take a ship whole. Run. Then come back ready.',
    },
  },
  {
    id: 'vanishing-tide',
    title: 'The Vanishing Tide',
    brief: 'It knows you are here. Finish this.',
    objective: 'Defeat the Leviathan (or lure it into the trench).',
    encounter: { kind: 'leviathan-boss', spawn: STORY_LOCATIONS.trench, lurePasses: 3 },
    reward: {
      credits: 300,
      karma: 15,
      journalKey: 'leviathan-slain',
      successLine:
        'The Leviathan sounds for the last time — fleeing something deeper. The tide is yours, Captain. (To be continued.)',
    },
  },
];

/** Static graph checks (boat names resolved against the registry by the caller). */
export function validateBeatGraph(knownBoatNames: string[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const b of STORY_BEATS) {
    if (ids.has(b.id)) errs.push(`duplicate id ${b.id}`);
    ids.add(b.id);
    if (b.requiresBoat && !knownBoatNames.includes(b.requiresBoat))
      errs.push(`${b.id}: requiresBoat ${b.requiresBoat} not in registry`);
    if (b.reward.unlockBoat && !knownBoatNames.includes(b.reward.unlockBoat))
      errs.push(`${b.id}: unlockBoat ${b.reward.unlockBoat} not in registry`);
  }
  return errs;
}
