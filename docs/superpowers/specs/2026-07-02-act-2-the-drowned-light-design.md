# Act 2 "The Drowned Light" — campaign design spec · v2

**Status:** codex-gated (`act2-spec-gate`, verdict: revise — all 12 findings folded in below) → ready for Jane
**Parent:** `2026-07-01-act-2-the-drowned-light-systems-reboard.md` (approved 2026-07-02, including its stated positions)
**Build gate:** no Act 2 code lands until Act 1 ships to prod. This spec exists so the plan can start the moment it does.

## Story

Act 1 ended with the Leviathan spared (lured into the trench) or slain, and the mystery half-answered: something below drove it up. Act 2 answers the rest. The sea around Greyharbor goes still and wrong; the merfolk abandon the upper water; the coastguard sub is refitted for depths no boat should reach. At the trench floor waits a drowned hamlet where the vanished crews stand singing in the thrall of something ancient, vast, and indifferent, not hunting, only waking and alone. The captain carries who they can back to the light (not everyone), holds the line when the deep reaches for Greyharbor itself, and finally answers the song, with the spared Leviathan's help or utterly alone.

**Approved positions this spec implements:** three named souls, room for two (forced loss); the same submarine refitted, no ninth boat; Act 1 mercy gates the soft ending; pre-flag saves are asked once at act start; the vertical slice leads with the deep zone.

## Two contracts that bind every beat (gate: CRITICAL ×2)

**Required boat, everywhere it matters.** Beats 12, 13, and 16 all carry `requiresBoat: 'Submarine'`. The wrong-boat handling that Act 1 special-cased to `sonar-contact` (dock marker routing, the ESC swap hint, completion guards) is **generalized to any encounter with `requiresBoat`** before any Act 2 beat is built. No beat may point a surface boat at an underwater objective.

**Mission-critical entities are invulnerable and anchored.** Story mode forces `peaceful` but honors the player's `disarmed` toggle — many players keep weapons. Therefore every mission-critical Act 2 entity (beat 9's derelict, beat 13's recovery vessel and souls, beat 15's rescue vessels) is **non-targetable by weapons and non-towable unless towing is the objective** (new WildlifeSystem capability flags, mission-set). Additionally the mission controller **re-arms any missing current entity** on its next update (destroyed, despawned, or absent after reload → respawn at stage start). Comfort claim, corrected: *no Act 2 objective requires weapons; the toggle remains honored.*

## Beats 9–16

Numbering continues Act 1 (`STORY_BEATS` grows 8 → 16; `isComplete` = beat ≥ length, so a finished Act 1 save arms beat 9 on next launch — subject to the mercy normalization below). Copy is final-draft quality but Jane-editable; locations are narrative anchors validated open-water by the layout helper at plan time.

