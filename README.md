# Boatface Killah / Tugboat Bliss

A browser-based 3D boat simulator built with Three.js. Explore a procedurally generated infinite ocean dotted with islands, wildlife, and NPC vessels. Sail through dynamic weather, day/night cycles, and engage in naval combat — or just cruise around and enjoy the scenery.

## Quick Start

```bash
npm install
npm run dev      # Start dev server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```

## Deployment

Deployed to **Netlify**. Push to `main` to trigger auto-deploy. See `netlify.toml` for config.

## Available Boats

| Boat | Description |
|------|------------|
| **Tugboat** | Steady & sturdy. Good all-around vessel with a diesel engine rumble. |
| **Speedboat** | Fast & nimble. High-RPM whine, quick acceleration. |
| **Cruise Ship** | Huge & majestic. Slow to turn, imposing on the water. |
| **Viking Ship** | Ancient & humble. Wind-powered with a gusty ambient sound. |

## Controls

| Key | Action |
|-----|--------|
| W / S | Throttle up / down |
| A / D | Rudder left / right |
| Q / E | Camera orbit |
| R / F | Zoom in / out |
| Right-drag | Look around |
| Scroll | Zoom |
| Y | Fire torpedo |
| U | Fire missile |
| T | Tow / release vessel |
| M | Mute audio |
| H | Toggle HUD |
| N | Toggle minimap |
| ? | Show controls overlay |
| Esc | Leave game (return to menu) |

Mobile: touch controls with on-screen buttons for throttle, rudder, weapons, and an escape button.

## Features

- **Procedural world**: Infinite chunk-based ocean with 4 island biomes (tropical, rocky, autumn, desert)
- **Realistic water**: Gerstner wave ocean with foam, subsurface scattering, sparkle
- **Day/night cycle**: Preetham sky model, stars, moon, golden hour lighting. Daytime runs 3x slower than night.
- **Weather**: Dynamic clear/overcast/rain/storm cycle with GPU rain particles, lightning, fog
- **Physics**: Multi-point buoyancy sampling, engine thrust, sail force, rudder steering
- **Combat**: Homing torpedoes, guided missiles, GPU particle explosions. Battleships require 3 hits to sink.
- **Wildlife**: Dolphins, whales, fishing boats, cargo ships, battleships, seagulls
- **Audio**: Synthesized engine sounds (per-boat), ocean ambience, wind, rain, weapon SFX, explosions
- **Visual effects**: Wake trails, bow spray, bioluminescent particles, navigation lights, bloom post-processing

## Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** — System design, file structure, extension guides. **Developers and AI agents: read this to get onboarded.**
- **[Roadmap](docs/ROADMAP.md)** — Current features, removed features, and planned work.
