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
- [x] Viking Ship — wind-powered, gust ambient sound
- [x] Boat selector screen with SVG icons

### Physics
- [x] Multi-point buoyancy sampling (7-9 hull points per boat)
- [x] Engine thrust + rudder steering
- [x] Wind force on sail area
- [x] Forward/lateral/angular drag
- [x] Island ground collision (push away from terrain)

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
- [x] Mute toggle (M key)

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

## Removed Features

### Sailboat
- **Status**: Code exists (`src/boats/Sailboat.ts`) but removed from selector
- **Reason**: Sail physics felt incomplete compared to motorboats. Wind-driven movement needs more work to feel satisfying.
- **Path to restore**: Add back to `BOATS` array in `main.ts`, add SVG icon, test sail force balance

## Planned / Desired Features

### Gameplay
- [ ] Fuel / resource system
- [ ] Island docking and exploration
- [ ] Treasure or collectible system
- [ ] Cargo hauling missions
- [ ] Fishing minigame
- [ ] Battleship return fire (NPC shoots back)

### Boats
- [ ] Restore sailboat with improved sail physics
- [ ] Submarine
- [ ] Jet ski
- [ ] Boat upgrades / customization

### World
- [ ] Underwater terrain and coral
- [ ] Ports / harbors / docks
- [ ] Shipwrecks
- [ ] More biomes (arctic, volcanic)
- [ ] Persistent world state (save/load)

### Rendering
- [ ] Underwater camera view
- [ ] Reflections (SSR or planar)
- [ ] Improved cloud system
- [ ] Fire/smoke from damaged vessels
- [ ] Shader-based underwater caustics

### Audio
- [ ] Spatial audio (3D positioned sounds)
- [ ] Music / soundtrack
- [ ] Ambient wildlife sounds (seagull cries, whale calls)
- [ ] Horn / bell sounds

### UI
- [ ] Settings menu (graphics quality, audio volume, controls)
- [ ] Score / progression tracking
- [ ] Damage indicator on battleship (visual health bar)

### Technical
- [ ] Performance profiling and optimization pass
- [ ] Save game state to localStorage
- [ ] Multiplayer (WebRTC or WebSocket)
- [ ] Unit tests for physics / ECS
- [ ] CI/CD pipeline
