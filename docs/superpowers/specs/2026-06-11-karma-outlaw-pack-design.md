# Karma + Outlaw Pack — Design

*2026-06-11 · covers the karma system and Pack A (Outlaw) in detail, plus the roadmap
for Packs B–D approved in the same batch.*

## Karma

A single persistent moral ledger. **Heat** (below) is the short-term police response;
**karma** is the permanent record. Stealing cargo costs karma forever *and* raises heat
for a while.

- Integer, clamped **[−100, +100]**, starts at 0. `localStorage: tb-karma`.
- Every change shows a toast: `⚖️ Karma −10 — cargo stolen` / `⚖️ Karma +20 — whale freed`.
- Neutral by default: contracts, races, discovery, journal, and **fighting battleships**
  (they shoot back — combat, not murder) award nothing, per Jane's spec.

### Events

| Event | Karma | Notes |
|---|---|---|
| Rescue a burning vessel (existing distress) | **+15** | on top of its 60 cr — salvage law pays, kindness counts |
| Free an entangled whale (new) | **+20** | no credits — wildlife is pure karma |
| Destroy a whale or dolphin | **−25** | heaviest stain |
| Destroy a fishing boat or cargo ship | **−15** | innocent vessels |
| Topple a lighthouse | **−20** | shameful journal entry |
| Commandeer a vessel | **−10** | theft; re-boarding your own boat is free |
| Steal a cargo container | **−10** | also +1 heat star |
| Battleships, seagull near-misses, everything else | 0 | neutral |

### Titles (selector + pause card)

| Range | Title |
|---|---|
| −100 … −60 | Terror of the Tides |
| −59 … −25 | Outlaw |
| −24 … +24 | Drifter |
| +25 … +59 | Good Samaritan |
| +60 … +100 | Guardian of the Sea |

### What karma *does* (design call — flag to Jane)

Jane specified the ledger, not the consequences. Chosen effects, all gentle:

- **Shipyard pricing**: Guardian −10%, Good Samaritan −5%, Outlaw +15%, Terror +30%.
  Dockmasters gossip.
- **Civilian fear** (≤ −25): fishing boats steer away when you come within ~120 m.
- **Naval vigilance** (≤ −60): battleship engage range 260 → 320 m.
- **Dolphin affinity** (≥ +25): pods bias their wander toward your wake.
- **Trusted rescuer** (≥ +60): distress rewards ×1.5.
- **Myth gate** (Pack B): the mermaid only appears at karma ≥ 0.

## Outlaw Pack features

### 1. Lighthouses *(amended during build)*
The game already had deterministic lighthouses (~35% of islands, placed at the
highest point, beacon lit at night) and missiles already destroyed them — what was
missing was the moral weight. This pack adds it: destroying one is −20 karma plus the
shameful journal entry "Darkened a beacon". Destruction is not persisted (rebuilt next
session); the karma is what's permanent.

### 2. Whale rescue
Distress spawns now alternate vessel-fire / entangled-whale. A surfaced whale wrapped
in a ghost net; hold position within ~22 m under 2.5 m/s for ~4 s to cut it free
(progress in the banner). It dives, breaches in thanks. +20 karma, journal entry.
Killing sealife/innocents is wired to −karma in the same commit (WeaponsSystem hook).

### 3. Commandeer any vessel
**E** within ~16 m of a fishing boat, cargo ship, or battleship swaps your hull: new
`BoatDefinition`s — fishing boat 14 kn / nimble / 2 pips, cargo ship 16 kn / 140 m
turn radius / 5 pips / a wallowing beast, battleship 26 kn / 110 m / 6 pips. Your old
boat anchors in place, bobbing on the waves, re-boardable with E (free). Each theft
−10 karma. Captaining a stolen *military* vessel makes other battleships hostile at
extended range. Weapons (Space) work from any hull. *v1 limitation: commandeered state
and the abandoned boat are session-only — reload returns you to your selected boat.*

### 4. Cargo heists + heat stars *(key amended: F, not T/G)*
**F** alongside a cargo ship (T fires torpedoes and G is the tow hook, both taken)
splashes a container overboard and auto-hooks it to the tow line — hot cargo. −10
karma, **+1 heat star (☠, max 3)** shown by the hull pips. 1★ nearest battleship
vectors toward you · 2★ engage range ×1.4 · 3★ a hunter destroyer spawns at 300 m
(inside the wildlife cull radius — learned the hard way) and pursues at speed 7.
Fence at a discovered harbor ≥ 600 m from the theft → 60–150 cr scaled by distance.
One container per ship; heat decays 1★/75 s while the line is clean.

### 5. Jet ski
Fifth playable. **44 kn — the viking (46 kn) stays the fastest, per Jane.** Turn
radius 10 m (holds below ~8 m/s; above that it rides the 0.8 rad/s physics yaw clamp,
which still out-carves the entire fleet — ~28 m at top speed), rudderSlew 4.0, 1 hull
pip, mass 250. Airborne when the hull clears the wave face > 0.45 s; landing banks
style = hangtime + spin degrees → 1–25 cr per trick. Storm swells become a skate
park. Selector + shipyard integration (engine tune, hull → 2 pips, winch — yes, a jet
ski can tow a barge; it's hilarious and allowed).

## Roadmap (separate PRs, in order)

- **Pack B — Myth**: mermaid questline (found *by ear* via stereo panning, 3 nights,
  gifts incl. a permanent soundtrack motif; karma ≥ 0 gate) · leviathan (deep-water
  storm boss, witnessed spectacle first, strike-zone fight) · treasure maps (coastline
  silhouettes of real islands — navigate by recognition; bottled messages).
- **Pack C — Harbor Life**: fishing (bobber on real waves, tension reel, conditional
  species, ledger) · harbor towns (named dockmasters via chunkHash, notice-board
  mission hub, tavern rumors pointing at distant content).
- **Pack D — Air & Deep**: NPC aircraft first (rescue helicopter that races you to
  maydays; cargo seaplane drops) → playable seaplane (endgame purchase) · submarine /
  dive bell + wreck diving (underwater render pass, sonar pings).

## Testing

Vitest: karma clamp/persistence/corruption, title thresholds, shipyard price modifier,
heat decay rules, jet-ski definition invariants (viking still fastest). Browser: each
feature driven end-to-end via Playwright before its commit, 0 console errors.
