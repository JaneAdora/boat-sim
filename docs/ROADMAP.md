# Roadmap

Feature tracking for the boat simulator. See [ARCHITECTURE.md](ARCHITECTURE.md) for system details.

## Current Features (Implemented)

### Core
- [x] Three.js + TypeScript + Vite project setup
- [x] Custom lightweight ECS (World, System, Components)
- [x] requestAnimationFrame game loop with pause/resume
- [x] Keyboard + mouse input manager
- [x] Mobile touch controls (virtual joystick, buttons)

### Boats
- [x] Tugboat — steady, diesel engine
- [x] Speedboat — fast, high-RPM engine sound
- [x] Cruise Ship — large, slow-turning
- [x] Viking Ship — wind-powered, gust ambient sound (fastest in fleet — the sleeper)
- [x] Jet Ski — tiny, agile, airtime trick scoring
- [x] Hovercraft — amphibious: rides a cushion over shallows and up onto island beaches (loose, floaty handling, 40 kn)
- [x] Boat selector screen with SVG icons + "Calm seas" / "No weapons" comfort toggles

### Physics
- [x] Multi-point buoyancy sampling (7-9 hull points per boat)
- [x] Engine thrust + rudder steering
- [x] Wind force on sail area
- [x] Forward/lateral/angular drag
- [x] Island ground collision (push away from terrain; amphibious hulls ride over it)

### World
- [x] Infinite chunk-based world (300x300 chunks)
- [x] Procedural island generation (noise-driven placement)
- [x] 4 biomes: tropical, rocky, autumn, desert
- [x] Trees (palms, pines, deciduous) per biome
- [x] Shore rocks
- [x] Lighthouses (destroyable by missiles)
- [x] Navigation buoys (bobbing animation)

### Rendering
- [x] Gerstner wave ocean with CPU mirror for physics
- [x] Foam, subsurface scattering, sparkle on water
- [x] Preetham sky model (day/night cycle)
- [x] Stars at night
- [x] Moon (opposite sun)
- [x] Dynamic weather (rain particles, lightning, fog)
- [x] Wake trail behind boat
- [x] Bow spray at speed
- [x] Bioluminescent particles at night
- [x] Navigation lights (red/green/white/cabin) at night
- [x] Post-processing bloom

### Combat
- [x] Homing torpedoes (seek nearest vessel/strike zone)
- [x] Guided missiles (arc to nearest island)
- [x] GPU particle explosions (2000-particle pool)
- [x] Lighthouse destruction on missile impact
- [x] Kill count tracking (boats + lighthouses)
- [x] Battleship NPC with 3 strike zones

### Wildlife
- [x] Dolphins (swimming, jumping)
- [x] Whales (surfacing)
- [x] Fishing boats
- [x] Cargo ships
- [x] Battleships (rare, 3-hit to sink)
- [x] Seagulls near islands
- [x] Towing system (tugboat can tow vessels)

### Audio
- [x] Synthesized ocean ambience
- [x] Wind sound (strength-driven)
- [x] Rain sound (during storms)
- [x] Per-boat engine sounds (diesel, speedboat whine, viking wind)
- [x] Torpedo launch SFX
- [x] Missile launch SFX
- [x] Explosion SFX
- [x] Mute toggle (X key)

### UI
- [x] HUD: speed, wind direction, throttle, kill count
- [x] Circular minimap with compass, island/NPC vessel dots
- [x] Minimap heading from forward vector (stable in rough seas)
- [x] Controls help overlay (/ key toggle, auto-shows on game start)
- [x] ESC menu (return to boat selector)
- [x] Mobile: HUD toggle, map toggle, escape button
- [x] Day slowed 3x (night unchanged)
- [x] Scrollable boat selector for small viewports
- [x] Playfair Display h1 with red "BLISS" accent
- [x] OG image and favicon (lifesaver ring SVG) for social sharing
- [x] Open Graph + Twitter Card meta tags

