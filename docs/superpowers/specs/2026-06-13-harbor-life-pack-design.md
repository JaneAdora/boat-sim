# Harbor Life Pack — Design

*2026-06-13 · Pack C of the approved batch: deepening the soothing half. A zen verb
(fishing) and a sense of place (harbor towns), tied together by the dock.*

## 1. Fishing

The missing calm verb. Stop the boat, cast a line, and read the water.

**Cast (key C).** Allowed when nearly stopped (horizontal speed < 2.5 m/s) over open
water (no terrain beneath). A bobber drops ~6 m ahead and rides the real Gerstner
surface via `ocean.getWaveHeight`. State → *waiting*; a bite timer is rolled
(3–11 s, shorter in richer conditions). C again while waiting reels in (cancel).

**Bite.** Timer elapses → the bobber dips, banner *"Fish on! Press C to set the
hook"*, a ~1.8 s window. Hit it → the fight. Miss it → the fish slips off, back to
idle.

**The fight — a tension minigame.** Two values in [0, 1]: `catch` (progress) and
`tension` (line stress). Each C tap reels: `catch += species.reel`,
`tension += species.pull − rodRelief`. Every frame `tension` bleeds off (slack when
you pause) and `catch` slips back slightly (the fish fights). **Land** when catch
reaches 1; **snap** (fish lost) if tension reaches 1 first. The skill is rhythm: tap
to gain, pause to let the line breathe. Big fish pull harder and need more catch —
the Angler's Rod (below) is what makes them landable. Fully deterministic from the
tap sequence, so unit-tested directly.

**Species by condition.** A weighted table keyed on **biome** (nearest island's, or
*open* water), **time** (day/night from sun elevation), and **weather** (calm/storm
from rain). A pure `pickSpecies(ctx, rand)` filters eligible species and weights by
rarity. Highlights: storm-only **Thunder Marlin** (the trophy — huge pull, big
payout), night-only **Moonfish**, calm-night **Lanternfish**, tropical-day
**Mahi-mahi**, rocky **Sea Bass**, plus common Mackerel/Cod everywhere. Conditions
become content: weather and time are now reasons to fish *here, now*.

**Reward + ledger.** Landing banks the fish's value immediately (accessible — no
inventory to lose) and records it in the **fish ledger** (`tb-fishing`): species seen
+ best weight each. First catch ever → journal *"Cast a line and waited"*. First of a
species → a toast. Selector stats line gains *"fish ledger N/<total>"*.

**Angler's Rod.** One global upgrade (`tb-fishing.rod`), bought at a harbor town for
~200 cr: `rodRelief` shaves tension-per-tap by ~0.05, turning marlin-snapping fights
winnable. The rod is the thread that pulls you toward the towns.

## 2. Harbor towns

Discovered islands grow a working waterfront — the game's first sense of *place*.

**Deterministic docks.** Islands with radius > 55 where `chunkHash(cx,cz,21) < 0.5`
get a **dock** (planks + pilings) at a hashed shore angle, plus a cabin or two with
warm lit windows at night. Built on chunk load like the existing landmarks (same
placement/dispose pattern in `ChunkManager`); the *town services* only wake when the
island is **discovered** (reusing `DiscoveryTracker`) — sail over, discover it, the
harbor comes alive.

**The dockmaster.** Each town has a named keeper, deterministic from the chunk:
`${FIRST_NAMES[hash]} of ${islandName}` — everyone meets the same *Maren of Pearl
Shoals*. A pure `dockmasterName(cx, cz)` over a 16-name pool.

**The notice board (dock button).** Within ~45 m of a town's dock and nearly stopped,
a **⚓ Dock** button appears (HUD, click/tap — same UX as the tow/shipyard buttons;
plus a desktop key). Opening it shows a panel:
- The dockmaster's greeting.
- **Catch log** — species landed N/total, best weights.
- **Buy Angler's Rod** (200 cr) when unowned.
- A **tavern rumor**: a deterministic hint at distant content — a far island's name and
  rough compass bearing, or a nudge ("they say a song drifts off the southern
  arches on calm nights"). Points the free-roam somewhere.

*Scope note: full mission-aggregation (routing contracts/races/bounties through the
board) is deferred. v1 towns deliver place, the rod, the catch log, and rumors — the
"harbor life" feel — without reworking how missions spawn.*

## Keys & persistence

New: **C** (cast/reel). Dock via on-screen button + a desktop key (chosen free at
build). New localStorage: `tb-fishing` (`{ caught: {species: bestWeight}, rod: bool }`).
Journal grows 19 → **20** (`fishing`). Controls card updated.

## Testing

**Playwright availability is intermittent this session**, and the fishing *feel* (cast
arc, tension rhythm, the towns at dusk) is a human judgment regardless — so the trust
here is unit tests over pure logic plus a build, with the interactive playtest flagged
for Jane on `npm run dev`:

- Vitest: fight simulation (a tap schedule lands a common fish; a marlin snaps the bare
  rod but lands with the Angler's Rod); `pickSpecies` determinism + condition filtering
  (storm surfaces the marlin; day never yields Moonfish); ledger persistence + best-weight
  update + corrupt-storage tolerance; harbor placement determinism; `dockmasterName` and
  rumor determinism; journal total 20.
- Build: `npm run build` clean, full `vitest` green.
- If Playwright is up at the end: one lean pass confirming cast→bite→land banks credits
  and the dock button opens a working board — mechanics only, not feel.
