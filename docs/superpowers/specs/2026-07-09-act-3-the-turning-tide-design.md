# Act 3 "The Turning Tide" — campaign design spec · v2

**Status:** codex-gated (`act3-spec-gate`, verdict: revise — no CRITICALs; all 7 findings folded in) → ready for Jane
**Parent:** `2026-07-09-act-3-the-turning-tide-systems-reboard.md` (approved 2026-07-09, including its stated positions)
**Ship rule:** Act 2's discipline, verbatim — beats append to production only when their stage is playable; the full act deploys to prod only on Jane's "ship Act 3"; the dev harness (VITE_STORY_HARNESS) carries unshipped beats; `assert-no-harness` markers guard unshipped ids.

## Story

The campaign's return leg. Seasons turn; Greyharbor calls you a hero; the calm rings false. The bell on the flats has gone silent, the first soul you saved hums a song she shouldn't know, and the mermaid brings one last cracked-charm warning: what was lulled was never truly stilled. You do not go down alone this time — the harbour empties behind you, the merfolk return, and (if you spared it) the Leviathan surfaces alongside. Down the maelstrom, past everything, the heart of the deep is revealed warm and gold and unbearably alone — and the sea asks its price: something living must stay, or the door is sealed. Then slack water, the long rise, and home at dawn, changed.