### Magical Mode (Family-Friendly)
- [x] Pill toggle on boat selector: "Boatface Killah" (default) vs "Magical Mode"
- [x] GameConfig state threaded from selector through Engine to systems
- [x] Rainbow torpedo wake (HSL gradient ribbon, persists 10s after impact with fade)
- [x] Rainbow missile trail (full-path 500-point coverage, persists 10s)
- [x] Confetti particle burst on impact (800-particle rainbow pool, lighter gravity)
- [x] Unicorn fly-away on destruction (procedural mesh: white body, pink mane, gold horn)
- [x] Happy major-chord chime on impact (synthesized C6-E6-G6 + shimmer)
- [x] Weapon buttons: T/M replaced with star/rainbow emojis
- [x] HUD "Kills" label replaced with unicorn emoji
- [x] Projectile meshes invisible (only rainbow wakes/trails visible)

### NPC Behavior
- [x] NPC vessels avoid islands (terrain collision check + reverse/turn)
- [x] Torpedoes destroyed on island collision (explosion/confetti on impact)

### Shipped in the 2026-06 PR stack (#1–#6)
- [x] Island discovery + persisted names, voyage stats, field journal (15 entries)
- [x] Salvage economy: credits on every loop, shipyard upgrades (engine / hull / winch)
- [x] Handling model: player-facing `maxSpeedKnots` / `turnRadius`, physics derived
- [x] Salvage contracts (barge towing) + buoy time-trials with ghost replays
- [x] Battleship return fire, limp-home hull damage, safe-harbor repair
- [x] Distress calls: burning vessels and entangled whales
- [x] Rare landmarks (wreck graveyards, sea arches) + aurora nights
- [x] Generative ambient soundtrack (mood-reactive pad + pentatonic bells)
- [x] Photo mode + shareable postcards (same seed → real coordinates)
- [x] Karma ledger: titles, toasts, reputation-priced shipyard, naval vigilance
- [x] Commandeer any vessel (B) — own boat stays anchored, stolen hulls rejoin traffic
- [x] Cargo heists (F) + naval heat ☠ 1–3 + hunter destroyer
- [x] Jet ski (5th playable) + airtime trick scoring
- [x] Objective waypoints (minimap + screen-space) for all missions
- [x] Pause/settings hub, audio robustness, localStorage persistence
- [x] CI (GitHub Actions: build + 34 vitest tests)

## Removed Features

### Sailboat
- **Status**: Code exists (`src/boats/Sailboat.ts`) but removed from selector
- **Reason**: Sail physics felt incomplete compared to motorboats. Wind-driven movement needs more work to feel satisfying.
- **Path to restore**: Add back to `BOATS` array in `main.ts`, add SVG icon, test sail force balance

## Approved — queued packs (build next, in this order)

Jane approved these 2026-06-11 alongside the shipped Outlaw pack. Design notes in
`docs/superpowers/specs/2026-06-11-karma-outlaw-pack-design.md`.

### Pack B — Myth ✅ shipped (PR #7, branch `myth-pack`)
Design notes in `docs/superpowers/specs/2026-06-12-myth-pack-design.md`.
- [x] Mermaid questline: found *by ear* via stereo panning on clear calm nights near sea arches; three encounters; gifts are pearls → permanent soundtrack motif → dolphin wake-affinity; karma ≥ 0 only
- [x] Leviathan: deep-water storm boss — witnessed spectacle first (takes an NPC ship down), then a five-tentacle strike-zone fight; +200cr/+15 karma bounty; journal pages
- [x] Treasure maps: hand-drawn coastline silhouettes of real islands (navigate by recognition, V to view) + bottled messages with coordinates and stories

### Pack C — Harbor Life *(shipped)*
Design notes in `docs/superpowers/specs/2026-06-13-harbor-life-pack-design.md`.
- [x] Fishing: cast/bobber on real waves (C), tension reel minigame, species by biome/time/weather, fish ledger
- [x] Angler's Rod upgrade — purchasable at the harbour notice board for 200 cr (wires the existing `buyRod`)
- [x] Harbor towns: hash-gated docks + shore cabins on big islands (radius>55), chunkHash-named dockmasters, notice board (press **L** stopped at a discovered dock) — rod purchase, catch log, deterministic tavern rumors

