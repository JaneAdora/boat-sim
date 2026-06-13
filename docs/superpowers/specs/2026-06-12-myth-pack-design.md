# Myth Pack — Design

*2026-06-11 · Pack B of the approved batch: the game's soul layer. Mystery content
that is witnessed, hunted, and retold — built on the deterministic world.*

## 1. Treasure maps + bottled messages

**Bottles.** Every 2–4 minutes a corked bottle spawns 100–250 m away in open water,
bobbing with a faint sparkle so night sailing can spot it. Sail within 8 m to collect.
Despawns after ~5 minutes if ignored. Contents: a **treasure map** (60%, only if you
don't already hold one) or a **story** — flavor text signed by a name from the island
prefix pool, pointing at a real nearby island by name and coordinates. Lore, free.

**Maps are navigation puzzles, not waypoints.** A map names no island and draws no
marker. It renders the *actual coastline silhouette* of a real island (extracted from
its heightmap, the same data the terrain mesh uses) on a parchment chart with an ✕.
You find it by recognizing the shape — against the minimap, or the horizon.
**V** toggles the chart overlay.

- Target selection: a deterministic sweep of chunk space 3–7 chunks out from the
  collection point picks the first island chunk (hash-ordered). Same bottle spot →
  same island for every player.
- The ✕: a beach/offshore point at hashed angle, `radius × 0.7` from island center.
- The dig: hold position within 14 m of the ✕ → chest surfaces: **+120–200 cr**
  (hash-scaled), journal *"Dug up buried treasure"*, map consumed.
- Persistence: `tb-treasure` stores the active map (island chunk + ✕); reload keeps
  the hunt. One map at a time.

## 2. The Leviathan

Two states, spectacle before threat:

**Witnessed (once, persisted `tb-leviathan`).** In a storm (rain > 0.7) over deep
water (no island within ~350 m), a doomed cargo ship appears ~160 m off the bow.
Five dark tentacles rise around it, it lists, and goes down in ~12 s. Banner:
*"🐙 Something massive moves beneath the storm…"* Journal: *"Watched the Leviathan
take a ship"*. The leviathan does not attack you — this encounter is theater.

**The hunt (repeatable).** After witnessing, storms over deep water may surface the
leviathan itself near the player (~1/3 chance per storm). It is a `WildlifeEntity`
with **5 tentacle strike zones** (the battleship mechanism, generalized): torpedo
each tentacle to sever it. It drifts toward you slowly; every ~7 s within 60 m a
tentacle slam hits the hull — **1 hp through the existing damage/repair system**
(magical mode: splash + knockback only). Sever all five: it sinks in foam,
**+15 karma** (it preys on innocents — slaying it is heroism, consistent with the
karma spec), **+200 cr bounty**, journal *"Slew the Leviathan"*. Fleeing beyond the
wildlife cull radius or the storm ending makes it submerge; it returns another storm.

Engineering: `findNearestVesselOrZone` learns type `leviathan`; the WeaponsSystem
strike-zone branch keys on `entity.strikeZones` instead of `type === 'battleship'`;
`ReturnFireSystem.applyExternalDamage()` exposes the hull to non-shell damage.

## 3. The Mermaid of the Arches

**Found by ear.** On clear, calm nights (rain < 0.15, sun below horizon) — and only
while **karma ≥ 0** — she may surface and sing. Her song is synthesized (A-minor
pentatonic, slow vibrato, long release) and **stereo-panned by her bearing relative
to your heading**, gain rising as you close from ~280 m. No waypoint, no marker: you
steer by your ears. One hint banner when she first sings.

- Placement: prefers a loaded sea arch (80% per eligible night, spawned ~25 m from
  the arch); otherwise a rare (25%) open-water surfacing 220–300 m out. At most one
  encounter per night; sunrise ends the attempt.
- Reaching her (within 15 m) grants the night's gift, then she dives and the song
  fades. Three gifts across three nights (`tb-mermaid` 0→3):
  1. **A pearl trove** — +120 cr, journal *"Heard the mermaid's song"*.
  2. **Her melody** — a recurring signature phrase joins the generative soundtrack
     permanently (`GenerativeMusic.enableMermaidMotif()`, re-enabled on load).
  3. **Her blessing** — dolphins forever bias their wander toward your wake
     (passive; `WildlifeSystem.dolphinAffinity`).
- Below karma 0 she never appears — the sea keeps her from outlaws. (Karma redemption
  is always open: rescues climb back to 0.)

## Keys & persistence

New key: **V** — view treasure chart (controls card updated).
New localStorage: `tb-treasure` (active map), `tb-leviathan` (`seen`), `tb-mermaid` (0–3).
Journal grows 15 → **19**: treasure, leviathan, leviathan-slain, mermaid.

## Testing

Vitest: deterministic map target + ✕ for fixed chunks; coastline extraction from a
synthetic circular heightmap (non-empty, in-bounds); mermaid progress persistence and
gating; leviathan witnessed-flag round-trip; journal total 19. Browser (engine-stepped,
event-dispatched keys per the verification pattern): collect bottle → chart renders →
dig pays; spectacle plays clean; boss takes 5 zone hits and dies with rewards; tentacle
slam costs 1 hp; mermaid song pans correctly (sample pan node left/right), approach
pays gift 1, karma < 0 suppresses spawn.
