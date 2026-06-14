# Story Mode — "The Vanishing Tide" (Act 1) — Design Spec

**Date:** 2026-06-14
**Status:** Draft for review (Codex gate → plan)
**Author:** Jane + Claude

## 1. Vision

A second way to play Tugboat Bliss: an **authored narrative campaign** that sits alongside
the existing open-world Free Roam. You are a nobody tug captain out of a fog-bound home
harbor; ships are vanishing on the eastern run; you follow a trail of clues — derelicts,
bottled messages, sonar wrecks, a coastguard rescue, the mermaid's song — to the truth: the
**Leviathan**, driven up from the deep. You level up by **completing missions**, not by
free roaming: credits, reputation, journal clues, and **unlocked vessels** are the
progression. Act 1 is a self-contained vertical slice (8 beats) that ends on a hook for Act 2.

**Core design principle:** Story Mode invents almost no new *content*. It imposes a
narrative **order** on encounters already in the game (towing, bottled messages, wreck
fields, fishing, submarine + sonar, coastguard heli maydays, the mermaid, the Leviathan),
driving them at **fixed, deterministic world locations** so the trail is reliable and
resume-safe. The new code is the *spine* — a campaign state machine, a mission runtime, a
quest UI, and small "arming" hooks on existing systems — not new gameplay verbs.

## 2. The Act 1 arc (player experience)

Home base: **Greyharbor**, a fixed home dock near the world origin. You start locked to the
tugboat. Each beat reuses shipped content, drops a clue pointing at the next, and the trail
tightens toward the deep.

| # | Beat | Player action (reuses) | Reward / clue → next |
|---|------|------------------------|----------------------|
| 1 | **The Empty Berth** | Tow the crewless *Marigold* home (towing). | First contract pay; note: "quiet water out east." |
| 2 | **Message in the Swell** | Recover a bottled message at the eastern drift (bottled messages). | Chart fragment → a reef. |
| 3 | **The Reef of Wrecks** | A wreck graveyard; *fish up* a torn net + a dinner-plate scale (wreck field + fishing). | Too deep to read — you need to go down. |
| 4 | **Souls in the Water** ⭐ | A live mayday: race in, assist the coastguard **heli** rescue, tow the foundering ship clear / pull a survivor aboard (DistressSystem + AircraftSystem heli + towing). The survivor is the first human eyewitness. | Credits + **coastguard goodwill** (flag). |
| 5 | **Down to the Dark** | The grateful coastguard **loans you a submarine** (*unlock*); dive the reef, sonar finds a contact too big for a whale and a clawed hull (submarine + sonar + underwater). | A song on the hydrophone → the trench. |
| 6 | **The Mermaid's Warning** | Follow the song by ear; the mermaid names what woke in the trench, and (good karma) gives a charm (mermaid). | Trench coordinates. |
| 7 | **Witness** | At the trench edge, witness the Leviathan take a ship; survive and run (Leviathan spectacle phase). | Credits → buy an upgrade for the fight. |
| 8 | **The Vanishing Tide** *(finale)* | The Leviathan rises in a storm; fight it — the coastguard heli returns to draw its attention (Leviathan boss + heli callback). | Title + "Slew the Leviathan." **Hook:** it was *fleeing something deeper.* → Act 2. |

The coastguard heli appears as its own rescue beat (4) **and** pays off at the climax (8).
Beat 5's submarine unlock is *caused* by the beat-4 rescue.

## 3. Scope

**In (v1 vertical slice):**
- Top-level **Story vs Free Roam** choice at startup, with **Continue / New Game** for Story.
- `CampaignState` persistence (one save slot, `tb-story`), pure + unit-tested.
- All **8 beats** as declarative data.
- `MissionSystem` runtime: arm active beat, place waypoint, trigger the relevant existing
  encounter at a fixed spot, detect completion, grant rewards, advance, persist.
- `QuestLog` UI + an on-screen **waypoint** (compass chevron + minimap marker).
- Boat progression: **start tug, unlock submarine** at beat 5 (the one required unlock);
  boat picked from unlocked set at the Story launch screen.
- Reuse of existing encounters via minimal "arming" hooks.
- **No-weapons finale path** so the comfort toggle still completes the campaign.
- Greyharbor fixed home dock used for briefings / return objectives.
- Tests: `CampaignState` + beat-graph validation.

**Out (deferred, not v1):**
- Act 2+ content.
- Branching dialogue trees / voice / cutscenes; beats use the existing toast stack for
  narration.
- Elaborate shipyard UI; v1 swaps boats at the launch screen (+ existing HarborPanel for
  briefings). Mid-voyage hot-swap of the player vessel is **not** required.
- Extra unlockable vessels beyond the submarine (e.g. a speedboat "chase" beat) — optional
  stretch, not required for the slice.
