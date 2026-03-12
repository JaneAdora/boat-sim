# Architecture Guide

This document explains how the boat simulator is built. Read this before making changes.

## Overview

Browser-based 3D boat simulator. **Three.js + TypeScript + Vite**. No frameworks — vanilla DOM for UI, Web Audio API for sound synthesis. Single-page app with one HTML file and modular TypeScript source.

## Tech Stack

- **Three.js** (0.183) — 3D rendering, scene graph, materials, shaders
- **TypeScript** — strict mode, no `any` in public APIs
- **Vite** — dev server, HMR, production bundling
- **simplex-noise** — procedural generation (terrain, weather, wind)
- **vite-plugin-glsl** — imports `.glsl` files as strings
- **Web Audio API** — all sounds are synthesized (no audio files)

## Directory Structure

```
src/
├── main.ts                  # Entry point, boat selector UI, ESC menu, game lifecycle
├── Engine.ts                # Orchestrator — creates world, systems, wiring
│
├── ecs/                     # Entity-Component-System core (~60 lines total)
│   ├── World.ts             # Entity storage, component maps, system runner
│   └── System.ts            # Abstract base class (priority + update)
│
├── core/                    # Framework utilities
│   ├── GameLoop.ts          # requestAnimationFrame loop with pause/resume
│   ├── InputManager.ts      # Keyboard/mouse state tracking
│   └── EventBus.ts          # Pub/sub event system
│
├── components/              # Data-only component types
│   ├── Transform.ts         # Position, rotation, quaternion
│   ├── RigidBody.ts         # Velocity, angular velocity, mass
│   ├── BoatControl.ts       # Throttle, rudder, engine power
│   ├── Buoyancy.ts          # Hull sample points, submerged state
│   ├── MeshRenderable.ts    # Three.js Object3D reference
│   └── WindReceiver.ts      # Sail area, wind force coefficient
│
├── systems/                 # ECS systems (run each frame in priority order)
│   ├── BoatControlSystem.ts # Reads input → updates BoatControl
│   ├── WindSystem.ts        # Global wind direction/strength (noise-driven)
│   ├── BuoyancySystem.ts    # Samples wave height → applies buoyancy forces
│   ├── PhysicsSystem.ts     # Integrates velocity, applies drag, ground collision
│   ├── SailAnimationSystem.ts # Rotates sail mesh to match wind
│   ├── DayNightSystem.ts    # Sun position, sky color, star/light intensity
│   ├── CameraSystem.ts      # Third-person follow cam with orbit controls
│   ├── RenderSystem.ts      # Syncs Transform → Object3D each frame
│   ├── WildlifeSystem.ts    # Spawns/updates dolphins, whales, NPC vessels, battleships
│   ├── WeaponsSystem.ts     # Torpedoes, missiles, hit detection, explosions
│   ├── TowingSystem.ts      # Tugboat tow rope mechanics
│   └── SeagullSystem.ts     # Ambient seagulls near islands
│
├── boats/                   # Boat type definitions and mesh generation
│   ├── BoatDefinition.ts    # Interface: mass, hull points, engine/sail params
│   ├── BoatFactory.ts       # Procedural mesh builder, entity spawner
│   ├── Tugboat.ts           # Tugboat definition
│   ├── Speedboat.ts         # Speedboat definition
│   ├── CruiseShip.ts        # Cruise ship definition
│   ├── VikingShip.ts        # Viking ship definition
│   └── Sailboat.ts          # Sailboat definition (exists but removed from selector)
│
├── rendering/               # Visual systems (not ECS systems — called from Engine.update)
│   ├── SceneManager.ts      # Scene, camera, renderer setup
│   ├── Ocean.ts             # Ocean mesh, Gerstner wave shader, getWaveHeight()
│   ├── Sky.ts               # Preetham sky shader wrapper
│   ├── Stars.ts             # Night sky star field
│   ├── Moon.ts              # Moon disc opposite the sun
│   ├── WeatherSystem.ts     # Rain/storm state machine, GPU rain particles, lightning
│   ├── Clouds.ts            # Cloud layer (if enabled)
│   ├── PostProcessing.ts    # UnrealBloomPass for sun reflections
│   ├── WakeTrail.ts         # Boat wake geometry
│   ├── BowSpray.ts          # Speed-dependent bow spray particles
│   ├── Bioluminescence.ts   # Night-time glowing water particles
│   ├── BoatLights.ts        # Navigation lights (red/green/white/cabin)
│   ├── ExplosionEffect.ts   # GPU instanced particle explosion (pool of 2000)
│   ├── ConfettiEffect.ts    # Rainbow confetti burst (magical mode)
│   ├── UnicornEffect.ts     # Procedural unicorn fly-away (magical mode)
│   ├── RainbowTorpedoWake.ts # HSL gradient ribbon wake (magical mode)
│   ├── RainbowMissileTrail.ts # Per-vertex rainbow line trail (magical mode)
│   ├── ProjectileMesh.ts    # Torpedo/missile 3D meshes
│   └── TorpedoWake.ts       # Torpedo trail particles
│
├── world/                   # Procedural world generation
│   ├── WorldSeed.ts         # Constants: CHUNK_SIZE (300), CHUNK_LOAD_RADIUS
│   ├── ChunkManager.ts      # Loads/unloads chunks, manages islands, buoys, lighthouses
│   ├── IslandGenerator.ts   # Noise-based island placement, heightmap, biome selection
│   └── TerrainGenerator.ts  # Island meshes, trees, rocks, lighthouse construction
│
├── audio/                   # Sound synthesis (all Web Audio API, no files)
│   ├── AmbientSoundscape.ts # Ocean, wind, rain, engine sounds (per-boat type)
│   ├── SoundEffects.ts      # One-shot weapons: torpedo launch, missile launch, explosion
│   └── AudioManager.ts      # (Legacy/unused wrapper)
│
├── ui/                      # HTML/CSS overlay UI
│   ├── HUD.ts               # Speed, wind, throttle, kill count gauges
│   ├── Minimap.ts           # Circular radar-style minimap with compass
│   └── TouchControls.ts     # Mobile virtual joystick and buttons
│
├── state/                   # Game state
│   ├── KillTracker.ts       # Tracks boats and lighthouses destroyed
│   └── GameConfig.ts        # GameMode type and config interface
│
├── shaders/                 # GLSL shaders
│   ├── ocean.vert.glsl      # Gerstner wave vertex displacement
│   ├── ocean.frag.glsl      # Water color, foam, SSS, sparkle
│   └── glsl.d.ts            # TypeScript declaration for .glsl imports
│
└── utils/                   # Shared utilities
    ├── math.ts              # Math helpers (lerp, clamp, etc.)
    └── noise.ts             # Simplex noise wrapper
```

