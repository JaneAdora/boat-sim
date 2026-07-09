# Act 3 "The Turning Tide" — systems-honest re-board (pre-spec) · v2

**Status:** design re-board for Jane's review · not a build commitment · **revised per Codex gate** (`act3-reboard-gate`, verdict: revise — all 8 findings folded in below)
**Inputs:** the storyboard's third act (plates 19–26), the shipped Acts 1–2 (prod as of PR #22), Jane's standing forks (ancient & indifferent; some saved, some not; mercy branches everything).

## The position we start from

Act 3 starts far richer than Act 2 did — the trench profile, five tested pure machines, the guardian and presence props, a choice dialog, and the fates record all exist. But the gate's correction stands: **"reuse" here mostly means *extension of* those tools, not drop-in use.** The pure machines carry over clean; their mission wrappers, the save, the depth model, and the append plumbing all need deliberate Act 3 work. No L-class system remains, and nothing here is an unknown on the order of Act 2's deep zone — but the honest estimate is **~1.5–2× Act 1**, not less. The real work, named: a per-gate band extension to SongAnswer, an explicit keeper save shape with migration, an era'd depth profile that leaves Act 2 untouched, a generalized N-option mid-beat dialog, a listen encounter mode, prop palette/VFX parametrization, and the three-act append mechanics.

## Story spine (per the storyboard, unchanged)

The hero's-journey return. The calm after Act 2 rings false: what was lulled was never truly stilled. One last descent — past everything, to the heart of the deep — reveals the oldest loneliness in the world, and the sea asks its price: **something living must stay**. Then the long rise, and home, changed, at dawn.

## Cross-cutting design (the gate's structural corrections)

**Depth eras, not a retune.** `TrenchProfile` gains an era: `act2` (exactly today's constants — beats 12/13/16 replay and harness-jump identically forever) and `act3` (core floor −105, deepened bands, its own fog curve). The era is set by MissionSystem when an Act 3 descent beat (≥20) arms and reset on disarm; `floorAt`/`depthT`/band getters read the active era. Underwater's fade thresholds become era-aware at the same time. Backward compatibility is a stated test: an Act-2-beat harness jump after Act 3 ships behaves byte-identically.

**The keeper is a save contract, not an inference.** CampaignState gains:
```ts
savedOrder: SoulId[];            // appended at delivery time (Act 3+ saves)
keeper: { kind: 'leviathan' } | { kind: 'soul'; soulId: SoulId } | { kind: 'sealed' } | null;
```
with loader sanitizers (invalid → null / []). For act2complete saves that predate `savedOrder`, the offer derives best-effort from `fates` key order, falling back to `survivor_wife` if saved, else any saved soul. **The zero-saved edge (dev/corrupt saves) cannot soft-lock because refusal is always offered** (see beat 22).

**Dialog, generalized.** ChoiceDialog's shell (blocking, key-swallowing) stays; the API becomes an options array (1–3), and MissionSystem gains a dialog dependency for **mid-beat** asks with repeat-show prevention (asked-flag on the armed beat) and completion gated on the committed answer. The act-entry mercy ask migrates to the same API.

**Three-act append.** `ACT3_BEATS`/`ACT3_SHIPPED` mirror Act 2's pattern; the working array becomes Act 1 + `ACT2_SHIPPED` + `ACT3_SHIPPED`; the harness extension becomes Act 1 + full Act 2 + full Act 3; `assert-no-harness` markers carry the unshipped Act 3 beat ids until each stage ships (the Act 2 discipline, verbatim).

## The re-board, beat by beat

Cost scale: **S** = reuse with a twist · **M** = meaningful extension · **L** = new system (none).

| # | Beat | Storyboard stages it as | Re-boarded for the engine | Cost |
|---|------|--------------------------|---------------------------|------|
| 17 | The False Calm | Restored harbour, wrong stillness, a woman humming at the pier | Investigate beat at Greyharbor: the bell buoy back on the flats, **silent** (the missing toll is the wrongness); at the pier's end a figure prop humming a thread of the song. **Fates-aware casting:** the figure is the first-saved soul (keeper contract above). Completion = visit both. | S–M |
| 18 | The Cracked Charm | The mermaid's last warning | Scripted mermaid reuse (night, east); the charm cracks in the copy; she names the way down. | S |
| 19 | All Hands | The whole fleet puts to sea | **A procession, not a fleet AI:** 2–3 mission-owned escort hulls on follow-splines, merfolk silhouettes returning (a new vertical/reversed variant of the exodus effect — labeled honestly: new VFX on the old pattern), and — mercy — the guardian surfacing alongside. Plate 21 carries the armada. Completion = reach the trench approach with the procession. | M |
| 20 | Into the Maelstrom | The sea spirals into the bedrock | **Descent gates: a SongAnswer extension** (per-point depth band on each gate — today the machine holds one band for the whole arc), three gates at successively deeper bands under the act3 era, plus a slow-rotating mote-ring prop selling the spiral. No fluid sim; the plates carry the vortex. | M |
| 21 | The Heart of the Deep | A drowned sun, warm gold | The presence prop **parametrized for palette** (today's colors are hard-coded) at the act3 floor, larger; a new **`listen` encounter mode** wrapping the pure HoldTimer (~30s, submerged, no threat, no branch side effects — beat 14's wrapper is guardian-specific and stays untouched). The cold-to-warm turn is the whole beat. | M |
| 22 | What the Sea Asks | Someone must stay | **The act's heart, on the generalized dialog.** Mid-beat, blocking, asked once: the sea wants a companion. Options by save: the **Leviathan** (mercy only — its final payoff), the **first-saved soul** who volunteers, and always — **refusal**: seal it again and live with the colder ending. Slain saves see two options (soul, seal); the Act 1 kill costs exactly the gentle answer. The choice writes `keeper` and reshapes beats 23–24's copy and visuals. | M |
| 23 | Slack Water | Freed souls rise like sparks | The rise: upward soul-mote streams (new vertical variant, shared with beat 19's work), the mote-ring slowing to still, unforced weather; completion = surface. | S–M |
| 24 | Homecoming | Dawn, the fleet comes home | Sail home; arrival completes the campaign. The epilogue names everything: the saved, the kept, the keeper (or the seal), the mercy. `campaignComplete`; final journal entry `the-turning-tide`; quest log closes for good. | S |

## What Act 3 explicitly does NOT add

No fleet AI, no fluid/vortex simulation, no new vessel, no new pure machines, no Act 4 hooks beyond the epilogue's last line.

## Vertical slice

**Beats 20 → 21 → 22** — unchanged (the gate concurred): the descent gates, the warm heart, and the ask carry all the act's implementation risk (the era'd profile, the SongAnswer extension, the dialog generalization, the keeper save shape). One draft, feel-check, then the rest.

## Open questions for Jane

1. **The ask (beat 22):** explicit dialog, with **refusal always present** (three options on mercy saves, two on slain)? Refusal doubles as the zero-edge safety net and gives the act a third ending — recommended.
2. **The slain path** never gets the Leviathan's offer — the heaviest consequence yet for the Act 1 kill. Right weight?
3. **Sealed ending tone:** refusal shouldn't read as "wrong," just colder — the quiet has a shape. Sign off on three endings (companion-kept, soul-kept, sealed)?
4. **Depth era −105:** deep enough to feel like "below everything"; Act 2 beats stay byte-identical under the era model. Sign off?
5. **After the credits:** campaign complete — New Game exists; is Free Roam already the "keep sailing" answer, or should Story Mode offer a story-world free-sail?