- Multiple save slots; new bespoke art/meshes.

## 4. Architecture

Follows the codebase's established pattern: **pure, tested state modules** (`src/state/*`)
+ **ECS systems** (`src/systems/*`) + **DOM UI** (`src/ui/*`), wired in `Engine.ts`,
selected in `main.ts`.

### 4.1 Startup / mode selection (`main.ts`, `GameConfig.ts`)

Current flow: loading screen → classic/magical mode pill → boat selector →
`startGame(def, mode)` → `new Engine(def, { mode }).start()`.

New top-level choice **before** the existing selector:
- **Free Roam** → existing flow, unchanged.
- **Story** → campaign launch screen: shows the current objective (or "New Voyage"), a
  **Continue** button if a save exists, **New Game** (with confirm if it overwrites), and a
  picker over **unlocked boats** (tug only at first). Launching calls
  `new Engine(boatDef, { mode: 'classic', campaign: true }).start()`.

`GameConfig` gains a campaign flag (keeps the existing union intact):
```ts
export type GameMode = 'classic' | 'magical';
export interface GameConfig { mode: GameMode; campaign?: boolean; }
```
`campaign: true` is the single switch Engine reads to construct the campaign systems. Story
uses `mode: 'classic'` (no magical VFX). Free Roam never constructs the MissionSystem, so it
is provably unaffected.

### 4.2 `CampaignState` (new pure module, `src/state/CampaignState.ts`)

localStorage key `tb-story`. Injectable `Storage` for tests (same pattern as `Karma`,
`Wallet`, `Harbor`).
```ts
export interface CampaignState {
  started: boolean;
  beat: number;               // index into STORY_BEATS (0-based)
  completed: string[];        // completed beat ids (idempotency)
  unlockedBoats: string[];    // registry keys; seeds to ['TUGBOAT']
  flags: Record<string, boolean>;
  lastBoat: string;           // last sailed boat key (for Continue)
}
```
Functions (all pure, storage-injectable): `loadCampaign`, `saveCampaign`, `newCampaign`,
`currentBeat(state)`, `advanceBeat(state)`, `unlockBoat(state, key)`, `setFlag`, `isComplete`.
Corrupt/missing JSON → safe default (not started). Credits, karma, journal, and upgrades
continue to live in their **existing** modules (`Wallet`, `Karma`, `JournalTracker`,
`Upgrades`); CampaignState does not duplicate them — it orchestrates them.

### 4.3 Beat data model (new, `src/state/StoryBeats.ts`)

A declarative, ordered list — adding Act 2 is appending entries.
```ts
export interface StoryBeat {
  id: string;
  title: string;
  brief: string;              // narration toast when the beat begins
  objective: string;          // short imperative for the quest log
  waypoint?: { x: number; z: number; label: string }; // omit ⇒ home harbor / no marker
  requiresBoat?: string;      // e.g. 'SUBMARINE' — quest log nudges if mismatched
  trigger: TriggerSpec;       // how completion is detected (tagged union)
  reward: {
    credits?: number;
    karma?: number;
    unlockBoat?: string;
    journalKey?: keyof typeof JOURNAL_ENTRIES;
    flag?: string;
    successLine: string;      // narration toast on completion
  };
}

export type TriggerSpec =
  | { kind: 'tow-to'; dock: { x: number; z: number }; radius: number }
  | { kind: 'reach'; x: number; z: number; radius: number }
  | { kind: 'fish-evidence'; x: number; z: number; radius: number }
  | { kind: 'rescue-mayday'; x: number; z: number; radius: number }
  | { kind: 'dive-sonar'; x: number; z: number; radius: number; depth: number }
  | { kind: 'hear-mermaid'; x: number; z: number; radius: number }
  | { kind: 'witness-leviathan'; x: number; z: number; radius: number }
  | { kind: 'defeat-leviathan' };
```
The 8 beats are concrete instances of these (coordinates from §4.6).

### 4.4 `MissionSystem` (new, `src/systems/MissionSystem.ts`)

The runtime that turns the beat list into play. An ECS system (manual-update is also fine,
matching `AircraftSystem`). Holds references injected by Engine: `World`, `CampaignState`,
`QuestLog`, `ChunkManager`, and the systems it arms (`DistressSystem`, `AircraftSystem`,
`LeviathanSystem`, `MermaidSystem`, plus the player entity for position).