## ECS Architecture

Lightweight custom ECS. No archetype storage or bitsets — simple `Map<string, Map<EntityId, T>>` for components.

**Entities** are integer IDs. **Components** are plain data objects stored by name. **Systems** are classes with a `priority` number and an `update(world, dt)` method. Systems run in priority order each frame.

The player boat is the only ECS entity. Wildlife, weapons, and visual effects are managed by their own systems outside ECS (they use Three.js scene graph directly).

## Game Loop Flow

```
main.ts: startGame(def)
  → new Engine(def)
    → creates World, InputManager, SceneManager
    → creates all rendering objects (ocean, sky, stars, moon, weather, etc.)
    → creates all ECS systems in priority order
    → spawns player boat entity
    → creates non-ECS managers (wildlife, weapons, towing, seagulls)
    → creates UI (HUD, minimap), audio (soundscape, SFX)
    → creates GameLoop with update callback
  → engine.start()
    → hides loading screen
    → GameLoop.start() → requestAnimationFrame loop

Each frame (Engine.update):
  1. world.update(dt)          — runs all ECS systems in priority order
  2. ocean.update()            — moves ocean mesh, advances wave time
  3. weather.update()          — rain/storm state, fog density
  4. chunkManager.update()     — load/unload terrain chunks
  5. chunkManager.updateAnimations() — buoy bobbing, lighthouse beacon
  6. wakeTrail/bowSpray/bioluminescence.update()
  7. weaponsSystem.updateEffects() — torpedo trails, explosions
  8. moon/boatLights.update()
  9. hud.update()              — refresh gauges
  10. minimap.update()         — redraw radar
  11. soundscape.update()      — adjust audio to wind/weather/throttle
  12. postProcessing.render()  — bloom pass → screen
```

