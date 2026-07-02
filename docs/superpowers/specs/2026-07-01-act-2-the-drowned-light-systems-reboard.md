# Act 2 "The Drowned Light" — systems-honest re-board (pre-spec) · v2

**Status:** design re-board for Jane's review · not a build commitment · **revised per Codex gate** (`act2-reboard-gate`, verdict: revise — all findings folded in or explicitly resolved below)
**Depends on:** Act 1 shipping first (still unmerged, in playtest)
**Inputs:** the 26-plate storyboard (plates 11–18), Jane's three locked forks, the engine as it exists on `story-mode`.

## Why this document

The storyboard boards Act 2 **camera-first** — each plate is what a film would shoot. Built literally, it demands systems the engine doesn't have, and the act would cost 3–5× Act 1. This re-board keeps the story spine intact and restages every beat **engine-first**: new-system budget is spent deliberately, and the interlude plates carry the imagery the engine can't stage (the exodus, the wave, the town's scale). The plates already exist; spectacle the game can't render is precisely what they're for.

**Jane's locked forks (unchanged):** the deep threat is *ancient and indifferent* (waking, not hunting); the vanished are *some saved, some not*; Act 1's spare-vs-kill *branches* Act 2 (the Leviathan allies only if spared).

## Engine reality (verified against source; corrected by the gate)

- No tide or sea-level control — the Gerstner ocean is global. A drained harbour cannot be staged.
- One mermaid, ever (`MermaidSystem`, scripted mode exists). No crowds, no charm prop.
- The submarine's floor is `MAX_DEPTH = −35` (a module constant, not campaign-aware). **The seabed is a single fixed plane at −42, and the underwater tint saturates by ~−14** — any deeper play needs deep-zone rendering (seabed relocation/replacement, fog/light below −42, surface-crossing tests), not a constant change.
- Pickups float at ocean height and complete on planar X/Z distance; they have no carrying state. Towing holds one `WildlifeEntity` and **forces it to the ocean surface** regardless of sub depth. There is no underwater "carry" of any kind.
- No named NPCs, no save-tally, no fleet/convoy AI. `DistressSystem` stages exactly one vessel at a time (starting a scripted rescue clears any other); no sequencing.
- `WeatherSystem` can force a **storm** only — there is no scripted calm/clear override.
- Leviathan phases: `lurking | spectacle | boss`. Boss = surface pursuit with slam damage, registered as a weapons target. No ally behavior, no immunity concept.
- Beat markers: wrong-boat dock routing is specialized to `sonar-contact`; a beat owns one encounter and one prop; `CampaignState`'s loader reconstructs only known fields (new top-level fields need loader migration or they drop on load).
- Beat 8 records `mercy`/`slain` on the save, and the lure ending no longer journals a slaying (commits `afec50b`, `72ae8a4`). Outcome is `spared | slain | unknown` (both flags absent = pre-flag save).

## The re-board, beat by beat

Cost scale: **S** = reuse with a twist · **M** = meaningful extension of an existing system · **L** = genuinely new system. Costs below are the gate-corrected ones.

| # | Beat | Storyboard stages it as | Re-boarded for the engine | Cost |
|---|------|--------------------------|---------------------------|------|
| 9 | The Tide That Stayed | Harbour drained to mudflats | **Simplified per gate:** existing clear weather (no forced calm — cut the weather override), a **stationary** mission-owned derelict found at anchor off the flats (spawnDistressedVessel is speed-0 already; "drifted in" happens in the copy, not the sim), plus a bell-buoy prop (new mesh + slow toll audio on the existing prop pattern). Plate 11 carries the mudflats image. | S–M |
| 10 | Her People Are Leaving | Merfolk exodus streaming past | The one scripted mermaid, her charm dark (copy + audio, no charm prop), plus 2–3 non-interactive silhouettes swimming away — **labelled honestly: new scripted VFX** (geometry, spline motion, disposal), not MermaidSystem reuse. Plate 12 carries the exodus. | S–M |
| 11 | Built for the Pressure | Drydock refit montage | A **composite mission phase — new StoryBeat shape** (`multi-pickup` + return-to-dock): three distinct salvage contacts among the reef wrecks, then dock return commits the refit. Progress survives reload (counts persist in campaign flags). `MAX_DEPTH` becomes injectable/campaign-aware (`deepRefit` → −80). | M |
| 12 | Into the Trench | A mile-deep descent past moored fleets | The trench zone at the coords: refitted depth, a ledge dressed with 6–8 upright sunken-boat props + drifting emissive motes, sonar pings on approach. Completion = sonar-contact shape (radius + depth band). **Depends on the deep-render work (see slice).** | M |
| 13 | The Drowned Choir | Sunken town, the vanished singing, *choose who you carry back* | **The act's one L — a real new encounter system: soul transport.** 3D-contact pickup (not planar), one-soul capacity with an attached/carrying visual on the sub, surface delivery trigger, a two-run state machine with explicit reload semantics, and final resolution by omission. Three **named souls** (the beat-4 survivor's wife among them); the sub carries two back; the third stays. `fates` (below) is the *persistence* for this system, not the system itself. | **L** |
| 14 | An Old Enemy | The Leviathan coils around the sub as a pale glow rises | New non-combat scripted `guardian` phase: circling movement around the player, **weapon-immune and un-targetable, slams and banners suppressed**, explicit completion signal. **Staged surfaced** (the pale glow rises beneath the boat; plate 16 carries the underwater coil) — this dodges submerged-companion pathing entirely. Branch: `mercy` → the guardian comes; `slain` → nobody comes, longer and darker, alone; `unknown` → asked once at act start (Q3). | M–L |
| 15 | The King Tide | A luminous wall of water over Greyharbor | Forced storm + **three sequential scripted rescues** off Greyharbor — a small **rescue-sequence controller** (sequential spawn/cleanup, tow release between, waypoint advancement, rescue count surfaced like lure passes, defined reload behavior). The wave itself lives in interlude plate 17. | M |
| 16 | The Drowned Light | Face the colossal entity at the trench floor | **A presence, not a fight.** Deep glow + slow silhouette (scaled spectacle pattern, deliberately simple visuals) and a song. Finale = *answer the song*: a **new checkpoint-pass state machine** (LureCounter-inspired, not reused): three marked points in order, calm-approach speed tolerance, depth band, re-arming and feedback per pass, restart-on-reload defined. `mercy` → the Leviathan's call joins, **soft ending**; `slain` → passes run under storm, **seal ending**. | M–L |

