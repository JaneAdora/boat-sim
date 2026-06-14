# Story Mode — "The Vanishing Tide" (Act 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an alternate Story Mode campaign — an 8-beat investigation ("The Vanishing Tide") that sequences existing encounters into an authored mystery, alongside the untouched Free Roam mode.

**Architecture:** A campaign-owned scripted-encounter layer. A new plain `MissionSystem` class (Engine-owned, ticked in `Engine.update`, like `DistressSystem`/`LeviathanSystem`) reads a pure `CampaignState` (localStorage `tb-story`), arms the active beat from declarative `StoryBeats` data — spawning mission-owned encounters at fixed, deterministic coordinates and **suspending the conflicting ambient trigger** — detects completion against the exact mission instance, grants the beat reward **once**, advances, and persists. A `QuestLog` panel + the existing waypoint/minimap marker chain guide the player. Greyharbor (the home dock) is the nearest hash-eligible harbor to origin, pre-discovered, used as the campaign spawn so relaunch == "return to harbor."

**Tech Stack:** TypeScript (strict), Three.js, Vite, vitest. Custom ECS (`src/ecs`). Web Audio. localStorage persistence (storage-injectable pure modules).

**Staging:** **Milestone 1** (Tasks 1–10) = the machine + beats 1–4 (tow / pickup / rescue) — independently testable end-to-end. **Milestone 2** (Tasks 11–15) = beats 5–8 (sub unlock, sonar, mermaid, Leviathan spectacle + finale). Each milestone ends green (`npm run build` + `vitest`) and is playtestable.

**Conventions (verified against the codebase):**
- Pure state modules take `storage: Storage = localStorage` and wrap writes in `try/catch`. Tests use an in-memory `MemoryStorage implements Storage` (see `tests/fishing.test.ts:1-16`).
- Boats are keyed by `def.name` **string** (e.g. `'Tugboat'`, `'Submarine'`) — that's what `tb-boat` stores. Confirm exact `.name` values from `src/boats/*.ts` when first needed.
- Toast: `engine.hud.showToast(label, headline)` (`HUD.ts:151`). Reward modules: `addCredits`/`addKarma`/`JournalTracker.log` (all storage-injectable).
- ECS: `class X extends System { constructor(priority); update(world,dt) }`; `world.addComponent(e,'Name',obj)`, `world.getComponent`, `world.query`, `world.createEntity`, `world.destroyEntity`. Components are interfaces keyed by string name (no `type` field).

---

## File Structure

**New files:**
- `src/state/CampaignState.ts` — pure campaign save/state machine.
- `src/state/StoryBeats.ts` — `StoryBeat`/`EncounterSpec` types, the 8 beats, `STORY_LOCATIONS`, graph validators.
- `src/state/StoryHarbor.ts` — deterministic Greyharbor finder (scans `generateIsland` for nearest eligible harbor) + sea-coordinate validation helper.
- `src/systems/MissionSystem.ts` — Engine-owned runtime: arm/complete/advance/reward/persist, marker getter, scripted-encounter orchestration.
- `src/ui/QuestLog.ts` — objective panel (title/objective/distance), collapsible, campaign-only.
- `tests/campaign.test.ts` — CampaignState + StoryBeats graph + StoryHarbor + reward-once tests.

**Modified files:**
- `src/state/GameConfig.ts` — add `campaign?: boolean`, `spawn?: {x:number;z:number}`.
- `src/main.ts` — Story vs Free Roam choice; campaign launch screen (Continue / New Game / unlocked-boat picker + wrong-boat guard); ESC → campaign launch in campaign mode.
- `src/Engine.ts` — construct CampaignState/MissionSystem/QuestLog when `config.campaign`; spawn at Greyharbor; insert campaign marker into the `??`-chain (`:757,763`); gate ambient reward callbacks for scripted instances; tick MissionSystem.
- `src/systems/LeviathanSystem.ts` — `beginScripted({x,z,phase,persistStorm})`, `endScripted()`, `scriptedResolved()`; suspend `tryAwaken` + storm-tied despawn while scripted.
- `src/systems/MermaidSystem.ts` — `beginScripted({x,z})`, `endScripted()`, `scriptedHeard()`; bypass night/calm/karma/lifetime gates for the scripted instance.
- `src/systems/DistressSystem.ts` — `beginScriptedRescue({x,z})`, `endScripted()`, expose the scripted vessel; suspend ambient `trySpawn` while scripted.
- `index.html` — `#quest-log` element + styles.

---

## MILESTONE 1 — Machine + beats 1–4

### Task 1: GameConfig — campaign + spawn fields

**Files:** Modify `src/state/GameConfig.ts`

- [ ] **Step 1: Add optional fields (keep the union intact)**

```ts
export type GameMode = 'classic' | 'magical';

export interface GameConfig {
  mode: GameMode;
  /** True only in Story Mode; gates construction of the campaign systems. */
  campaign?: boolean;
  /** Story spawn (Greyharbor dock). Free Roam leaves this undefined → default (0,1,0). */
  spawn?: { x: number; z: number };
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit` → Expected: PASS (no other file references break; fields are optional).

- [ ] **Step 3: Commit**

```bash
git add src/state/GameConfig.ts
git commit -m "feat(story): GameConfig campaign + spawn fields"
```

---

### Task 2: CampaignState (pure module, TDD)