| # | id | Title | Encounter | Completes when | Reward |
|---|----|-------|-----------|----------------|--------|
| 9 | `tide-stayed` | The Tide That Stayed | `tow-derelict` reuse + bell-buoy prop, off the flats west of Greyharbor | derelict towed home to the dock | 60cr · journal `rescue` |
| 10 | `exodus` | Her People Are Leaving | `mermaid` reuse at night waters east + exodus VFX (2–3 silhouettes on splines) | approach within ~15 m (the existing scripted-heard latch; her song is audible much farther, the *encounter* is close) | 60cr · journal `mermaid` |
| 11 | `deep-refit` | Built for the Pressure | **`multi-pickup`** (new, contract below): 3 salvage contacts among the reef wrecks, then return to dock | third pickup + dock radius | flag `deepRefit` (live, same session) · 80cr |
| 12 | `into-trench` | Into the Trench | `sonar-contact` at the trench — **requiresBoat Submarine**, radius 70, depth band −50..−80, ledge dressed with 6–8 upright sunken-boat props + drifting emissive motes, sonar pings on approach | in band over the ledge | 50cr · journal `wrecks` |
| 13 | `drowned-choir` | The Drowned Choir | **`soul-transport`** (new, the act's L) — **requiresBoat Submarine** | two souls delivered; third commits `kept` | 120cr · karma +10 · journal `drowned-choir` (new) |
| 14 | `old-enemy` | An Old Enemy | **`guardian`** (new): hold the line at the trench mouth, surfaced | mission-owned hold timer completes (below) | 80cr · journal `the-guardian` (new) |
| 15 | `king-tide` | The King Tide | **`rescue-sequence`** (new): 3 sequential scripted rescues off Greyharbor under forced storm | third vessel towed clear | 100cr · karma +10 |
| 16 | `drowned-light` | The Drowned Light | **`song-answer`** (new) — **requiresBoat Submarine** | third ordered pass banked | 300cr · karma +15 · journal `drowned-light` (new) · flag `act2complete` |

Beat 13's three souls: `survivor_wife` (Mara, the beat-4 survivor's wife), `soul_lampkeeper` (Edda, the old lampkeeper), `soul_deckhand` (Tomas, the Marigold's deckhand — closing the Act 1 opening). The Marigold connection makes the forced loss story-relevant, not arbitrary.

## New systems (contract level; implementation belongs to the plan)

### Deep zone (slice anchor)
- **Runtime depth provider**, not a constant: `SubmarineSystem` gets `maxDepthAt(x,z)` (or `setMaxDepth`), consulted each frame, **updated the moment `deepRefit` commits** (beat 11 arms beat 12 in the same session) and initialized from the flag on load.
- **One trench depth-profile object** governs everything below the standard world: the trench volume (center, radius, **blended entry shelf** so crossing the boundary while deep eases the limit rather than snap-clamping), the sub's local floor (−80 in-trench, −35 outside), the seabed visual (the `Underwater` camera-following plane is repositioned/replaced *by the profile*, not by the chunk system — the plane is not chunk terrain), prop placement, the deep fog/tint curve (existing DOM tint saturates ~−14; the deep band −35..−80 gets its own curve + headlight cone), and all interaction depth bands.
- Fallback if the deep look can't be made good: the profile retunes **as a unit** (e.g. floor −60, content −55, bands −40..−60) — never constants edited in isolation.
- Surface-crossing and camera clipping are slice test cases.

### Multi-pickup (beat 11)
- Three salvage contacts with **stable IDs** (`salvage_plating`, `salvage_viewport`, `salvage_gauges`), each an anchored pickup prop; each collection **commits immediately** to a per-ID flag; marker advances to the nearest uncollected, then the dock.
- Reload: collected IDs stay collected; uncollected props respawn. Dock phase completes the beat and commits `deepRefit`.

### Soul transport (beat 13)
- States: `idle → carrying(soulId) → delivered(soulId)`, one soul at a time.
- Pickup: 3D contact, radius ~8, **depth band −55..−80**, at the hamlet on the trench floor. Carry visual = tethered glow on the sub. No timer, no failure.
- Delivery: **surfaced** (y ≥ −0.3) within ~40 of the recovery point — a **stationary, non-targetable, non-towable prop vessel** holding station above (a moored coastguard hull, not live wildlife), which doubles as the surface marker.
- Each delivery commits immediately to `fates`; a reload never un-rescues. **Load-state derivation:** delivered souls read from `fates`; any carry state is discarded (carry visual removed); only undelivered souls respawn in the hamlet. On beat completion the remaining soul commits `kept`.
- Choice UI: none — choosing is *doing*. The soul you didn't go back for is the one the sea keeps. The card and epilogue name her.

### Guardian (beat 14)
- **The mission-level hold controller is authoritative for both branches:** hold = cumulative time surfaced (y ≥ −0.3) inside the hold radius at the trench mouth; leaving **pauses** the clock (never resets); reload resets elapsed time. `mercy` → 60s; `slain` → 90s under storm.
- The Leviathan `guardian` phase is **branch-specific visuals only** (mercy branch): circling at ~60 m, weapon-immune, un-targetable, slams and ambient banners suppressed. It emits nothing the mission depends on — the slain branch has no Leviathan and completes identically.

### Rescue sequence (beat 15)
- Three sequential scripted rescues at points around the harbour approach; per-stage completion commits a **stable boolean flag** (`kt_rescue_1..3` — the flags store is `Record<string, boolean>`; the count is derived, never stored as a number).
- Stage lifecycle: spawn → hook → tow clear (safeRadius ~120) → **release tow, then cleanup** → next. If the current vessel is ever absent (destroyed, despawned, reload), the stage restarts with a fresh spawn. Count surfaced like lure passes ("Two saved. One more out there.").

### Song answer (beat 16)
- New checkpoint-pass machine (LureCounter-inspired, separate class, unit-tested): 3 marked points **in order** around the deep presence; a pass = enter radius ~25 within depth band −50..−80 at calm speed (threshold defined in engine units at plan time; ~6 kn equivalent) and **dwell 5s — dwell resets if speed or band is violated**, with live "too fast / too shallow / too deep" feedback (the Act 1 knows-WHAT-not-HOW rule, systematized). Leaving a point re-arms the next; reload resets passes (single-sitting finale, ~5 min).
- `mercy` → the Leviathan's call joins as **audio + a fixed-spline silhouette** (no submerged companion pathing) in **unforced weather** (beat 15's storm override is released; whatever weather naturally follows is the sky you get — scripted calm remains out of scope): **soft ending**. `slain` → the same points under forced storm: **seal ending**. Both end Act 2; the epilogue names the fates.