## Major Systems

### Ocean & Waves
- **Shader**: `ocean.vert.glsl` displaces vertices using 4 Gerstner wave components
- **CPU mirror**: `Ocean.getWaveHeight(x, z)` replicates the same wave math for physics
- **Visuals**: Foam at crests, subsurface scattering (SSS) based on view angle, sparkle from sun direction

### Boat Physics
- Multi-point buoyancy: 7-9 hull sample points per boat, each independently checks wave height
- Forces: buoyancy (per point), engine thrust (forward), wind force (on sail area), rudder torque, drag (forward/lateral/angular)
- Island collision: PhysicsSystem checks ChunkManager terrain height, pushes boat away from land

### World Generation
- **Chunks**: 300x300 world units. Loaded/unloaded based on player distance (CHUNK_LOAD_RADIUS).
- **Islands**: Noise-based probability per chunk. Each island gets a heightmap, biome (tropical/rocky/autumn/desert), trees, rocks, optional lighthouse, navigation buoys.
- **Biomes** determine tree types, colors, and terrain materials.

### Day/Night Cycle
- Uses Three.js Sky shader (Preetham model) driven by sun elevation angle
- Non-linear speed: daytime runs 3x slower than nighttime, with smoothstep transition at horizon
- Affects: sky color, ambient light, fog color, star visibility, moon brightness, navigation lights, lighthouse beacons, bioluminescence

### Weather
- Noise-driven state machine: clear → overcast → rain → storm
- Rain: GPU instanced particles following camera
- Lightning: random flashes during storms, affects fog/ambient color
- Fog density increases with overcast/storm

### Combat (WeaponsSystem)
- **Torpedoes**: Launched forward from boat. Home toward nearest NPC vessel (or nearest unhit battleship strike zone). Turn-rate limited for realistic arcs. Trigger explosion on contact. Destroyed on island collision.
- **Missiles**: Cubic bezier arc toward nearest island. If island has a lighthouse, explosion centers on the lighthouse and destroys it. Otherwise hits island center.
- **Minimap heading**: Computed via `atan2(fwd.x, fwd.z)` from the boat's forward vector (immune to pitch/roll from waves). Euler decomposition of `rotation.y` is unreliable due to gimbal contamination from wave motion.
- **Battleships**: 3 strike zones (front/mid/rear). Each must be hit by a separate torpedo. Zones auto-targeted by proximity. Sinks with multi-explosion cascade after all 3 hit.
- **Explosions**: GPU instanced particles (pool of 2000). Scaling based on missile vs torpedo.

### Wildlife (WildlifeSystem)
- Spawns dolphins, whales, fishing boats, cargo ships, battleships around the player
- Each has spawn limits, speed ranges, max age, and behavior patterns
- Vessels can be targeted by torpedoes and towed by the tugboat
- NPC vessels avoid islands (terrain height check, reverse + random turn)
- Battleships are larger than cruise ships, spawn rarely, require 3 hits to destroy

### Audio
- All sounds are synthesized via Web Audio API (no audio files)
- **Engine sounds** vary by boat type: diesel (tugboat/cruise), high-RPM triangle wave (speedboat), bandpass wind noise (viking)
- **Ambient**: ocean noise, wind (volume tracks wind strength), rain (during storms)
- **Weapons**: torpedo launch (sine thump + hiss), missile launch (sawtooth sweep + roar), explosion (boom + crackle + sub-bass)
- **Magical mode chime**: major chord (C6+E6+G6) with staggered attack + high sparkle oscillator + white noise shimmer