**Files:** Create `src/state/CampaignState.ts`; Test `tests/campaign.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/campaign.test.ts
import { describe, expect, it } from 'vitest';
import {
  newCampaign, loadCampaign, saveCampaign, resetCampaign,
  advanceBeat, unlockBoat, setFlag, markCompleted, isComplete,
} from '../src/state/CampaignState';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('CampaignState', () => {
  it('new campaign starts at beat 0 with only the tug unlocked', () => {
    const s = newCampaign();
    expect(s.started).toBe(true);
    expect(s.beat).toBe(0);
    expect(s.unlockedBoats).toEqual(['Tugboat']);
  });

  it('save → load round-trips', () => {
    const st = new MemoryStorage();
    const s = newCampaign(); s.beat = 3; unlockBoat(s, 'Submarine'); setFlag(s, 'goodwill');
    saveCampaign(s, st);
    const loaded = loadCampaign(st);
    expect(loaded).not.toBeNull();
    expect(loaded!.beat).toBe(3);
    expect(loaded!.unlockedBoats).toContain('Submarine');
    expect(loaded!.flags.goodwill).toBe(true);
  });

  it('missing save loads null; corrupt save loads null', () => {
    const st = new MemoryStorage();
    expect(loadCampaign(st)).toBeNull();
    st.setItem('tb-story', '{not json');
    expect(loadCampaign(st)).toBeNull();
  });

  it('advanceBeat clears armedBeat and is a no-op past the end', () => {
    const s = newCampaign(); s.beat = 0; s.armedBeat = 0;
    advanceBeat(s);
    expect(s.beat).toBe(1);
    expect(s.armedBeat).toBeNull();
    s.beat = 999; advanceBeat(s);
    expect(s.beat).toBe(999); // clamped — never runs off the end
  });

  it('markCompleted is idempotent (reward-once guard)', () => {
    const s = newCampaign();
    markCompleted(s, 'empty-berth'); markCompleted(s, 'empty-berth');
    expect(s.completed.filter((x) => x === 'empty-berth')).toHaveLength(1);
  });

  it('resetCampaign wipes only tb-story', () => {
    const st = new MemoryStorage();
    st.setItem('tb-credits', '500'); saveCampaign(newCampaign(), st);
    resetCampaign(st);
    expect(loadCampaign(st)).toBeNull();
    expect(st.getItem('tb-credits')).toBe('500');
  });
});
```

- [ ] **Step 2: Run → expect FAIL** — `npx vitest run tests/campaign.test.ts` → "Cannot find module '../src/state/CampaignState'".

- [ ] **Step 3: Implement**

```ts
// src/state/CampaignState.ts
import { STORY_BEATS } from './StoryBeats';

const STORAGE_KEY = 'tb-story';
const START_BOAT = 'Tugboat'; // confirm against src/boats/Tugboat.ts `name`

export interface CampaignState {
  started: boolean;
  beat: number;                // index into STORY_BEATS
  armedBeat: number | null;    // beat currently armed (clean re-arm on load)
  completed: string[];         // completed beat ids — reward-once
  unlockedBoats: string[];     // boat def.name keys
  flags: Record<string, boolean>;
  lastBoat: string;
}

export function newCampaign(): CampaignState {
  return { started: true, beat: 0, armedBeat: null, completed: [], unlockedBoats: [START_BOAT], flags: {}, lastBoat: START_BOAT };
}

export function loadCampaign(storage: Storage = localStorage): CampaignState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const boats = Array.isArray(o.unlockedBoats) ? (o.unlockedBoats as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
    return {
      started: o.started === true,
      beat: Number.isInteger(o.beat) ? (o.beat as number) : 0,
      armedBeat: Number.isInteger(o.armedBeat) ? (o.armedBeat as number) : null,
      completed: Array.isArray(o.completed) ? (o.completed as unknown[]).filter((x) => typeof x === 'string') as string[] : [],
      unlockedBoats: boats.length ? boats : [START_BOAT],
      flags: o.flags && typeof o.flags === 'object' ? (o.flags as Record<string, boolean>) : {},
      lastBoat: typeof o.lastBoat === 'string' ? (o.lastBoat as string) : START_BOAT,
    };
  } catch { return null; }
}

export function saveCampaign(state: CampaignState, storage: Storage = localStorage): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export function resetCampaign(storage: Storage = localStorage): void {
  try { storage.removeItem(STORAGE_KEY); } catch { /* */ }
}

export function currentBeat(state: CampaignState) { return STORY_BEATS[state.beat] ?? null; }
export function isComplete(state: CampaignState): boolean { return state.beat >= STORY_BEATS.length; }
export function markCompleted(state: CampaignState, id: string): void { if (!state.completed.includes(id)) state.completed.push(id); }
export function advanceBeat(state: CampaignState): CampaignState {
  if (state.beat < STORY_BEATS.length) state.beat++;
  state.armedBeat = null;
  return state;
}
export function unlockBoat(state: CampaignState, key: string): void { if (!state.unlockedBoats.includes(key)) state.unlockedBoats.push(key); }
export function setFlag(state: CampaignState, key: string, val = true): void { state.flags[key] = val; }
```

> Note: `advanceBeat`'s "no-op past the end" test sets `beat=999`; since `999 < STORY_BEATS.length` is false, it stays — matches the test.

- [ ] **Step 4: Run → expect PASS** (Task 3 creates `StoryBeats`; if running before Task 3, temporarily stub `export const STORY_BEATS = []`). Run both together after Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/state/CampaignState.ts tests/campaign.test.ts
git commit -m "feat(story): CampaignState pure state machine + tests"
```

---

### Task 3: StoryBeats data + graph validators (TDD)

**Files:** Create `src/state/StoryBeats.ts`; extend `tests/campaign.test.ts`

- [ ] **Step 1: Add failing graph tests to `tests/campaign.test.ts`**

```ts
import { STORY_BEATS, validateBeatGraph } from '../src/state/StoryBeats';
import { JOURNAL_ENTRIES } from '../src/state/JournalTracker';