## Persistence & save-compat

- **Legacy mercy normalization happens before beat 9 arms:** on entering Act 2 with neither `mercy` nor `slain`, a **blocking two-choice dialog** (new minimal UI — `StoryInterlude` is dismiss-only and is not this) asks "Did you spare it, Captain?"; the answer writes the flag immediately; dismissing/reloading without answering re-asks. Precedence if both flags ever coexist: `mercy` wins (the kinder read), and the loader normalizes to one.
- `fates: Partial<Record<SoulId,'saved'|'kept'>>` on CampaignState; loader migration defaults `{}`; **invalid entries are dropped individually** (never reject the whole save). Display names live in beat content keyed by `SoulId`.
- New flags: `deepRefit`, `act2complete`, `salvage_*` ×3, `kt_rescue_*` ×3. New journal entries: `drowned-choir`, `the-guardian`, `drowned-light` (JournalTracker additions).

## Interludes (plates exist already)

Plates 11–18 ship to `public/story/` (gitignore exception exists). `INTERLUDE_PLATES` additions: 11 begin `tide-stayed` · 12 complete `exodus` · 13 complete `deep-refit` · 14 complete `into-trench` · 15 complete `drowned-choir` · 16 complete `old-enemy` · 17 begin `king-tide` · 18 begin `drowned-light`. Same seen-flag/toast-fallback behavior as Act 1.

## Comfort & tone

Campaign stays forced-peaceful. **No Act 2 objective requires weapons; the `disarmed` toggle remains honored** — and the invulnerability contract above means an armed player cannot break a beat, only ignore their guns. No fail states anywhere: every beat waits. The forced loss (one soul kept) is the act's only cruelty, per the approved dial; its weight is carried by copy and the epilogue, not by mechanics punishing the player.

## Vertical slice

Deep zone + beats 11 → 12 → 13, exactly as the approved re-board scoped it — including the trench depth-profile, the multi-pickup contract, the dressed ledge, and soul transport end-to-end. Slice exit question: does descending past −35 into the trench and carrying a soul home *feel* like the act's promise? If not, the remaining beats don't get built on top of it.

## Out of scope (unchanged from re-board)

No second entity fight, no water-level simulation, no crowd AI, no new vessel, no town interiors, no scripted-calm weather system, no Act 3 work of any kind.

## Risks / notes for the plan

- The trench depth-profile is the slice's real unknown; its fallback is a whole-profile retune, defined above.
- Act 1 playtest feedback may still reshape shared systems (markers, interludes); the plan re-checks this spec against whatever lands from Jane's current round.
- Beat copy drafts + exact coordinates are plan-time work (layout helper re-run; all points validated open water; kn→engine-unit conversion for the calm threshold).
