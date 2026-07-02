# Act 2 "The Drowned Light" — implementation plan · v2

**Status:** codex-gated (`act2-plan-gate`, verdict: revise — all 15 findings folded in; the gate confirmed the append-order itself is sound)
**Spec:** `docs/superpowers/specs/2026-07-02-act-2-the-drowned-light-design.md` (v2, gated)
**Branch:** `story-mode` (continues past the Act 1 ship, PR #21)
**Ship rule:** build order ≠ ship order. The vertical slice (beats 11–13) is built and *felt* first via a dev-only harness; **beats append to the production `STORY_BEATS` only when their whole stage is playable** (a finished Act 1 save arms beat 9 the moment it exists). Act 2 deploys to prod only when all 8 beats + copy + interludes are done. Drafts throughout.

## Testing doctrine (binding)

Every new stateful mechanic is a **pure class** (no THREE, no DOM, no storage) unit-tested like `LureCounter` — and "tested" means a **transition table**, not a happy path: invalid/duplicate transitions rejected, exact boundary values (radii, bands, thresholds at ±ε), dwell reset on violation and `dt` overshoot, hydration/reset semantics, idempotence of commits, ordered-point rejection (out-of-order approach banks nothing), sparse/missing flag hydration, and both branch durations. Machines: `MultiPickup`, `SoulTransport`, `HoldTimer`, `RescueSequence`, `SongAnswer`, plus `fates`/outcome normalization. Focused integration tests: required-boat routing (all three deep beats), targeting/towing exclusion at every entry point, same-session depth activation, append-boundary save loads. Graph tests: every reward `journalKey` exists in `JOURNAL_ENTRIES`; `into-trench`, `drowned-choir`, `drowned-light` all `requiresBoat: 'Submarine'`.

## Stage 0 — shared groundwork (no beats ship)

1. **Generalize required-boat handling** (`MissionSystem`): `requiresBoatUnmet(beat)` used by `getMarker` (dock routing), `armCurrent` (objective + ESC hint), the dock-proximity toast, and a guard at the top of `complete()`. Act 1 behavior byte-identical (regression: beat 5 flow unchanged).
2. **Entity protection capabilities** (`WildlifeSystem` + consumers): `setUntargetable(e)` / `setUntowable(e)`, enforced at **every entry point** — `WildlifeSystem.findNearestVesselOrZone` (which torpedo homing AND collision both use; there is no separate hit-scan), `TowingSystem`'s candidate search, `towEntity()`, and the preferred-towable path. Flags cleared in **both** `removeEntity` and mission teardown (`setMissionOwned(e,false)` clears them). Beat 9/15 vessels: **untargetable but towable** (towing is their objective); beat 13's recovery vessel and all soul props: untargetable + untowable.
3. **Re-arm recovery** (`MissionSystem.update`): per-encounter-kind `encounterHealthy(beat)` check (instance-backed kinds only: tow-derelict, rescue, multi-pickup props, soul-transport props/recovery vessel; mermaid/leviathan/weather kinds are excluded — their systems own lifecycle and expose scripted state already). Unhealthy → `disarm()` + re-`arm()`, seamless. Test: absence recovers without duplicate props or leaked tow state.
4. **`fates` + outcome normalization** (`CampaignState`): `fates: Partial<Record<SoulId,SoulFate>>`; `newCampaign` seeds `{}`; `loadCampaign` migrates missing → `{}`, drops invalid entries individually, and runs a pure `normalizeOutcome(flags)` — if both `mercy` and `slain` exist, **mercy wins** and `slain` is deleted. Unit tests: legacy load, invalid-entry drop, both-flags normalization.
5. **Dev slice harness** (compile-time-gated): a `import.meta.env.DEV`-only module that (a) appends the full Act 2 beat definitions to the working beat array (production `STORY_BEATS` untouched), (b) maps `?beat=N` **authored numbering → zero-based `state.beat = N−1`**, (c) seeds prerequisites (Submarine unlock, `deepRefit` for ≥12, a default `mercy` unless `?slain`), (d) **never persists** (`saveCampaign` suppressed while active), and (e) is proven absent from prod: a build assertion greps `dist/` for the harness marker (fails the build if present) — the launch screen's required-boat resolution is bypassed by the harness spawning directly in the sub for deep beats.

## Stage 1 — the deep zone + vertical slice beats (11 → 12 → 13)

6. **Extract story-prop builders** (`src/props/StoryProps.ts`): move `createDoomedShip()` out of `LeviathanSystem` (private today) into exported builders — wreck hull, bell buoy, soul sprite, recovery hull; `LeviathanSystem` imports it back, behavior unchanged (regression: spectacle renders identically).
7. **`TrenchProfile`** (`src/world/TrenchProfile.ts`, pure): **the single depth config** — center (reads `STORY_LOCATIONS.trench` x/z; geometry constants live here, no `STORY_LOCATIONS` schema change), radius, shelf width, in-trench floor (−80), outside floor (−35), seabed offset, content depths (ledge, hamlet), and **named interaction bands** (`contactBand`, `pickupBand`, `songBand`). `floorAt(x,z)` blends across the shelf (monotonic; outside ≡ −35); `fogT`, `inTrench`. Every later task **reads bands/depths from the profile** — the fallback retune is one file. Unit-tested.
8. **Depth provider wiring** (order-sensitive): `Engine` loads and retains **one** `CampaignState` *before* system construction (today the sub is constructed ~line 256, campaign state loaded ~605 — this moves the load up and threads the same object to MissionSystem). `SubmarineSystem` gains `setMaxDepthProvider(fn)` (constructor unchanged); Engine sets it at construction from the flag and **again the moment beat 11 commits** (MissionSystem callback), so the same-session flip works.
9. **Deep look** (`Underwater.ts` + Engine wiring): profile-driven tint/fog below −35; seabed plane repositioned by `floorAt` under the camera (never visible from below); headlight cone parented to the **player sub object** below −40 (Underwater gains a player-object dependency; construction + disposal changes listed in Engine). Slice test cases: surface crossing, shelf crossing while deep, camera clipping.
10. **Beat 11 `multi-pickup`**: pure `MultiPickup` (3 stable IDs → `salvage_plating|viewport|gauges` flags; marker = nearest uncollected → dock; immediate per-ID commit; hydrate from flags: only uncollected respawn). Props via StoryProps at validated reef points; 3D contact; dock phase completes beat, commits `deepRefit`, fires the depth-provider callback.
11. **Beat 12 `into-trench`** — **`requiresBoat: 'Submarine'`**: ledge dressed with 6–8 upright wreck hulls (StoryProps) + emissive motes; sonar ping cadence on approach; completion = radius 70 ∧ `contactBand` (from profile).
12. **Beat 13 `drowned-choir`** — **`requiresBoat: 'Submarine'`**, pure `SoulTransport`: full spec contract restated as the machine's table — pickup radius **8**, band = profile `pickupBand` (−55..−80), one-soul capacity, `SoulId → display name` map in beat content (`survivor_wife` Mara / `soul_lampkeeper` Edda / `soul_deckhand` Tomas), delivery = surfaced (y ≥ −0.3) within 40 of the recovery hull (StoryProps prop, untargetable/untowable, doubles as surface marker), each delivery commits to `fates` immediately, **hydration derives delivered from `fates`, discards any carry state (visual removed), respawns only undelivered souls**; beat completes on second delivery, third commits `kept`.
13. **Mercy-normalization dialog** (`src/ui/ChoiceDialog.ts` + Engine lifecycle): minimal blocking two-button overlay (interlude styling); **Engine owns it** — constructed campaign-only, input-captured like the interlude, disposed in `Engine.dispose`; when outcome is `unknown` at Act 2 entry, **`MissionSystem.start()` is deferred** until the choice commits a flag; dismissing/reloading unanswered re-asks. (Built now for the harness; ships with Stage 2.)

**Slice exit:** Jane plays 11→13 on a draft via the harness. Feel check before anything else is built.

## Stage 2 — the approach beats (9, 10) · Act 2 arc ships (beats 9–13 append together)

14. **Beat 9 `tide-stayed`**: tow-derelict reuse west of Greyharbor (vessel **untargetable, towable**) + bell buoy (StoryProps, untargetable) with slow toll on the ambient bus.
15. **Beat 10 `exodus`**: beat arms immediately and **waits for night** — `MissionSystem` gains an `isNight()` dep and calls `mermaid.beginScripted` only after nightfall (scripted mode deliberately bypasses the night gate, so the mission must not start her early); beat stays armed indefinitely; objective copy telegraphs dusk ("Wait for dark on the eastern water."). Exodus VFX: 2–3 silhouettes on outbound splines, disposed at range.
16. **Append beats 9–13 to `STORY_BEATS`**, `validateBeatGraph` extended (requiresBoat + journal-key graph tests), journal entry **`drowned-choir` added to `JOURNAL_ENTRIES` in this stage**, plates 11–15 → `public/story/` + `INTERLUDE_PLATES`. Draft → Jane plays 9→13 continuously (fresh + finished-Act-1 saves).

## Stage 3 — the turn (14, 15) · beats append when both playable

17. **Beat 14 `old-enemy`**: pure `HoldTimer` (cumulative surfaced time y ≥ −0.3 inside hold radius; exit pauses, never resets; reload resets; **mercy 60s / slain 90s** — durations tested). Leviathan `guardian` phase = mercy-branch **visuals only** (circle spline at `GUARDIAN_RADIUS = 60` named config, untargetable, slams/banners suppressed); slain = storm + absence, completes identically. "Hold the line" feedback from the timer.
18. **Beat 15 `king-tide`**: pure `RescueSequence` (stages → `kt_rescue_1..3` flags, derived count, sparse-flag hydration, restart-on-absent, **release-before-cleanup**; vessels untargetable + towable; `KT_SAFE_RADIUS = 120` named config). Forced storm; count toasts.
19. Append 14–15 + journal `the-guardian` + plates 16–17; draft.

## Stage 4 — the finale (16) + act close

20. **Beat 16 `drowned-light`** — **`requiresBoat: 'Submarine'`**, pure `SongAnswer`: 3 ordered points (out-of-order banks nothing), radius 25, band = profile `songBand`, calm threshold in engine units (kn conversion at implementation, value in named config), 5s dwell resetting on any violation, re-arm on exit, reload resets; live too-fast/too-shallow/too-deep feedback. **`MissionDeps` gains `getBoatSpeed()`** (Engine wiring listed). Deep presence = scaled StoryProps glow + silhouette.
21. **Endings**: mercy = unforced weather (storm override released; natural sky) + Leviathan call (audio + fixed-spline silhouette, no pathing) → soft ending; slain = forced storm → seal ending. Epilogue card names the fates; `act2complete`; quest log closes.
22. Append 16 + journal `drowned-light` + plate 18; full-act draft.

## Stage 5 — polish & ship

23. Copy pass (Jane edits), coordinates validated open-water (layout helper re-run), full suite green.
24. **Save-compat matrix (complete grid):** fresh save; mid-Act-1 (each beat); finished Act 1 with `mercy` / with `slain` / with **neither** (dialog) / with **both** (normalizes to mercy); Stage-2 and Stage-3 append-boundary saves (completed beats < array length); mid-Act-2 reloads — partial salvage flags, carrying vs delivered souls, partial hold time, each rescue-flag state incl. hooked-and-absent vessel, partial song dwell/passes; `act2complete`.
25. Comfort regression (armed player cannot break any beat: fire at every mission entity), Act 1 full-run regression, prod-build assertion (harness absent).
26. PR `story-mode` → `main`, merge, prod deploy — **only on Jane's "ship Act 2."**

## Risks the plan accepts

- The deep look is the slice's aesthetic risk; the profile retunes as a unit (spec fallback) if −80 can't be made beautiful.
- The guardian circle spline may read as mechanical; acceptable for v1 (a presence on-screen ~60s).
- Jane's Act 1 prod feedback may interleave; fixes land on `story-mode` and ship with the next stage or as hotfix PRs off `main`.
