# Act 3 "The Turning Tide" — implementation plan · v2

**Status:** codex-gated (`act3-plan-gate`, verdict: revise — 1 CRITICAL + 3 findings, all folded; the gate confirmed the empty-`ACT3_SHIPPED` composition, the era-closure interplay, and the construction-time band design)
**Spec:** `docs/superpowers/specs/2026-07-09-act-3-the-turning-tide-design.md` (v2, gated, approved)
**Branch:** `story-mode` (continues past the Act 2 ship, PR #22)
**Ship rule:** Act 2's, verbatim — build order ≠ ship order; the slice (era + beats 20–22) is built and felt first behind `VITE_STORY_HARNESS`; beats append to `ACT3_SHIPPED` only when their stage is playable; prod deploys only on Jane's "ship Act 3"; `assert-no-harness` markers carry unshipped Act 3 ids.

## Testing doctrine (Act 2's, extended)

Transition tables for every machine change: SongAnswer per-point bands (default-band fallback, per-gate boundary values, mixed-band arcs), `savedOrderFor(state)` (new/migrated/corrupt/zero-saved saves), keeper sanitizer (unsaved-soul rejection), era functions (act2 values byte-identical to today's constants — snapshot-tested; act3 values; **the reachability invariant as a test helper**: every Act 3 deep point's band fully reachable under `floorAtAct3`). Integration: append-boundary saves (act2complete arms beat 17), beat-token dialog guard (late resolution commits nothing), era reset on disarm. Graph tests extend to Act 3 (unique ids across three acts, requiresBoat on 20–22, journal keys, open water on every new point).

## Stage 0 — groundwork (no beats ship)

1. **Depth eras** (`TrenchProfile`): `setEra('act2'|'act3')` module state; `ACT3` constants (core floor −105, shelf/bands shifted, fog curve); `floorAt`/`depthT`/bands read the era; `Underwater` fade thresholds become era-aware (act2 numbers unchanged when era is act2). MissionSystem: era set in `arm()` for beats ≥ 20, reset in `disarm()` — **always**, so no path leaves act3 active outside the descent.
2. **Keeper contract** (`CampaignState`): `keeper` + `savedOrder` fields, loader sanitizers (soul keeper valid only if actually saved; savedOrder deduped/validated), `savedOrderFor(state)` pure helper, `act2complete` derivation on load for older finished saves. **Act 2 retrofit:** beat-13 delivery appends to `savedOrder` (one line in the soul-transport delivery commit).
3. **Dialog generalization** (`ChoiceDialog` + Engine + MissionSystem): `show(title, line, options: string[])` resolving an index, plus a **public `cancel()`** (closes the UI; the pending promise rejects with `'cancelled'`, callers swallow it); Engine's mercy ask migrates (behavior identical, regression-checked); MissionSystem gains a **`choice(...)` + `cancelChoice()` dep pair** (gate: the token guard alone doesn't remove a blocking UI) with the **beat-token guard**: token = beat id + an arm-generation counter; resolution re-checks the token before any commit; `disarm()`/`dispose()` call `cancelChoice()` and bump the generation.
4. **SongAnswer per-point bands**: `points` metadata moves to the caller as today, machine gains optional per-step band override (`step(dt, dist, y, speed, band?)` or per-point bands at construction — plan picks construction-time array, cleaner); existing single-band behavior is the default (Act 2 finale regression-identical).
5. **Three-act append plumbing**: `src/state/StoryBeatsAct3.ts` (beats authored in stage 1; `ACT3_SHIPPED = []` until stage 2); working array = Act 1 + `ACT2_SHIPPED` + `ACT3_SHIPPED`; harness array = Act 1 + **full Act 2 + full Act 3** (devExtendBeats replaces the whole suffix — the Act 3 harness caller passes `[...ACT2_BEATS, ...ACT3_BEATS]`, per gate); harness seeding for `?beat=17..24` (Submarine unlock, `deepRefit`, default `mercy` unless `?slain`, default fates `{survivor_wife:'saved', soul_lampkeeper:'saved', soul_deckhand:'kept'}` + matching savedOrder, `act2complete`); `assert-no-harness` markers += the eight Act 3 ids. **Pre-stage-2 completion test (gate):** an act2complete save with `ACT3_SHIPPED = []` stays complete ("to be continued"), and beat 17 arms only after stage 2 appends.
6. **All Act 3 types land HERE (gate CRITICAL — types before data):** the six `EncounterSpec` kinds (`visit`, `procession`, `descent-gates`, `listen`, `keeper-choice`, `ascend`), `requiresNight` on the mermaid kind (beat 10's id-special-case refactors onto it in stage 2, behavior-identical), and `validateBeatGraph(knownBoats, beats = STORY_BEATS)` generalized to take the combined array. Types are additive and prod-inert; beat 24's `the-turning-tide` journal id stays test-guarded by Act 2's `PENDING_JOURNAL` pattern until the catalog entry ships in stage 4.

## Stage 1 — the slice (era + beats 20 → 21 → 22, harness only)

7. **Beat data 17–24 authored** in `StoryBeatsAct3.ts` (all types exist since stage 0 task 6; coordinates from the spec; open-water + reachability tests land with the data; beat 24's journal id under the `PENDING_JOURNAL` guard).
7. **Props/VFX**: mote-ring (slow-rotating ring of emissive motes, the maelstrom's spiral); `createDeepPresence(palette?)` + `createGuardianSerpent(palette?)` color params (defaults = today, Act 2 snapshots unchanged); warm-gold palette constants.
8. **Beat 20 `descent-gates`**: encounter kind + mission wiring — era arm, three gates from beat data with per-gate bands, the too-shallow/too-deep/too-fast coaching reused verbatim, mote-ring at the trench center, gate-banked toasts ("The water lets you pass. Deeper.").
9. **Beat 21 `listen`**: kind wrapping HoldTimer — submerged-in-band condition, radius 60 at the heart, ~30s, midpoint line only; warm-gold presence, larger scale; no storm, no serpent, no branch side effects.
10. **Beat 22 `keeper-choice`**: kind + the token-guarded dialog at the heart (radius + band + asked-guard); options per the spec's matrix (mercy×saved, incl. the one-option ask); commit `keeper` + save before completion; three authored closing lines chosen by keeper (companion-kept / soul-kept with the name / sealed).
11. **Slice draft** (`VITE_STORY_HARNESS=1` build) → **Jane's feel-check**: `?beat=20&boat=Submarine` runs the descent → heart → ask end to end. Feel question: does descent-reveal-ask land as the act's promise?

## Stage 2 — the approach ships (beats 17–19 append)

12. **`requiresNight` field**: mermaid encounter spec gains the flag; beat 10's id-special-case refactors onto it (behavior identical); `cracked-charm` uses it.
13. **Beat 17 `visit`**: kind on the MultiPickup machine (no props, no dock; per-point `visit_*` flags); the silent bell (prop, no toll — its silence is the point), the pier figure (prop + soft hum loop, new small synth on the SoundEffects pattern) cast via `savedOrderFor`.
14. **Beat 18 `cracked-charm`**: mermaid + requiresNight at the exodus waters; charm-crack copy.
15. **Beat 19 `procession`**: 2–3 escort hulls (StoryProps variants, untargetable/untowable) on lagged-offset follow (teleport-catchup when far, the wildlife pattern); returning merfolk (exodus VFX, inverted heading); mercy → guardian alongside; completion = trench approach radius 60.
16. **Append 17–19** to `ACT3_SHIPPED` (markers shrink); plates 19–21 → `public/story/` + `INTERLUDE_PLATES`; draft → Jane plays act2complete → 19 continuously.

## Stage 3 — the descent ships (beats 20–22 append)

17. Fold Jane's slice feel-check notes; append 20–22; plates 22–24; markers shrink; draft.

## Stage 4 — the close (beats 23–24)

18. **Beat 23 `ascend`**: surfaced within 150 of the trench; `soulStream` vertical mote columns (shared with 19's returning-merfolk work where sensible); the ring slows to still; unforced weather; sealed-branch copy variant (stiller, colder).
19. **Beat 24 `homecoming`**: dock arrival; the epilogue (names the saved, the kept, the keeper or the seal, the mercy — via `savedOrderFor` + `keeper` + flags); `campaignComplete`; journal `the-turning-tide` **added to the catalog + JOURNAL_TOTAL + tests in this stage**; quest log's final closing line; plate 26 as the campaign's last card.
20. **Append 23–24**; plates 25–26; markers = `TB_DEV_HARNESS` only; full-campaign draft.

## Stage 5 — polish & ship

21. Copy pass (Jane edits); save matrix: fresh / mid-Act-1 / mid-Act-2 / act2complete with & without `savedOrder` / mercy × slain × keeper states / mid-Act-3 reloads (per-beat: visit flags, gate resets, pending-dialog reload, post-keeper) / `campaignComplete`; Act 1+2 full-run regression; **era byte-identity test** (harness jump to 12/13/16 = today's behavior); prod-build assertion.
22. PR `story-mode` → `main`, merge, prod deploy — **only on Jane's "ship Act 3."**

## Risks the plan accepts

- The warm-gold turn (beat 21) is the act's aesthetic risk; palette params make retuning cheap, and the slice fronts it.
- Lagged-offset escorts may read as simple; that's the intent (seamanship, not pathfinding) — the plan resists upgrading them.
- The one-option ask (slain + zero-saved) is a degenerate dev-save case; it must render and commit cleanly but gets no polish budget.
- Jane's Act 2 prod feedback may interleave; fixes land on `story-mode` and ship with the next stage or as hotfix PRs off `main`.