**Cost totals (gate-corrected): 1 L, 3 M, 2 M–L, 2 S–M — plus the deep-render dependency (M) in the slice. Realistically ~2–2.5× Act 1.** Still well under the camera-first 3–5×, but not the 1.5–2× v1 claimed. Re-estimate after the vertical slice.

## Deep-zone rendering (slice-scoped dependency)

The refit's −80 is unusable without: seabed relocated/replaced by depth zone (the −42 plane must not be visible from below), a tint/fog/light treatment below −42 (the DOM tint saturates by ~−14 — the deep look needs its own curve), and tested surface-crossing + camera clipping. This is **in the vertical slice on purpose**: if the deep zone doesn't feel right, beats 12–13 and 16 don't exist as designed.

## Mission-layer generalizations (shared, small, listed once)

- `requiresBoat: 'Submarine'` on **every** deep beat (12, 13, 16), with the wrong-boat dock routing generalized beyond `sonar-contact` (the Act 1 audit's trap class, prevented by construction).
- Explicit depth bands for all underwater interactions (planar-distance checks caused Act 1's dive-depth stall; never again).
- Dive/surface/deliver feedback moments (the beat-5 "dive deeper" nudge pattern, systematized).

## Fates (persistence shape, per gate)

```ts
type SoulId = 'survivor_wife' | 'soul_lampkeeper' | 'soul_deckhand'; // stable IDs, never display names
type SoulFate = 'saved' | 'kept';
// CampaignState:
fates: Partial<Record<SoulId, SoulFate>>;
```

Loader migration: old saves default to `{}`; unknown keys/values rejected on load. Each delivery **commits immediately** on surfacing (a rescued soul isn't un-rescued by a reload); the final omission commits when the beat completes. Display names live in the beat content, keyed by `SoulId`.

## What Act 2 explicitly does NOT add

No second playable entity fight, no water-level simulation, no crowd AI, no new vessel, no open-ended town interior, no scripted-calm weather system. Anything cut from staging survives in the interlude plates.

## Vertical slice (the proof before the spec)

**Deep-zone render + beats 11 → 12 → 13.** Touches every genuinely new thing: campaign-aware depth, the deep look, trench set-dressing, and the soul-transport system with fates. If the slice feels good, the rest is extension work we already trust.

## Open questions for Jane

1. **Same sub, refitted** (not a new unlock) — good? Matches plate 13's story and dodges a ninth boat.
2. **The fates cruelty dial:** three named souls, room for two. Right weight for the cozy register, or should a perfect play save all three (harder, but no forced loss)?
3. **Pre-flag saves** (`unknown` outcome): ask once at Act 2 start ("Did you spare it?") or default to spared?
4. **The deep zone is real new work** (the gate killed the "seabed still renders" shortcut). Comfortable with it anchoring the slice, or should the slice prove soul-transport at *existing* depth first and go deep second?
5. Beat 16's soft ending stays **locked** behind Act 1 mercy — confirm you want that choice to carry that much weight.