Lifecycle:
1. **On start / on beat change — `armBeat()`**: read `currentBeat`; push `brief` to the toast
   stack; set `QuestLog` objective + waypoint; and *arm* the trigger:
   - `rescue-mayday` → `DistressSystem.addScriptedMarker(x,z)` (draws the heli) + spawn a
     foundering ship at the spot.
   - `witness-leviathan` → `LeviathanSystem.spawnSpectacleAt(x,z)`.
   - `defeat-leviathan` → `LeviathanSystem.spawnBossAt(x,z)` (or, if `tb-disarmed`, the
     lure variant — §4.8).
   - `hear-mermaid` → `MermaidSystem.placeAt(x,z)`.
   - `dive-sonar` / `fish-evidence` → ensure a wreck/contact exists at the spot (wreck field
     placement) and set a flag so the next qualifying catch/sonar hit counts.
   - `tow-to` / `reach` → waypoint only; no encounter to arm.
2. **Each frame — completion check**: evaluate the active trigger's predicate against world
   state (player distance, towed-entity identity, sub depth + proximity, Leviathan defeated
   flag, mermaid-heard flag, catch flag). On success:
   - Grant `reward` via the existing modules: `addCredits`, `addKarma`, `unlockBoat`,
     `JournalTracker.log`, `setFlag`; push `successLine` (+ an unlock toast if any).
   - `advanceBeat`, persist `CampaignState`, then `armBeat()` for the next, or mark complete.
   - If the next beat `requiresBoat` and the player isn't in it, the quest log shows
     "Return to Greyharbor and take the <boat> out."

**Integration surface (hooks to add to existing systems).** Each is a small, additive method;
exact signatures verified against the real files during the build:
- `DistressSystem.addScriptedMarker(x, z)` — force a mayday marker the heli homes to.
- `AircraftSystem` — already scrambles the heli to a marker; reused as-is, no change expected.
- `LeviathanSystem.spawnSpectacleAt(x, z)` / `.spawnBossAt(x, z)` / `isDefeated()` — drive the
  existing spectacle/boss phases at a scripted spot instead of the ambient trigger.
- `MermaidSystem.placeAt(x, z)` / `wasHeard()` — place the scripted mermaid, expose heard flag.
- Wreck-field placement at a scripted spot (via `ChunkManager` or a light scripted prop) for
  beats 3 & 5; `FishingSystem`/`SubmarineSystem` expose a "what did we just catch / ping" hook.
- `TowingSystem` — expose the currently-towed entity id so `tow-to` can verify identity.

If any hook is awkward to add cleanly, the fallback is a **proximity + flag** approximation
(arrive at the spot + a soft condition), preserving the trail without deep coupling. The
spec prefers real hooks; the build picks the cleanest per system.

### 4.5 Boat progression

- `CampaignState.unlockedBoats` starts `['TUGBOAT']`. Beat 5's reward is
  `unlockBoat: 'SUBMARINE'`.
- The Story launch screen lists only unlocked boats. The player picks one to sail; this seeds
  the Engine's boat def. Swapping boats = return to the launch screen (via the ESC menu's
  "to harbor") and pick again — no mid-voyage hot-swap in v1.
- `applyBoatUpgrades` (existing) still applies owned stat upgrades. Karma still flavors
  shipyard prices via `karmaPriceFactor` (existing).

### 4.6 Deterministic story locations (`src/state/StoryBeats.ts` constants)

The world is seeded (`WORLD_SEED`), so fixed coordinates are stable across runs. Locations lie
along +X ("east") at increasing distance, validated at build time with
`ChunkManager.getTerrainHeight`:
- **Greyharbor** — a forced home dock at a chosen near-origin island (override the harbor hash
  gate for that chunk, or place a dedicated story dock). Player spawns here.
- **Marigold drift**, **eastern reef** (wreck field for beats 3 & 5), **mayday spot** (beat 4),
  **trench** (beats 6–8) — open-water coordinates, verified to be water (terrain height ≤ 0),
  spaced a few chunks apart so the journey reads as a voyage, not a teleport.

Exact numbers are finalized in the build against the real generator and recorded as named
constants (`STORY_LOCATIONS`).

### 4.7 `QuestLog` UI + waypoint (new, `src/ui/QuestLog.ts`)

- A compact panel (top-left, beneath the HUD), de-serifed to match gameplay UI: current beat
  **title** + **objective** line + **distance/bearing** to the active waypoint. Collapsible.
- An on-screen **waypoint indicator**: a chevron on the compass / a marker on the existing
  `Minimap` pointing at `waypoint`. Kid-friendly: just follow the marker.
- Narration (briefs, clues, success lines) uses the **existing toast stack** (top-right).
- `#quest-log` DOM element added to `index.html`; instantiated in Engine when `campaign`,
  updated each frame with the active beat + boat position. Hidden entirely in Free Roam.

### 4.8 No-weapons finale path

If `tb-disarmed` (No weapons) is on, beat 8 cannot be won by damaging tentacles. The
`defeat-leviathan` trigger then resolves via a **lure**: lead the Leviathan across the trench
marker N times (the heli distracting it) until it dives for good. Completion = lure objective
met. With weapons on, it's the existing tentacle boss. Both grant the same reward and
"Slew/Drove off the Leviathan" outcome. `tb-peaceful` (Calm seas) is irrelevant here (that's
the battleship). This keeps the campaign completable for the comfort-toggle audience.