**Approved positions this spec implements:** beat 22 is an explicit blocking dialog; **refusal is always offered** (three endings on mercy saves — companion-kept, soul-kept, sealed; two on slain saves — the Act 1 kill's final cost is the gentle option); the act3 depth era reaches −105 while Act 2's era stays byte-identical; post-credits is the existing New Game + Free Roam, no new mode.

## Cross-cutting contracts (from the gated re-board)

### Depth eras
`TrenchProfile` gains `setEra('act2' | 'act3')` (module state, the WORKING_BEATS pattern): `act2` = today's constants, frozen; `act3` = core floor −105, shelf and bands shifted, its own fog curve; `floorAt`/`depthT`/band getters read the era. MissionSystem sets `act3` when a beat ≥ 20 arms and resets `act2` on disarm. Underwater's fade thresholds become era-aware. **Stated tests:** a harness jump to beats 12/13/16 after Act 3 ships is byte-identical to today; and a **reachability invariant per deep interaction point** — for every gate/heart/ask point `p` with band `b`, `floorAtAct3(p) ≤ b.min` (the sub can reach the whole band where it's asked to hold it). All Act 3 deep points sit inside the trench **core** (floor −105) so every band is fully reachable; coordinates are in the beat table and tested, not deferred to the plan.

### Keeper contract & savedOrder
```ts
savedOrder: SoulId[]; // appended at each beat-13 delivery (new saves)
keeper: { kind: 'leviathan' } | { kind: 'soul'; soulId: SoulId } | { kind: 'sealed' } | null;
```
Loader sanitizers: a soul keeper is valid only if `soulId` is a known `SoulId` **and** that soul was actually saved (`fates[soulId] === 'saved'` or present in sanitized `savedOrder`) — a plausible-but-unsaved id is rejected to null. `savedOrder` entries are deduped, restricted to valid saved souls, and order-preserved.

**One pure helper serves every consumer:** `savedOrderFor(state): SoulId[]` — used by beats 17 (the pier casting), 22 (the volunteer), and 24 (the epilogue) — sanitizes `savedOrder` when present, else derives from `fates` insertion order, else falls back deterministically (`survivor_wife` if saved → any saved → empty). Unit-tested against new, migrated, and corrupt saves. Older completed saves also derive `act2complete` on load from `completed.includes('drowned-light')` (or the beat pointer being past Act 2). The zero-saved edge cannot soft-lock: refusal is always an option.

### Dialog generalization
`ChoiceDialog.show(title, line, options: string[])` (1–3 options) resolving the chosen index; same blocking shell and key-swallowing. MissionSystem gains a `choice(title, line, options): Promise<number>` dep for **mid-beat** asks, with an asked-guard on the armed beat (never re-shown while pending or after commit; a reload before commit re-asks). **Stale-resolution guard (the gate's soft-lock class):** the resolution closure captures a beat token (beat id + arm generation); before committing anything it re-checks the token against the currently armed beat, and disarm/dispose closes any pending dialog and invalidates its token — a late `.then` after a reload, harness jump, or beat change commits nothing. The act-entry mercy ask migrates to the array API unchanged in behavior.

### Three-act append
`ACT3_BEATS` / `ACT3_SHIPPED` in `src/state/StoryBeatsAct3.ts`; working array = Act 1 + `ACT2_SHIPPED` + `ACT3_SHIPPED`; harness array = Act 1 + full Act 2 + full Act 3; `assert-no-harness` markers = `TB_DEV_HARNESS` + unshipped Act 3 ids, shrinking per stage exactly as Act 2's did.

## Beats 17–24

| # | id | Title | Encounter | Completes when | Reward |
|---|----|-------|-----------|----------------|--------|
| 17 | `false-calm` | The False Calm | **`visit`** (new thin kind on the MultiPickup machine): two points — the silent bell on the flats, the humming figure at the pier's end (fates-aware casting: first-saved soul) | both visited | 40cr |
| 18 | `cracked-charm` | The Cracked Charm | `mermaid` with **`requiresNight: true`** — the night-wait becomes a data field on the mermaid encounter (today it's hard-gated to beat id `exodus`; both beats move to the field), same dark-water spot her people left from | within ~15 m after dark | 60cr |
| 19 | `all-hands` | All Hands | **`procession`** (new): 2–3 escort hulls on follow-splines from the harbour mouth, returning merfolk silhouettes, mercy → the guardian surfaces alongside | reach the trench approach (radius 60) with the procession live | 80cr |
| 20 | `into-maelstrom` | Into the Maelstrom | **`descent-gates`** (SongAnswer extended with per-point bands): three gates **inside the trench core** (era floor −105, so every band is fully reachable) — gate 1 (1100, 186) band −30..−45 · gate 2 (1040, 126) band −50..−70 · gate 3 (1100, 86) band −80..−100; slow mote-ring prop sells the spiral — **requiresBoat Submarine** | third gate banked | 60cr |
| 21 | `heart-deep` | The Heart of the Deep | **`listen`** (new thin kind on HoldTimer): ~30s submerged inside radius 60 of the trench center (1100, 86), band −85..−105 (core floor −105 ⇒ whole band reachable), no threat, no branch side effects; the presence prop in a **warm-gold palette** (builder parametrized) — **requiresBoat Submarine** | the listen completes | 80cr |
| 22 | `what-sea-asks` | What the Sea Asks | **`keeper-choice`** (new): at the heart (same point/band as 21), the generalized dialog asks once (token-guarded, above); options per save (below); the answer writes `keeper` + saves **before** completion returns true on the next poll — **requiresBoat Submarine** | keeper committed | karma +10 |
| 23 | `slack-water` | Slack Water | **`ascend`** (new thin kind): surface (y ≥ −0.3) within 150 of the trench; rising soul-mote streams (vertical VFX variant), the ring slows to still, unforced weather | surfaced in radius | 60cr |
| 24 | `homecoming` | Homecoming | arrival reuse: reach the Greyharbor dock (radius 44), any boat | at the dock | 400cr · karma +15 · journal `the-turning-tide` (**ships with this stage**: `JOURNAL_ENTRIES` + `JOURNAL_TOTAL` + journal tests updated together — logging silently no-ops on unknown keys, so the catalog add is on the stage checklist, per Act 2's lesson) · flag `campaignComplete` |

**Beat 22 options by save:**
- mercy + a saved soul: *"Let the Leviathan stay"* / *"Let {soul} stay — she is willing"* / *"Seal the deep"*
- mercy + zero saved (edge): *"Let the Leviathan stay"* / *"Seal the deep"*
- slain + a saved soul: *"Let {soul} stay — she is willing"* / *"Seal the deep"*
- slain + zero saved (edge): *"Seal the deep"* (a one-option ask is still an ask — the sea hears the answer)

**Beat 22 closing lines** (chosen by keeper, authored in beat content): companion-kept (the Leviathan's long vigil begins), soul-kept ({soul} takes the light's hand — named, gentle, heavy), sealed (the door closes; the quiet has a shape). Beat 23–24 copy and visuals branch: guardian absent forever after companion-kept; the kept soul named in the epilogue; sealed saves rise through stiller, colder water.

**Epilogue (beat 24):** names everything — the saved, the kept (Act 2), the keeper or the seal, the mercy. The final interlude card is plate 26 (the dawn homecoming). Quest log closes with the campaign line; `campaignComplete`; the campaign screen's Continue shows the completed state; New Game and Free Roam are the post-credits, as approved.

## New/extended systems (contract level; implementation belongs to the plan)

- **`visit`** — MultiPickup machine, no props to collect, no dock phase: N named points, planar radius, order-free, per-point flags (`visit_*`), completion = all visited. The pier figure is a scene prop with a soft hum loop (new small synth on the SoundEffects pattern).
- **`procession`** — mission-owned escort hulls (StoryProps recovery-hull variants, untargetable/untowable) on follow-splines behind the boat (offset-follow, not pathfinding: each holds a lagged offset of the player's track); merfolk return = the exodus effect with inverted heading; mercy adds the guardian on its circling spline. No failure states; if the player outruns the escorts they catch up (teleport-when-far, the wildlife pattern).
- **`descent-gates`** — SongAnswer gains optional per-point bands (`points: {x,z,band?}`; the machine's single band becomes the default). Same dwell/violation/feedback semantics; gate feedback reuses the too-shallow/too-deep coaching verbatim.
- **`listen`** — HoldTimer wrapped without the guardian's branch side effects: submerged condition (y inside band) instead of surfaced, no storm, no serpent, midpoint line only.
- **`keeper-choice`** — proximity + band triggers the dialog (once); the promise commits `keeper` + `saveCampaign` before completion returns true; reload before commit re-asks; after commit the beat completes on the next poll.
- **`ascend`** — trivial: surfaced within radius. The rising motes are the beat, not the mechanic.
- **Prop/VFX parametrization** — `createDeepPresence(palette?)` and `createGuardianSerpent(palette?)` gain color params (defaults = today's values, Act 2 visuals unchanged); a new `soulStream` effect (vertical mote columns) shared by beats 19 (returning) and 23 (rising).
- **Era plumbing** — per the cross-cutting contract above.

## Interludes (plates 19–26, already generated)

`INTERLUDE_PLATES` additions: 19 begin `false-calm` · 20 complete `cracked-charm` · 21 begin `all-hands` · 22 begin `into-maelstrom` · 23 complete `heart-deep` · 24 begin `what-sea-asks` · 25 complete `slack-water` · 26 complete `homecoming` (the campaign's final card). Plates ship to `public/story/` with their stages.

## Comfort & tone

Forced-peaceful continues; no Act 3 objective involves weapons; every mission entity is protected by the Act 2 capability flags. No fail states and **no failure countdowns** — the dwell and listen timers only measure patient presence and cannot fail a beat; the maelstrom waits, the heart waits, the ask waits. Refusal is written as an answer, never a failure. The act's only weight is the choice itself, carried by copy and the epilogue.

## Vertical slice

**Era + beats 20 → 21 → 22** (as approved): the act3 depth era, the SongAnswer extension, the warm heart, the generalized dialog, and the keeper contract — all of Act 3's implementation risk in one draft. Feel-check question: does the descent-reveal-ask sequence land as the act's promise? Everything else is proven reuse.

## Out of scope (unchanged from re-board)

No fleet AI, no fluid simulation, no new vessel, no new pure machines, no post-credits mode, no Act 4 hooks beyond the epilogue's last line.

## Risks / notes for the plan

- The era switch is the slice's structural risk: it must be impossible to leave the act3 era active outside beats ≥ 20 (disarm always resets; a stated test).
- Beat 22's dialog-completion interplay (promise resolution vs the per-frame poll) needs the asked-guard specified exactly — the gate's soft-lock class.
- `savedOrder` backfill for act2complete saves is best-effort by design; the derivation is a pure function with tests.
- Escort follow-splines should read as seamanship, not pathfinding — lagged-offset following is deliberately simple; the plan should keep it that way.
- Coordinates (gates, approach point, pier point) validated open-water at plan time, as always.