Also shipped on `harbor-pack`: UI polish — gameplay text de-serifed (serif kept only for the opening title), opening selector decluttered.

### Pack D — Air & Deep *(in progress)*
- [x] NPC aircraft (`src/systems/AircraftSystem.ts`): coastguard **helicopter** scrambles to a nearby active mayday, flies in, hovers with its winch down, and peels off when the call clears (or times out); cargo **seaplane** drifts in, descends into a cove beside an island, drops a **salvage crate** you collect for credits, and climbs out. Spinning rotors/props; both cull at distance. *(No aircraft sound yet — flagged for a follow-up.)*
- [ ] Playable seaplane: endgame shipyard purchase, arcade flight model, water landings reuse buoyancy
- [ ] Submarine / dive bell: descend to the wreck graveyards, sonar pings, underwater render pass

## Pitched 2026-06-11 — awaiting picks

Ten fresh ideas, grouped; effort in parens. Recommended first picks: ghost racing,
pirate NPCs, island homestead.

### Challenge a Friend
- [ ] Ghost-race sharing (M): export a record run as a paste-code; a friend races your ghost on the same course in their identical seeded world — zero backend

### Rivals
- [ ] Pirate NPCs + bounty board (M/L): hostile skiffs harass traffic; defend civilians for karma + bounty; named pirate captains at hash-placed lairs as boss-lite hunts
- [ ] Trading runs (M/L): per-island price spreads with slow drift, cargo capacity per hull, valuable cargo raises pirate ambush odds

### Home
- [ ] Island homestead (L): claim and name an island (overrides procedural name), build dock/cabin/beacon, home-harbor perks (free repairs, boat storage)
- [ ] Cartography (M): full-screen ship's chart with fog-of-war that inks in as you explore; player annotations; exportable as an image like postcards
- [ ] Cozy pack (S): christen your boat — name on hull, postcards, race records — plus a ship's cat on deck

### Calendar
- [ ] Real-calendar seasons + lunar cycle (S/M): winter icebergs and longer auroras, real full-moon nights with strange sightings; deterministic from the system date, no server
- [ ] Tides (M): slow daily sea-level cycle — high-tide-only passages, low-tide sandbars with beachcombing salvage

### Wonder & Lens
- [ ] Ghost ship (S/M): spectral galleon crosses your bow on foggy nights; follow it to a wreck or treasure before it fades at dawn
- [ ] Shutterbug contracts (S/M): a naturalist pays for photos ("a whale surfacing in a storm") — conditions verified at the moment of capture

## Backlog (older ideas, still open)

- [ ] Fuel / resource system
- [ ] Island docking and on-foot exploration
- [ ] Restore sailboat with improved sail physics
- [ ] More biomes (arctic, volcanic)
- [ ] Underwater terrain and coral (partly arrives with Pack D)
- [ ] Reflections (SSR or planar), improved clouds, underwater caustics
- [ ] Spatial audio (3D positioned sounds); horn / bell signals
- [ ] Ambient wildlife sounds (seagull cries, whale calls)
- [ ] Damage indicator on battleship (visual health bar)
- [ ] Performance profiling and optimization pass
- [ ] True realtime multiplayer (WebRTC/WebSocket) — note: ghost-race sharing covers async competition with no server

### PWA (shipped)
- [x] Web app manifest (fullscreen, any orientation, navy theme)
- [x] Service worker with cache-first for hashed assets, network-first for HTML
- [x] App icons: lifesaver ring on navy background (192px, 512px PNG + SVG)
- [x] Install prompt button on boat selector (dismissable, localStorage persist)
- [x] Apple PWA meta tags for iOS home screen support
- [x] Netlify no-cache header for sw.js