### 4.9 Save / resume & edge cases

- Load `tb-story` at startup; **Continue** re-arms the active beat (idempotent — completed
  beats never re-trigger). **New Game** resets `tb-story` only (credits/karma/journal are
  lifetime and persist by design; a "reset campaign" need not wipe them — confirm in build).
- Corrupt/missing save → safe default (not started).
- Quitting mid-beat → save granularity is the **beat**; in-beat partial progress is not
  persisted (beats are short). Acceptable for the slice.
- Free Roam path constructs no campaign systems → zero behavioral change, guaranteed by the
  `campaign` flag gate.

## 5. Data flow — one beat's lifecycle

```
armBeat(beat)
  → toast(beat.brief); QuestLog.set(beat.objective, beat.waypoint)
  → arm trigger (spawn/place encounter at fixed spot)
loop each frame:
  → predicate(beat.trigger, world, player) ?
       yes → grant(beat.reward) via Wallet/Karma/Journal/unlockBoat
           → toast(beat.reward.successLine) [+ unlock toast]
           → advanceBeat(state); saveCampaign(state)
           → next ? armBeat(next) : campaignComplete()
```

## 6. Testing strategy

- **Unit (vitest), new files:**
  - `CampaignState`: new/advance/unlock/flags; save→load round-trip; corruption → default;
    `isComplete` at the final beat; `advanceBeat` past the end is a no-op.
  - `StoryBeats` graph validation: ids unique and ordered; every `requiresBoat`/`unlockBoat`
    references a real registry key; every `reward.journalKey` exists in `JOURNAL_ENTRIES`;
    every `waypoint`/trigger coordinate is finite; the chain reaches `defeat-leviathan`.
- **Integration** (MissionSystem arming, encounter triggering, QuestLog, finale paths):
  verified by `npm run build` + Jane's playtest, consistent with the project norm that
  integration-heavy systems (aircraft, seaplane, submarine) are not unit-tested.
- Existing 63 tests must stay green; Free Roam smoke-checked unchanged.

## 7. File-by-file change list

**New:**
- `src/state/CampaignState.ts` — campaign save/state machine (pure).
- `src/state/StoryBeats.ts` — beat list, `TriggerSpec`, `STORY_LOCATIONS`.
- `src/systems/MissionSystem.ts` — runtime arming/completion/advance.
- `src/ui/QuestLog.ts` — objective panel + waypoint indicator.
- `tests/campaign.test.ts` — CampaignState + beat-graph tests.

**Modified:**
- `src/state/GameConfig.ts` — add `campaign?: boolean`.
- `src/main.ts` — Story vs Free Roam top-level choice; Story launch screen (Continue / New
  Game / unlocked-boat picker); route to `Engine(..., { campaign: true })`.
- `src/Engine.ts` — when `campaign`, construct CampaignState + MissionSystem + QuestLog, wire
  the arming hooks, spawn at Greyharbor; update loop calls; ESC "to harbor" route.
- `src/systems/DistressSystem.ts` — `addScriptedMarker`.
- `src/systems/LeviathanSystem.ts` — `spawnSpectacleAt` / `spawnBossAt` / `isDefeated`.
- `src/systems/MermaidSystem.ts` — `placeAt` / `wasHeard`.
- `src/systems/TowingSystem.ts` — expose towed entity id.
- `src/systems/FishingSystem.ts` / `src/systems/SubmarineSystem.ts` — catch/sonar hook (only
  if needed; else proximity-flag fallback).
- `src/world/ChunkManager.ts` — force the Greyharbor home dock + scripted wreck-field spots.
- `index.html` — `#quest-log` element + styles.

## 8. Risks & mitigations

- **Coupling MissionSystem to many systems.** Mitigation: tiny additive hooks; proximity+flag
  fallback where a clean hook is hard; MissionSystem depends on *interfaces*, not internals.
- **Scope creep.** Mitigation: one required unlock (sub); narration via toasts not dialogue
  trees; shipyard deferred to the launch screen; "Witness" and "chase" kept minimal.
- **Determinism drift if worldgen changes.** Mitigation: lock `WORLD_SEED`; story coords are
  open water chosen with margin; Greyharbor is forced, not hash-dependent.
- **No-weapons finale.** Mitigation: explicit lure path (§4.8), tested logic where feasible.

## 9. Act 2 hook (out of scope, recorded)

The Leviathan dies/retreats *fleeing something deeper* — the seed for Act 2. CampaignState's
`flags`/`beat` model extends by appending beats; no schema change needed.