### Game Mode System (GameConfig)

The game supports two modes: **Classic** ("Boatface Killah") and **Magical Mode**. The mode is selected via a pill toggle on the boat selector screen.

- **State**: `GameMode` type (`'classic' | 'magical'`) and `GameConfig` interface in `src/state/GameConfig.ts`
- **Flow**: `main.ts` holds `selectedMode`, passes to `Engine(boatDef, config)`, which forwards to `WeaponsSystem` and `HUD`
- **Classic mode**: All original behavior — fire explosions, gray trails, "T"/"M" buttons, "Kills" label
- **Magical mode**: All combat visuals are transformed:
  - Projectile meshes hidden (`mesh.visible = false`), only wakes/trails visible
  - `RainbowTorpedoWake` (`src/rendering/RainbowTorpedoWake.ts`) — HSL gradient ribbon with `uTime` cycling
  - `RainbowMissileTrail` (`src/rendering/RainbowMissileTrail.ts`) — per-vertex rainbow line, 500-point buffer
  - `ConfettiEffect` (`src/rendering/ConfettiEffect.ts`) — 800-particle rainbow burst replacing fire explosions
  - `UnicornEffect` (`src/rendering/UnicornEffect.ts`) — procedural unicorn mesh flies upward on entity destruction
  - Rainbow wakes/trails persist 10s after impact via freeze/orphan lifecycle pattern
  - Happy chime sound replaces explosion boom
  - Weapon buttons show emoji (star/rainbow), HUD kill label shows unicorn emoji

### PWA

The app is installable as a Progressive Web App. No plugins — fully manual implementation.

- **Manifest**: `public/manifest.json` — fullscreen display, any orientation, navy theme
- **Service worker**: `public/sw.js` — cache-first for hashed Vite bundles (`/assets/*`), network-first for HTML, stale-while-revalidate for fonts/icons. Bump `CACHE_NAME` when deploying breaking changes.
- **Icons**: `public/icon.svg` (lifesaver on navy bg), `public/icon-192.png`, `public/icon-512.png`
- **Install prompt**: Captured via `beforeinstallprompt` in `main.ts`. Shows "Install App" button on loading screen. Dismissable via X (persists in `localStorage`).
- **Apple support**: `apple-mobile-web-app-capable`, `apple-touch-icon` meta tags in `index.html`
- **Netlify**: `sw.js` served with `Cache-Control: no-cache` header (configured in `netlify.toml`)

## Extension Guides

### Adding a New Boat
1. Create `src/boats/MyBoat.ts` exporting a `BoatDefinition`
2. Add a `meshType` case in `BoatFactory.ts` → `createBoatMesh()`
3. Add the boat to the `BOATS` array in `main.ts` (with SVG icon)
4. Add engine sound type in `AmbientSoundscape.ts` if needed
5. Add nav light positioning in `BoatLights.ts`

### Adding a New NPC Vessel Type
1. In `WildlifeSystem.ts`: add mesh creator, spawn entry in candidates, update behavior in `updateEntities()`
2. Add color entry in `Minimap.ts` → `WILDLIFE_COLORS`
3. If targetable: add collision check in `WildlifeSystem` and hit handling in `WeaponsSystem`

### Adding a New Biome
1. In `IslandGenerator.ts`: add to `Biome` type, add selection logic in `generateIsland()`
2. In `TerrainGenerator.ts`: add terrain material and tree type for the biome
3. In `Minimap.ts`: add color to `BIOME_COLORS`

### Adding a New Weapon
1. Add projectile data structure and fire/update methods in `WeaponsSystem.ts`
2. Create mesh in `rendering/ProjectileMesh.ts`
3. Add sound in `SoundEffects.ts`
4. Wire fire key in `Engine.ts` keyboard handler or `BoatControlSystem.ts`