describe('StoryBeats graph', () => {
  it('has 8 beats with unique ids', () => {
    expect(STORY_BEATS).toHaveLength(8);
    const ids = STORY_BEATS.map((b) => b.id);
    expect(new Set(ids).size).toBe(8);
  });
  it('every journalKey reward exists in JOURNAL_ENTRIES', () => {
    for (const b of STORY_BEATS) {
      if (b.reward.journalKey) expect(b.reward.journalKey in JOURNAL_ENTRIES).toBe(true);
    }
  });
  it('every coordinate is finite', () => {
    for (const b of STORY_BEATS) {
      const e = b.encounter as { spawn?: { x: number; z: number } };
      if (e.spawn) { expect(Number.isFinite(e.spawn.x)).toBe(true); expect(Number.isFinite(e.spawn.z)).toBe(true); }
    }
  });
  it('the chain ends at the leviathan boss', () => {
    expect(STORY_BEATS[STORY_BEATS.length - 1].encounter.kind).toBe('leviathan-boss');
  });
  it('validateBeatGraph returns no errors for known boat names', () => {
    expect(validateBeatGraph(['Tugboat', 'Submarine'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → expect FAIL** — module missing.

- [ ] **Step 3: Implement `src/state/StoryBeats.ts`** (coordinates are validated by Task 4's helper; these are open water east of origin)

```ts
import type { JOURNAL_ENTRIES } from './JournalTracker';

export type V2 = { x: number; z: number };

export type EncounterSpec =
  | { kind: 'tow-derelict'; spawn: V2; radius: number }       // dock resolved to Greyharbor at runtime
  | { kind: 'pickup'; spawn: V2; radius: number }
  | { kind: 'rescue'; spawn: V2; safeRadius: number }
  | { kind: 'sonar-contact'; spawn: V2; radius: number; depth: number }
  | { kind: 'mermaid'; spawn: V2; radius: number }
  | { kind: 'leviathan-witness'; spawn: V2; radius: number }
  | { kind: 'leviathan-boss'; spawn: V2; lurePasses: number };

export interface StoryBeat {
  id: string;
  title: string;
  brief: string;        // narration toast on begin
  objective: string;    // quest-log imperative
  requiresBoat?: string; // def.name; launch guard + quest-log nudge
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

/** Open-water trail heading east (+X); validated by StoryHarbor.validateSeaCoord. */
export const STORY_LOCATIONS = {
  drift:  { x: 700,  z: 40 },
  reef:   { x: 1400, z: 120 },
  mayday: { x: 1050, z: -90 },
  trench: { x: 2200, z: 0 },
} as const;

export const STORY_BEATS: StoryBeat[] = [
  {
    id: 'empty-berth', title: 'The Empty Berth',
    brief: 'Dockmaster: "The Marigold never came in. Find her, Captain."',
    objective: 'Tow the drifting Marigold home to Greyharbor.',
    encounter: { kind: 'tow-derelict', spawn: { x: 420, z: 60 }, radius: 40 },
    reward: { credits: 60, journalKey: 'rescue', successLine: 'The Marigold is home — and empty. "Quiet water out east," someone mutters.' },
  },
  {
    id: 'message-swell', title: 'Message in the Swell',
    brief: 'Search the eastern drift where the Marigold was lost.',
    objective: 'Recover the bottled message at the eastern drift.',
    encounter: { kind: 'pickup', spawn: STORY_LOCATIONS.drift, radius: 22 },
    reward: { credits: 40, journalKey: 'treasure', successLine: 'A captain’s last note: "a sound like the whole sea breathing." A reef is marked.' },
  },
  {
    id: 'reef-wrecks', title: 'The Reef of Wrecks',
    brief: 'Make for the marked reef.',
    objective: 'Recover floating wreckage at the reef.',
    encounter: { kind: 'pickup', spawn: STORY_LOCATIONS.reef, radius: 26 },
    reward: { credits: 50, journalKey: 'wrecks', successLine: 'A torn net and a scale the size of a dinner plate. The answers are deeper than you can reach.' },
  },
  {
    id: 'souls-water', title: 'Souls in the Water',
    brief: 'MAYDAY on the coastguard channel — a ship is going down nearby.',
    objective: 'Reach the mayday and tow the foundering vessel clear.',
    encounter: { kind: 'rescue', spawn: STORY_LOCATIONS.mayday, safeRadius: 160 },
    reward: { credits: 80, karma: 10, flag: 'goodwill', journalKey: 'rescue', successLine: 'Survivors safe. One is raving: "it came up under us, big as the harbor." The coastguard owes you.' },
  },
  {
    id: 'down-dark', title: 'Down to the Dark',
    brief: 'The coastguard loans you a survey submarine. Dive the reef.',
    objective: 'Dive the reef wrecks in the submarine.',
    requiresBoat: 'Submarine',
    encounter: { kind: 'sonar-contact', spawn: STORY_LOCATIONS.reef, radius: 70, depth: -12 },
    reward: { unlockBoat: 'Submarine', journalKey: 'wrecks', successLine: 'Sonar paints a contact too big for any whale, and a hull raked by something clawed. A song drifts up the trench.' },
  },
  {
    id: 'mermaid-warning', title: "The Mermaid's Warning",
    brief: 'Follow the song toward the trench.',
    objective: 'Find the mermaid by ear near the trench.',
    encounter: { kind: 'mermaid', spawn: { x: 1900, z: -40 }, radius: 16 },
    reward: { credits: 60, journalKey: 'mermaid', successLine: 'She names what woke below and presses a charm into your hand. "Do not go quiet into that water."' },
  },
  {
    id: 'witness', title: 'Witness',
    brief: 'Make for the trench coordinates.',
    objective: 'Reach the trench — and survive what you find.',
    encounter: { kind: 'leviathan-witness', spawn: STORY_LOCATIONS.trench, radius: 120 },
    reward: { credits: 100, journalKey: 'leviathan', successLine: 'You watch it take a ship whole. Run. Then come back ready.' },
  },
  {
    id: 'vanishing-tide', title: 'The Vanishing Tide',
    brief: 'It knows you are here. Finish this.',
    objective: 'Defeat the Leviathan (or lure it into the trench).',
    encounter: { kind: 'leviathan-boss', spawn: STORY_LOCATIONS.trench, lurePasses: 3 },
    reward: { credits: 300, karma: 15, journalKey: 'leviathan-slain', successLine: 'The Leviathan sounds for the last time — fleeing something deeper. The tide is yours, Captain. (To be continued.)' },
  },
];

/** Static graph checks (boat names resolved against the registry by the caller). */
export function validateBeatGraph(knownBoatNames: string[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const b of STORY_BEATS) {
    if (ids.has(b.id)) errs.push(`duplicate id ${b.id}`);
    ids.add(b.id);
    if (b.requiresBoat && !knownBoatNames.includes(b.requiresBoat)) errs.push(`${b.id}: requiresBoat ${b.requiresBoat} not in registry`);
    if (b.reward.unlockBoat && !knownBoatNames.includes(b.reward.unlockBoat)) errs.push(`${b.id}: unlockBoat ${b.reward.unlockBoat} not in registry`);
  }
  return errs;
}
```

- [ ] **Step 4: Run → expect PASS** — `npx vitest run tests/campaign.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(story): StoryBeats data + graph validators"`

---

### Task 4: StoryHarbor — deterministic Greyharbor finder + sea validation (TDD)

**Files:** Create `src/state/StoryHarbor.ts`; extend `tests/campaign.test.ts`. **Read first:** `src/world/IslandGenerator.ts:33` (`generateIsland`), `src/state/Harbor.ts:22` (`harborEligible`), `src/world/ChunkManager.ts:478` (`createHarbor` dock = center + (radius+24) along `chunkHash(cx,cz,22)` bearing), `src/world/WorldSeed.ts` (`CHUNK_SIZE`).

- [ ] **Step 1: Failing tests**

```ts
import { findStoryHarbor, isOpenWater } from '../src/state/StoryHarbor';

describe('StoryHarbor', () => {
  it('finds a deterministic eligible harbor near origin', () => {
    const a = findStoryHarbor();
    const b = findStoryHarbor();
    expect(a).not.toBeNull();
    expect(a).toEqual(b);                 // deterministic
    expect(a!.radius).toBeGreaterThan(55); // harborEligible min radius
  });
  it('the sea-trail coordinates are open water', () => {
    for (const c of [{ x: 700, z: 40 }, { x: 1400, z: 120 }, { x: 1050, z: -90 }, { x: 2200, z: 0 }]) {
      expect(isOpenWater(c.x, c.z)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run → expect FAIL.**

- [ ] **Step 3: Implement** (spiral-scan chunks from origin; reuse the real generators so it stays deterministic). Resolve `CHUNK_SIZE` and the exact `generateIsland`/`harborEligible`/`chunkHash` signatures from the files above; the shape:

```ts
// src/state/StoryHarbor.ts
import { generateIsland } from '../world/IslandGenerator';
import { harborEligible } from './Harbor';
import { chunkHash } from '../world/WorldSeed'; // confirm export location
import { CHUNK_SIZE } from '../world/WorldSeed';

export interface StoryHarbor { chunkX: number; chunkZ: number; x: number; z: number; radius: number; dock: { x: number; z: number }; spawn: { x: number; z: number }; }

/** Nearest harbor-eligible island to the origin, deterministic. */
export function findStoryHarbor(): StoryHarbor | null {
  for (let ring = 0; ring <= 6; ring++) {
    for (let cx = -ring; cx <= ring; cx++) {
      for (let cz = -ring; cz <= ring; cz++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== ring) continue; // ring perimeter only
        const isl = generateIsland(cx, cz, CHUNK_SIZE);
        if (!isl || !harborEligible(isl.radius, cx, cz)) continue;
        const bearing = chunkHash(cx, cz, 22) * Math.PI * 2; // same bearing createHarbor uses
        const dock = { x: isl.centerX + Math.sin(bearing) * (isl.radius + 24), z: isl.centerZ + Math.cos(bearing) * (isl.radius + 24) };
        const spawn = { x: isl.centerX + Math.sin(bearing) * (isl.radius + 38), z: isl.centerZ + Math.cos(bearing) * (isl.radius + 38) };
        return { chunkX: cx, chunkZ: cz, x: isl.centerX, z: isl.centerZ, radius: isl.radius, dock, spawn };
      }
    }
  }
  return null;
}

/** True if no island covers (x,z) — sample target + neighbor chunks directly (not live getTerrainHeight). */
export function isOpenWater(x: number, z: number, clearance = 60): boolean {
  const ccx = Math.floor(x / CHUNK_SIZE), ccz = Math.floor(z / CHUNK_SIZE);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const isl = generateIsland(ccx + dx, ccz + dz, CHUNK_SIZE);
    if (!isl) continue;
    if (Math.hypot(x - isl.centerX, z - isl.centerZ) < isl.radius + clearance) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run → expect PASS.** If `isOpenWater` fails for a coord, nudge that constant in `STORY_LOCATIONS` (Task 3) until it passes, re-run. If `findStoryHarbor` returns null within 6 rings, widen the loop bound.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(story): deterministic Greyharbor finder + sea-coord validation"`

---

### Task 5: MissionInstance tag + helpers

**Files:** Create `src/components/MissionInstance.ts`. **Read first:** `src/components/RigidBody.ts` (component shape), `src/systems/WildlifeSystem.ts:457` (`spawnDistressedVessel` returns a `WildlifeEntity` with a mutable object — we tag the entity object, not an ECS component, since encounter meshes are plain `THREE.Group`s).

- [ ] **Step 1:** Mission-owned encounter objects are plain runtime objects (vessels = `WildlifeEntity`, props = `THREE.Group`). Add a tiny shared id type + a registry on `MissionSystem` (Task 6) rather than an ECS component. Create the id helper:

```ts
// src/components/MissionInstance.ts
/** Stable identity for a mission-owned encounter object so completion checks the EXACT instance. */
export interface MissionInstance { beatId: string; ref: object; } // ref = WildlifeEntity | THREE.Group
export function sameInstance(a: MissionInstance | null, ref: object | null | undefined): boolean {
  return !!a && !!ref && a.ref === ref;
}
```

- [ ] **Step 2: Build check** — `npx tsc --noEmit` → PASS.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(story): MissionInstance identity helper"`

---

### Task 6: MissionSystem skeleton + Engine wiring (no encounters yet)

**Files:** Create `src/systems/MissionSystem.ts`; Modify `src/Engine.ts`. **Read first:** `Engine.ts:131` (ctor), `:175-256` (system construction), `:591-779` (manual update loop), `:757,763` (marker `??`-chain), `:209` (boat spawn).

- [ ] **Step 1: Implement the skeleton** — a plain class (NOT `extends System`), constructed by Engine only when `config.campaign`, ticked manually. It owns CampaignState, arms/checks/advances, exposes `getMarker()`. Encounter arming is a `switch` with cases filled in Tasks 9/11–14 (start with `tow-derelict`/`pickup`/`rescue` stubs that just set the waypoint).

```ts
// src/systems/MissionSystem.ts  (sketch — fill encounter cases in later tasks)
import type { World } from '../ecs/World';
import { CampaignState, currentBeat, isComplete, markCompleted, advanceBeat, unlockBoat, setFlag, saveCampaign } from '../state/CampaignState';
import { StoryBeat } from '../state/StoryBeats';
import { addCredits } from '../state/Wallet';
import { addKarma } from '../state/Karma';
import type { JournalTracker } from '../state/JournalTracker';
import type { QuestLog } from '../ui/QuestLog';

export interface MissionDeps {
  world: World; state: CampaignState; quest: QuestLog; journal: JournalTracker;
  greyharbor: { x: number; z: number; dock: { x: number; z: number } };
  hud: { showToast(l: string, h: string): void };
  // encounter-system handles injected here in later tasks (distress, mermaid, leviathan, towing, wildlife, scene)
  getBoatPos(): { x: number; z: number; y: number };
  isInBoat(name: string): boolean;
}

export class MissionSystem {
  private marker: { x: number; z: number } | null = null;
  constructor(private d: MissionDeps) {}

  start(): void { this.armCurrent(); }

  getMarker() { return this.marker; }

  private armCurrent(): void {
    const beat = currentBeat(this.d.state);
    if (!beat) { this.marker = null; this.d.quest.clear(); return; }
    this.d.state.armedBeat = this.d.state.beat;
    this.d.quest.set(beat.title, beat.objective);
    this.d.hud.showToast(beat.title, beat.brief);
    this.arm(beat);
  }

  private arm(beat: StoryBeat): void {
    const e = beat.encounter;
    if ('spawn' in e) this.marker = { x: e.spawn.x, z: e.spawn.z };
    // encounter-specific spawns added in Tasks 9 / 11-14
  }

  /** Called each frame from Engine.update. */
  update(_dt: number): void {
    const beat = currentBeat(this.d.state);
    if (!beat) return;
    if (this.complete(beat)) this.finish(beat);
    else this.d.quest.setDistance(this.distanceToMarker());
  }

  private complete(_beat: StoryBeat): boolean { return false; } // filled in Tasks 9/11-14

  private finish(beat: StoryBeat): void {
    const r = beat.reward;
    if (r.credits) addCredits(r.credits);
    if (r.karma) addKarma(r.karma);
    if (r.unlockBoat) unlockBoat(this.d.state, r.unlockBoat);
    if (r.journalKey) this.d.journal.log(r.journalKey);
    if (r.flag) setFlag(this.d.state, r.flag);
    this.d.hud.showToast(beat.title, r.successLine);
    markCompleted(this.d.state, beat.id);
    advanceBeat(this.d.state);
    saveCampaign(this.d.state);
    this.disarm();
    if (isComplete(this.d.state)) this.d.quest.complete(); else this.armCurrent();
  }

  private disarm(): void { this.marker = null; /* despawn scripted instances — Tasks 9/11-14 */ }
  private distanceToMarker(): number | null { if (!this.marker) return null; const b = this.d.getBoatPos(); return Math.hypot(this.marker.x - b.x, this.marker.z - b.z); }
}
```

- [ ] **Step 2: Wire into Engine** — In `Engine.ts`, when `this.config.campaign`: after the boat spawns (`:209`), if `config.spawn` set the boat `Transform.position` to it; construct `QuestLog`, `MissionSystem` (resolve `greyharbor` via `findStoryHarbor()` once, store it, **pre-discover** its chunk via the engine's `DiscoveryTracker`), call `mission.start()`. In `update(dt)` (after the manual systems), call `this.mission?.update(dt)`. Insert the campaign marker FIRST into both marker reads (`:757,763`):

```ts
// Engine.ts marker chain (was: this.distress.getMarker() ?? this.contracts.getMarker())
this.mission?.getMarker() ?? this.distress.getMarker() ?? this.contracts.getMarker()
```

- [ ] **Step 3: Build** — `npx tsc --noEmit && npm run build` → PASS. (QuestLog stub may be a no-op panel until Task 7.)
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(story): MissionSystem skeleton + Engine wiring + campaign marker priority"`

---

### Task 7: QuestLog UI

**Files:** Create `src/ui/QuestLog.ts`; Modify `index.html` (add `#quest-log` + styles). **Read first:** `src/ui/HUD.ts` for the de-serifed style vars and how panels mount.

- [ ] **Step 1: Implement** a compact, collapsible top-left panel.

```ts
// src/ui/QuestLog.ts
export class QuestLog {
  private root: HTMLElement;
  private titleEl: HTMLElement; private objEl: HTMLElement; private distEl: HTMLElement;
  constructor() {
    this.root = document.getElementById('quest-log') ?? this.create();
    this.titleEl = this.root.querySelector('.ql-title')!;
    this.objEl = this.root.querySelector('.ql-objective')!;
    this.distEl = this.root.querySelector('.ql-dist')!;
    this.root.style.display = 'none';
  }
  private create(): HTMLElement {
    const el = document.createElement('div'); el.id = 'quest-log';
    el.innerHTML = '<div class="ql-title"></div><div class="ql-objective"></div><div class="ql-dist"></div>';
    document.body.appendChild(el); return el;
  }
  set(title: string, objective: string): void { this.root.style.display = ''; this.titleEl.textContent = title; this.objEl.textContent = objective; }
  setDistance(m: number | null): void { this.distEl.textContent = m == null ? '' : `${Math.round(m)} m`; }
  clear(): void { this.root.style.display = 'none'; }
  complete(): void { this.set('The Vanishing Tide', 'Act 1 complete — to be continued.'); this.setDistance(null); }
  dispose(): void { this.root.remove(); }
}
```

`index.html` styles (match the HUD's translucent dark cards, system-ui, gold accent `#ffd479`):

```html
<style>
#quest-log{position:fixed;top:16px;left:16px;z-index:7;max-width:260px;padding:10px 12px;
  background:rgba(8,14,22,.62);backdrop-filter:blur(6px);border-left:3px solid #ffd479;border-radius:6px;
  font-family:system-ui,sans-serif;color:#eaf2f8;pointer-events:none}
#quest-log .ql-title{font-size:13px;font-weight:700;letter-spacing:.02em;color:#ffd479;margin-bottom:3px}
#quest-log .ql-objective{font-size:13px;line-height:1.35;opacity:.95}
#quest-log .ql-dist{font-size:11px;opacity:.7;margin-top:4px}
</style>
```

- [ ] **Step 2:** In `Engine.ts` campaign branch, `new QuestLog()` and pass to `MissionSystem`; `questLog.dispose()` in `Engine.dispose()`.
- [ ] **Step 3: Build** → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(story): QuestLog objective panel"`

---

### Task 8: main.ts — Story vs Free Roam + campaign launch screen

**Files:** Modify `src/main.ts`. **Read first:** `:87-96` (BOATS), `:114` (`showSelector`), `:383` (`startGame`), `:360` (`returnToSelector`).

- [ ] **Step 1:** Add a top-level pre-selector choice (two big buttons: **Story** / **Free Roam**). Free Roam → existing `showSelector()`. Story → `showCampaignLaunch()`:
  - reads `loadCampaign()`; shows **Continue** (if save) and **New Game** (confirm → `resetCampaign()` + `newCampaign()` saved).
  - boat picker filtered to `state.unlockedBoats` (match `BOATS` by `def.name`).
  - **wrong-boat guard:** if `currentBeat(state)?.requiresBoat` and the picked boat ≠ it, disable launch with a hint "Take the <boat> out for this leg."
  - launch → `startStory(def)`:

```ts
function startStory(def: BoatDefinition): void {
  if (activeEngine) return;
  const state = loadCampaign() ?? newCampaign(); saveCampaign(state);
  const harbor = findStoryHarbor();
  recordVoyageStart();
  const engine = new Engine(applyBoatUpgrades(def), { mode: 'classic', campaign: true, spawn: harbor?.spawn });
  activeEngine = engine; (window as any).__engine = engine;
  escKeyHandler = (e) => { if (e.key === 'Escape') showEscMenu(); };
  window.addEventListener('keydown', escKeyHandler);
  engine.start();
}
```

- [ ] **Step 2:** In `returnToSelector()` (ESC "to harbor"), branch: if the disposed engine was a campaign, call `showCampaignLaunch()` instead of `showSelector()` (track a module `let lastWasStory = false`). Greyharbor spawn means relaunch == return-to-harbor; boat swap is just picking another unlocked boat here.
- [ ] **Step 3: Build** → PASS. Manual: Free Roam path unchanged; Story → launch → spawns at Greyharbor; ESC → campaign launch.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(story): startup Story/Free-Roam choice + campaign launch screen"`

---

### Task 9: Encounters for beats 1–4 (tow / pickup / rescue)

**Files:** Modify `src/systems/MissionSystem.ts`, `src/systems/DistressSystem.ts`, `src/Engine.ts`. **Read first:** `WildlifeSystem.ts:457` (`spawnDistressedVessel`, `maxAge:Infinity`), `TowingSystem.ts:133` (`getTowedEntity`), `DistressSystem.ts:74-90` (`trySpawn`), `:133-137` (completion), `Engine.ts:342` (rescue `onComplete`).

- [ ] **Step 1: DistressSystem scripted mode** — add:

```ts
// DistressSystem.ts
private scripted = false;
beginScriptedRescue(x: number, z: number) { this.clear(0); this.scripted = true; this.kind = 'fire'; this.vessel = this.wildlife.spawnDistressedVessel(x, z); }
endScripted() { this.scripted = false; if (this.vessel) { this.wildlife.removeEntity?.(this.vessel); this.vessel = null; } this.clear(240); }
getScriptedVessel() { return this.scripted ? this.vessel : null; }
```
And guard ambient `trySpawn` with `if (this.scripted) return;` at its top.

- [ ] **Step 2: MissionSystem encounter cases** — in `arm()` add spawns; in `complete()` add predicates; in `disarm()` despawn. tow-derelict spawns a `spawnDistressedVessel` at `e.spawn` (mission-owned via `maxAge:Infinity`); completion = `towing.getTowedEntity() === thatVessel && dist(vessel, greyharbor.dock) < e.radius`. pickup spawns a floating prop (a small `THREE.Group` bobbing on the ocean — reuse a buoy/crate mesh; or a minimal cylinder) at `e.spawn`; completion = `dist(boat, e.spawn) < e.radius` (then remove the prop). rescue → `distress.beginScriptedRescue(spawn)`; completion = `towing.getTowedEntity() === distress.getScriptedVessel() && dist(vessel, spawn) > e.safeRadius`.

- [ ] **Step 3: Single reward path** — in `Engine.ts` rescue `onComplete` (`:342`), early-out if a scripted rescue is active so it doesn't also pay:

```ts
onComplete: (reward) => {
  if (this.mission?.consumesRescue()) return; // campaign grants the beat reward instead
  addCredits(reward); addKarma(15); /* …existing… */
}
```
Add `MissionSystem.consumesRescue()` → `true` when the current beat is `souls-water` and armed.

- [ ] **Step 4: Build + manual verify** — `npm run build` → PASS. Playtest checklist: beat 1 tow Marigold home → advances; beat 2/3 sail to drift/reef → pickup advances; beat 4 mayday spawns + heli scrambles, tow vessel clear → advances once, no double credits.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(story): beats 1-4 encounters (tow/pickup/rescue) + single reward path"`

---

### Task 10: Milestone 1 — integration pass

- [ ] **Step 1:** `npx vitest run` → all green (63 existing + new campaign tests).
- [ ] **Step 2:** `npm run build` → PASS.
- [ ] **Step 3:** Manual smoke: Free Roam untouched; Story plays beats 1→4, save persists across refresh (Continue re-arms current beat), New Game resets to beat 1.
- [ ] **Step 4: Commit** any fixups — `git commit -m "test(story): milestone 1 green (machine + beats 1-4)"`

---

## MILESTONE 2 — beats 5–8

### Task 11: Beat 5 — submarine unlock + sonar-contact

**Files:** `src/systems/MissionSystem.ts`, `src/Engine.ts`. **Read first:** `SubmarineSystem.ts:159` (sonar), `state/Wallet`/`SoundEffects.playSonarPing`.

- [ ] **Step 1:** Beat 4's reward already sets `flag:'goodwill'`; beat 5's reward `unlockBoat:'Submarine'`. On beat-5 **arm**, the sub may not be unlocked yet — but the unlock is the *reward* for completing it. Resolve the ordering: unlock the sub at the **start** of beat 5 (so the player can dive). Add: in `armCurrent()`, if the beat `requiresBoat` and it isn't unlocked, `unlockBoat(state, requiresBoat); saveCampaign()` and toast "Submarine unlocked — return to Greyharbor and take her out." Then the wrong-boat guard (Task 8) routes the player to swap. (So beat 5's `reward.unlockBoat` becomes a no-op safety net.)
- [ ] **Step 2:** `sonar-contact` completion = `isInBoat('Submarine') && dist(boat, e.spawn) < e.radius && boat.y < e.depth`. On arm, optionally `soundEffects.playSonarPing()` when first in range; on complete, toast the contact line.
- [ ] **Step 3: Build + manual** — earn beat 4 → "sub unlocked" → ESC → launch screen shows Submarine → dive the reef → beat 5 completes. → Commit.

---

### Task 12: Beat 6 — scripted mermaid

**Files:** `src/systems/MermaidSystem.ts`, `src/systems/MissionSystem.ts`, `src/Engine.ts`. **Read first:** `MermaidSystem.ts:55-81` (gates), `:84-111` (placement), `:136-141` (completion).

- [ ] **Step 1: MermaidSystem scripted mode**:

```ts
private scripted: { x: number; z: number } | null = null;
private scriptedHeardFlag = false;
beginScripted(x: number, z: number) { this.scripted = { x, z }; this.scriptedHeardFlag = false; this.surfaceAt(x, z); } // factor the mesh+song from trySurface
endScripted() { this.scripted = null; this.depart(); }
scriptedHeard() { return this.scriptedHeardFlag; }
```
In `update`, if `this.scripted`: skip the night/calm/karma/lifetime gates entirely; keep the mermaid surfaced at the scripted spot; on `dist < ENCOUNTER_RANGE` set `scriptedHeardFlag = true` and `onGift` **without** calling `recordMermaidEncounter` (don't touch the lifetime cap).

- [ ] **Step 2: MissionSystem** — `mermaid` arm → `mermaid.beginScripted(spawn)`; completion = `mermaid.scriptedHeard()`; disarm → `mermaid.endScripted()`.
- [ ] **Step 3: Build + manual** — beat 6: follow the song, reach the mermaid → advances regardless of time of day/karma. → Commit.

---

### Task 13: Beat 7 — scripted Leviathan (spectacle/witness)

**Files:** `src/systems/LeviathanSystem.ts`, `src/systems/MissionSystem.ts`. **Read first:** `LeviathanSystem.ts:104-114` (`tryAwaken`), `beginSpectacle`/`endSpectacle` (`:171`), `:231-237` (storm despawn).

- [ ] **Step 1: LeviathanSystem scripted mode**:

```ts
private scripted: { phase: 'spectacle'|'boss'; persistStorm: boolean } | null = null;
beginScripted(x: number, z: number, phase: 'spectacle'|'boss', persistStorm = true) { this.scripted = { phase, persistStorm }; if (phase === 'spectacle') this.beginSpectacle(x, z); else this.beginBoss(x, z); }
endScripted() { this.scripted = null; }
scriptedResolved() { return this.scripted == null && this.phase === 'lurking'; }
```
Guard `tryAwaken` with `if (this.scripted) return;`. In `updateBoss`, skip the `rain < STORM_END` despawn when `this.scripted?.persistStorm`.

- [ ] **Step 2: MissionSystem** — `leviathan-witness` arm → `leviathan.beginScripted(spawn,'spectacle')`; completion = spectacle ended (expose `spectacleDone()` or reuse `scriptedResolved()` after `endSpectacle`) **and** `dist(boat, spawn) < e.radius` at trigger. Keep it simple: complete when the spectacle has played and the player withdrew beyond a small radius. disarm → `endScripted()`.
- [ ] **Step 3: Build + manual** — beat 7: reach the trench, Leviathan spectacle plays, survive → advances. → Commit.

---

### Task 14: Beat 8 — finale (boss + no-weapons lure) + campaign complete

**Files:** `src/systems/MissionSystem.ts`, `src/systems/LeviathanSystem.ts`, `src/Engine.ts`. **Read first:** `WeaponsSystem.ts:327` (boss resolution via strike zones), `:149` (`tb-disarmed` gate), `state/CombatSettings`.

- [ ] **Step 1:** `leviathan-boss` arm → `leviathan.beginScripted(spawn,'boss',persistStorm=true)`. Two completion paths in MissionSystem:
  - **Armed** (`!disarmed`): completion = `leviathan.scriptedResolved()` (existing torpedo strike-zone kill removes the boss entity → `bossGone()`); reuse Engine's `onLeviathanSlain` but gate it so the **campaign** grants the beat reward (early-out like Task 9's rescue).
  - **Disarmed** (`tb-disarmed` set): no weapons → **lure**. Track `lurePass`: each time the boat crosses within a lure radius of the trench spawn while the Leviathan chases, increment; reset the *current* pass only if the boat flees > flee-radius (never a hard reset). At `lurePass >= e.lurePasses`, call `leviathan.endScripted()` (it sounds and dives) → complete.
- [ ] **Step 2:** On finish of the final beat, `isComplete` → `QuestLog.complete()` + a closing toast (the Act 2 hook line is the beat's `successLine`).
- [ ] **Step 3: Build + manual** — beat 8 both paths: with weapons, sink it; with No-weapons toggle, lure it 3× → both complete the campaign once. → Commit.

---

### Task 15: Final pass + preview deploy

- [ ] **Step 1:** `npx vitest run` green; `npm run build` PASS.
- [ ] **Step 2:** Manual full playthrough beats 1→8 in one save; refresh mid-campaign resumes; Free Roam unaffected; both finale paths.
- [ ] **Step 3:** Deploy a **draft** Netlify preview (not prod): `npx netlify deploy --dir=dist` → capture the preview URL.
- [ ] **Step 4:** Report the preview URL to Jane for playtest. Prod deploy + PR-merge to `main` only after her sign-off.
- [ ] **Step 5: Commit** — `git commit -m "feat(story): The Vanishing Tide Act 1 complete (beats 1-8)"`

---

## Self-review notes
- **Spec coverage:** mode select (T1,T8), CampaignState+resume (T2,T6,T8), 8 beats (T3,T9,T11-14), scripted-encounter layer w/ ambient suspension + single reward path (T6,T9,T12-14), Greyharbor pre-discovered + spawn (T4,T6,T8), determinism via generateIsland (T4), QuestLog + marker priority (T6,T7), sub unlock (T11), no-weapons finale (T14), tests (T2-T4). ✔
- **Divergences from spec (intentional, simpler):** campaign marker is a one-line `??`-chain insertion rather than a new `ObjectiveMarkerProvider` class; sonar contact is a proximity+depth check rather than a ChunkManager scripted-landmark registry; beat-3 is a floating pickup (no fishing). All recorded in the spec's §3.
- **Resume model:** beat-granularity — `armCurrent()` re-arms cleanly on load; `completed[]` + `markCompleted` idempotency prevent re-reward (tested T2).
- **Open confirms during build:** exact boat `.name` strings ('Tugboat'/'Submarine'); `chunkHash`/`CHUNK_SIZE` export locations; `WildlifeSystem.removeEntity` name; `beginSpectacle`/`beginBoss` visibility (may need `private`→`public` or a thin wrapper).
