# Story Mode — "The Vanishing Tide" (Act 1) — Design Spec

**Date:** 2026-06-14
**Status:** Revised after Codex gate (→ implementation plan)
**Author:** Jane + Claude

## 1. Vision

A second way to play Tugboat Bliss: an **authored narrative campaign** alongside the existing
open-world Free Roam. You are a nobody tug captain out of a fog-bound home harbor; ships are
vanishing on the eastern run; you follow a trail of clues — a crewless derelict, a bottled
message, sonar wrecks, a coastguard rescue, the mermaid's song — to the truth: the
**Leviathan**, driven up from the deep. You level up by **completing missions**, not by free
roaming: credits, reputation, journal clues, and **unlocked vessels** are the progression.
Act 1 is a self-contained vertical slice (8 beats) ending on a hook for Act 2.

**Core principle (revised after review):** Story Mode adds little new *content* — it sequences
encounters already in the game — but it does **not** drive them through "small hooks" into the
ambient systems. The ambient systems (Leviathan storm-rolls, mermaid night/karma gates,
distress cooldowns, sonar's loaded-chunk dedupe, reward callbacks) actively fight scripted
placement. So the campaign owns a **scripted-encounter layer**: mission-owned entities spawned
at fixed spots, tagged by `instanceId`, protected from ambient despawn/quota, with the
conflicting ambient behavior suspended while a scripted instance is live, and a **single reward
path**. The new code is this layer + a campaign state machine + a quest UI — not new verbs.

## 2. The Act 1 arc (player experience)

Home base: **Greyharbor**, the nearest hash-eligible harbor to the world origin, pre-discovered
and used as the campaign spawn. You start locked to the tugboat.

| # | Beat | Player action (reuses, **scripted**) | Reward / clue → next |
|---|------|---------------------------------------|----------------------|
| 1 | **The Empty Berth** | Tow the crewless *Marigold* (a mission-owned derelict) home (scripted tow). | First contract pay; "quiet water out east." |
| 2 | **Message in the Swell** | Recover a bottled message at the eastern drift (scripted floating pickup). | Chart fragment → a reef. |
| 3 | **The Reef of Wrecks** | A wreck graveyard; **recover floating wreckage** — a torn net + a dinner-plate scale (scripted pickup; *no fishing*). | Too deep to read — you need to go down. |
| 4 | **Souls in the Water** ⭐ | A scripted mayday: the coastguard **heli** is on scene (ambiance); you tow the foundering vessel clear (scripted rescue, player-driven completion). | Credits + **coastguard goodwill** (flag). |
| 5 | **Down to the Dark** | The grateful coastguard **loans you a submarine** (*unlock*); dive the reef, **sonar** picks up a scripted contact too big for a whale + a clawed hull (scripted landmark). | A song on the hydrophone → the trench. |
| 6 | **The Mermaid's Warning** | Follow the song by ear; the **scripted mermaid** (ignores night/karma/lifetime gates) names what woke in the trench. | Trench coordinates. |
| 7 | **Witness** | At the trench, witness the **scripted Leviathan** (spectacle phase, ambient rolls suspended) take a ship; survive and run. | Credits → upgrade for the fight. |
| 8 | **The Vanishing Tide** *(finale)* | The **scripted Leviathan** (boss phase, non-storm lifetime) rises; defeat it — or, if disarmed, **lure** it into the trench (heli distracting; deterministic counter). | Title + "Slew the Leviathan." **Hook:** it was *fleeing something deeper.* → Act 2. |

The heli appears at beat 4 (ambiance) and returns at the finale (ambiance/distraction). Beat 5's
sub unlock is *caused* by the beat-4 rescue.

## 3. Codex gate — outcome

An adversarial review (Codex, gpt-5.5, read-only over the real source) produced 15 findings.
**Adopted:** the central correction — a campaign-owned **scripted-encounter layer** (not small
hooks); a **single reward path** (suppress ambient rewards for scripted instances); **mission
`instanceId` identity** validation; **Greyharbor at origin** so relaunch == "return to harbor",
plus a wrong-boat launch guard; per-system **scripted modes** that bypass ambient gates
(Leviathan storm/roll, mermaid night/karma/lifetime, distress cooldown, sonar dedupe);
coordinate validation via direct `generateIsland` sampling (live `getTerrainHeight` lies for
unloaded chunks); pre-discovering an existing eligible harbor; a priority **objective-marker
provider**. **Diverged (simpler, my call):** cut fishing from beat 3 → reach/pickup; the heli is
ambiance, not completion-critical; **beat-granularity resume** via clean re-arm-on-load rather
than persisting live entity state; "New Game" = "Restart story only" (shared lifetime stats are
harmless since progression is beat-gated, not credit-gated).

## 4. Scope

**In (v1 vertical slice):**
- Top-level **Story vs Free Roam** at startup; **Continue / New Game** for Story.
- `CampaignState` (one save slot, `tb-story`), pure + unit-tested; beat-granularity resume.
- All **8 beats** as declarative data.
- The **scripted-encounter layer**: `MissionSystem` (sequencing + rewards) + per-system scripted
  modes (Leviathan, mermaid, distress/rescue, scripted sonar landmark, floating pickups, tow
  identity), with ambient suspension and a single reward path.
- `QuestLog` UI + an `ObjectiveMarkerProvider` waypoint (compass chevron + minimap, priority).
- Boat progression: **start tug, unlock submarine** at beat 5; boat chosen from the unlocked set
  at the Story launch screen; **Greyharbor spawn** makes relaunch the swap mechanism.
- No-weapons finale **lure** controller.
- Tests: `CampaignState` + beat-graph validation + the pure pieces of the encounter layer
  (instance registry, reward-once guard, marker priority).

**Staging (the plan formalizes this).** The encounter-layer + machine + beats 1–4 (tow,
pickup, rescue) is an **independently testable milestone** (proves mode-select → quest log →
waypoint → scripted spawn/identity/complete → save) before the heavier beats 5–8 (sub unlock,
scripted sonar, mermaid, Leviathan spectacle + finale). If the full slice can't land in one
pass, milestone-1 ships first with a clear note.

**Out (deferred):** Act 2+; dialogue trees / voice / cutscenes (narration via the toast stack);
elaborate shipyard UI; mid-voyage hot-swap; extra unlockable vessels beyond the sub; multiple
save slots; new art; sandboxed story economy.

## 5. Architecture

Follows the codebase pattern: pure tested state (`src/state/*`) + ECS systems (`src/systems/*`)
+ DOM UI (`src/ui/*`), wired in `Engine.ts`, selected in `main.ts`.

### 5.1 Startup / mode selection (`main.ts`, `GameConfig.ts`)

`GameConfig` gains a campaign flag:
```ts
export type GameMode = 'classic' | 'magical';
export interface GameConfig { mode: GameMode; campaign?: boolean; }
```
New top-level choice before the existing selector: **Free Roam** (existing flow, unchanged) vs
**Story**. Story opens a campaign launch screen: current objective (or "New Voyage"),
**Continue** (if `tb-story` exists), **New Game** (confirm; resets `tb-story` only — labeled
"Restart story"), and a picker over **unlocked boats** (tug only at first). Launch →
`new Engine(boatDef, { mode: 'classic', campaign: true, spawn: greyharborDock }).start()`.

**Greyharbor spawn & boat swap.** Campaign launches spawn at the Greyharbor dock (not origin
`(0,1,0)`). ESC already disposes the engine and returns to the selector; in campaign mode it
returns to the **campaign launch screen**, so "return to harbor and take another boat out" is
just relaunch. **Wrong-boat guard:** if `currentBeat.requiresBoat` is set, the launch screen
disables launch for any other boat (with a hint), or pre-selects the required boat. Free Roam
never constructs campaign systems → provably unaffected.

### 5.2 `CampaignState` (new pure module, `src/state/CampaignState.ts`)

localStorage `tb-story`, injectable `Storage` (pattern of `Karma`/`Wallet`/`Harbor`):
```ts
export interface CampaignState {
  started: boolean;
  beat: number;                 // index into STORY_BEATS
  armedBeat: number | null;     // beat currently armed (for clean re-arm on load)
  completed: string[];          // completed beat ids — reward-once + never re-arm
  unlockedBoats: string[];      // registry keys; seeds ['TUGBOAT']
  flags: Record<string, boolean>;
  lastBoat: string;             // for Continue
}
```
Pure fns: `loadCampaign`, `saveCampaign`, `newCampaign`, `currentBeat`, `advanceBeat`,
`unlockBoat`, `setFlag`, `isComplete`, `markCompleted`. Corrupt/missing → safe default.
Credits/karma/journal/upgrades stay in their existing modules (shared lifetime stats);
CampaignState orchestrates, never duplicates them.

**Resume model (beat granularity).** On Continue/refresh: `disarmAll()` (despawn any stray
scripted instances) then `armBeat(currentBeat)` **fresh**. Partial in-beat progress is
intentionally discarded (beats are short). A beat in `completed[]` never re-arms or re-rewards.
This gives refresh-safety without persisting live entity state.

### 5.3 Beat data (new, `src/state/StoryBeats.ts`)

Ordered, declarative — Act 2 is appended entries.
```ts
export interface StoryBeat {
  id: string;
  title: string;
  brief: string;                // narration toast on begin
  objective: string;            // quest-log imperative
  waypoint?: { x: number; z: number; label: string };
  requiresBoat?: string;        // 'SUBMARINE' etc. — launch guard + quest-log nudge
  encounter: EncounterSpec;     // what the layer spawns + how it completes
  reward: {
    credits?: number; karma?: number; unlockBoat?: string;
    journalKey?: keyof typeof JOURNAL_ENTRIES; flag?: string; successLine: string;
  };
}

export type EncounterSpec =
  | { kind: 'tow-derelict'; spawn: V2; dock: V2; radius: number }      // beat 1
  | { kind: 'pickup'; spawn: V2; radius: number }                       // beats 2, 3
  | { kind: 'rescue'; spawn: V2; safeRadius: number }                   // beat 4 (heli ambiance)
  | { kind: 'sonar-contact'; spawn: V2; radius: number; depth: number } // beat 5
  | { kind: 'mermaid'; spawn: V2; radius: number }                      // beat 6
  | { kind: 'leviathan-witness'; spawn: V2; radius: number }            // beat 7
  | { kind: 'leviathan-boss'; spawn: V2 };                              // beat 8 (armed or lure)
```
`V2 = { x: number; z: number }`. The 8 beats are concrete instances (coords §5.6).

### 5.4 The scripted-encounter layer — `MissionSystem` + per-system scripted modes

`MissionSystem` (`src/systems/MissionSystem.ts`) owns **beat sequencing, arming, completion,
reward, persistence**. It delegates the *live encounter* to per-system **scripted modes** —
each existing system gains a `beginScripted(...) / endScripted()` pair plus an
ambient-suspend flag, so a mission instance is authoritative and never collides with ambient
spawns. MissionSystem holds injected refs: `World`, `CampaignState`, `QuestLog`,
`ObjectiveMarkers`, `ChunkManager`, player entity, and the systems it scripts.

**`armBeat(beat)`** — toast `brief`; set quest objective + waypoint; then per `encounter.kind`:
- `tow-derelict` → spawn a **mission-owned** derelict at `spawn` (protected from despawn/quota);
  completion = `TowingSystem.getTowedEntity() === instanceId` **and** within `radius` of `dock`.
- `pickup` → spawn a mission-owned floating prop at `spawn`; completion = player within `radius`.
- `rescue` → `DistressSystem.beginScriptedRescue({id,x,z})`: mission-owned foundering vessel +
  mayday marker, **ambient distress cooldown suspended**; the heli scrambles via the existing
  marker (ambiance). Completion = player tows/clears the vessel beyond `safeRadius` (player-
  driven), then `endScripted()`.
- `sonar-contact` → register a **scripted landmark** at `spawn` consumed by sonar + journal;
  completion = sub within `radius` **and** below `depth` **and** the contact pinged.
- `mermaid` → `MermaidSystem.beginScripted({x,z})`: place the mermaid **ignoring**
  night/calm/karma/lifetime (`tb-mermaid`) gates; completion = player within `radius` / heard;
  does not touch the lifetime mermaid count.
- `leviathan-witness` → `LeviathanSystem.beginScripted({x,z,phase:'spectacle'})`: **suspend
  ambient deep-water/storm rolls and the global "seen" gate**, own the entity lifetime
  independent of the storm; completion = spectacle played + player survived/withdrew.
- `leviathan-boss` → `LeviathanSystem.beginScripted({x,z,phase:'boss',persistStorm})` → the
  finale controller (§5.8); completion = `scriptedResolved()`.

**Each frame:** evaluate the active encounter's completion predicate. On success →
`grant(reward)` **once** (guarded by `completed[]`) via the existing modules (`addCredits`,
`addKarma`, `unlockBoat`, `JournalTracker.log`, `setFlag`); toast `successLine` (+ unlock
toast); `endScripted()`; `markCompleted` + `advanceBeat`; `saveCampaign`; `armBeat(next)` or
`campaignComplete()`.

**Single reward path (Codex #2).** Existing `Engine` reward callbacks (rescue/mermaid/Leviathan/
fishing/journal at `Engine.ts` ~342/465/478/534) must **not** also pay for a scripted instance.
Rule: scripted instances carry a `scripted: true` marker; the ambient reward callbacks early-out
for scripted instances (campaign grants the beat reward instead). Verified during build against
the real callback sites.

**Mission-owned entity protection (Codex #3).** Scripted entities get a component/tag
(`MissionInstance { id }`); `WildlifeSystem` despawn/quota and `findNearestTowable` skip or
correctly type-match them; completion checks compare against the exact `instanceId`.

### 5.5 Boat progression

`unlockedBoats` seeds `['TUGBOAT']`; beat 5 rewards `unlockBoat: 'SUBMARINE'`. The launch screen
lists only unlocked boats; the **Greyharbor spawn** makes relaunch the swap mechanism (§5.1).
`applyBoatUpgrades` and `karmaPriceFactor` (existing) still apply.

### 5.6 Deterministic story locations + validation (`StoryBeats.ts` `STORY_LOCATIONS`)

Seeded world → fixed coords are stable. Locations lie east (+X) at increasing distance.
**Validation (Codex #10):** do **not** trust live `ChunkManager.getTerrainHeight` (returns 0 for
unloaded chunks). Validate each coord by sampling **`generateIsland`/noise directly** for the
target + neighbor chunks: sea beats require open water with clearance from islands/harbors/buoys;
**Greyharbor** is chosen by scanning outward from origin for the nearest `harborEligible` island,
then **pre-discovered** (seed `DiscoveryTracker`) and registered in `harborPositions` so the
existing HarborSystem/UI accept it (Codex #11). Validated values recorded as named constants.

### 5.7 `QuestLog` UI + `ObjectiveMarkerProvider`

- `QuestLog` (`src/ui/QuestLog.ts`): compact top-left panel, de-serifed, beat **title** +
  **objective** + **distance/bearing** to the waypoint; collapsible; hidden in Free Roam.
- `ObjectiveMarkerProvider` (Codex #15): replaces the `distress.getMarker() ?? contracts.getMarker()`
  slot (Engine ~752/760) with one priority chain; in campaign mode the campaign waypoint outranks
  rescue/contract markers so it never silently hides on the compass/minimap.
- Narration (briefs, clues, success lines) uses the **existing toast stack**.

### 5.8 No-weapons finale controller (Codex #13)

Beat 8's `leviathan-boss` is owned by a scripted finale controller with **non-storm lifetime**
(doesn't vanish when weather changes). Two completion paths, same reward:
- **Armed:** destroy the strike zones (existing torpedo path).
- **Disarmed (`tb-disarmed`):** **lure** — lead the Leviathan across the trench marker a
  deterministic **N times** (a counter), the heli distracting it; fleeing too far resets only the
  current pass (never a soft-lock); on the Nth pass it dives for good.
Both → `scriptedResolved()` → beat reward + "Slew/Drove off the Leviathan".

### 5.9 Save / resume & edge cases

- Load `tb-story` at start; **Continue** re-arms `currentBeat` fresh (§5.2). **New Game** resets
  `tb-story` only ("Restart story"); lifetime credits/karma/journal persist (harmless — gating is
  beat-driven). Corrupt save → safe default.
- **Refresh mid-beat:** safe — re-arm respawns the scripted instance; `completed[]` prevents
  re-reward; partial progress discarded.
- **Completing an encounter "early":** impossible — the encounter only exists once armed
  (mission-owned), and ambient equivalents don't satisfy `instanceId`.
- **Leaving the area / despawn:** mission-owned instances are protected from ambient despawn; if
  the player leaves, the waypoint guides them back; the instance persists until the beat completes
  or is disarmed.
- **Free Roam:** constructs no campaign systems → zero behavioral change.

## 6. Data flow — one beat

```
armBeat(beat):
  toast(brief); QuestLog.set(objective, waypoint); ObjectiveMarkers.push(campaign, waypoint)
  beginScripted(encounter)            // mission-owned spawn; ambient suspended
loop/frame:
  complete?(encounter, world, player, instanceId) →
     grant(reward) once (guard: completed[])      // Wallet/Karma/Journal/unlockBoat
     toast(successLine) [+unlock]; endScripted()   // ambient restored
     markCompleted; advanceBeat; saveCampaign
     next ? armBeat(next) : campaignComplete()
```

## 7. Testing strategy

- **Unit (vitest), new/pure:**
  - `CampaignState`: new/advance/unlock/flags/markCompleted; save→load round-trip; corrupt →
    default; `isComplete` at end; `advanceBeat` past end is a no-op; **reward-once** guard.
  - `StoryBeats` graph: ids unique/ordered; `requiresBoat`/`unlockBoat` reference real registry
    keys; `reward.journalKey` exists in `JOURNAL_ENTRIES`; all coords finite; chain reaches
    `leviathan-boss`.
  - Encounter-layer pure pieces: mission-instance registry add/identity/remove; objective-marker
    **priority** (campaign outranks distress/contract); lure counter logic.
- **Integration** (scripted spawns, ambient suspension, sonar/mermaid/Leviathan modes, QuestLog,
  finale paths): `npm run build` + Jane's playtest — consistent with the project norm that
  integration-heavy systems aren't unit-tested.
- Existing 63 tests stay green; Free Roam smoke-checked unchanged.

## 8. File-by-file change list

**New:**
- `src/state/CampaignState.ts` — campaign save/state machine (pure).
- `src/state/StoryBeats.ts` — beats, `EncounterSpec`, `STORY_LOCATIONS`.
- `src/systems/MissionSystem.ts` — sequencing, arming, completion, reward, persistence; owns the
  mission-instance registry + objective-marker provider (or split into a small
  `src/state/MissionInstances.ts` + `src/ui/ObjectiveMarkers.ts`).
- `src/ui/QuestLog.ts` — objective panel + waypoint indicator.
- `tests/campaign.test.ts` — CampaignState + beat-graph + encounter-layer pure tests.

**Modified (scripted modes + wiring):**
- `src/state/GameConfig.ts` — `campaign?`, `spawn?`.
- `src/main.ts` — Story vs Free Roam; campaign launch screen (Continue / New Game / unlocked-boat
  picker + wrong-boat guard); ESC → campaign launch in campaign mode.
- `src/Engine.ts` — when `campaign`: construct CampaignState + MissionSystem + QuestLog +
  ObjectiveMarkers; spawn at Greyharbor; **suppress ambient reward callbacks for scripted
  instances**; route the objective marker through the priority provider; update calls.
- `src/systems/LeviathanSystem.ts` — `beginScripted({x,z,phase,persistStorm}) / endScripted /
  scriptedResolved`; suspend ambient rolls + storm-tied despawn while scripted.
- `src/systems/MermaidSystem.ts` — `beginScripted({x,z}) / endScripted / scriptedHeard`; bypass
  night/calm/karma/lifetime gates for the scripted instance.
- `src/systems/DistressSystem.ts` — `beginScriptedRescue({id,x,z}) / endScripted`; suspend ambient
  cooldown while scripted.
- `src/systems/WildlifeSystem.ts` + `src/systems/TowingSystem.ts` — honor `MissionInstance`
  (despawn/quota protection; tow identity / type-match).
- `src/systems/SubmarineSystem.ts` + `src/world/ChunkManager.ts` — scripted landmark registry for
  sonar + journal; pre-discovered story harbor in `harborPositions`/`DiscoveryTracker`; coord
  validation via `generateIsland`.
- `src/systems/WeaponsSystem.ts` — finale resolution reads the scripted controller (armed path).
- `index.html` — `#quest-log` element + styles.

## 9. Risks & mitigations

- **Encounter-layer breadth** (touches ~7 systems). Mitigation: one uniform `beginScripted/
  endScripted` contract; mission-owned instances; **stage** delivery (beats 1–4 milestone first).
- **Double-reward/desync.** Mitigation: single reward path + `scripted` marker early-out +
  `completed[]` reward-once guard; unit-test the guard.
- **Determinism drift.** Mitigation: lock `WORLD_SEED`; validate via `generateIsland`; Greyharbor
  is a real eligible harbor, pre-discovered, not a forced override.
- **Scope.** Mitigation: cut fishing (beat 3 → pickup); heli is ambiance; beat-granularity resume;
  narration via toasts; one required unlock (sub).

## 10. Act 2 hook (recorded, out of scope)

The Leviathan dies/retreats *fleeing something deeper* — the seed for Act 2. CampaignState's
`flags`/`beat` model extends by appending beats; no schema change.
