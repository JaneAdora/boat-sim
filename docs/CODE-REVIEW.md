# Tugboat Bliss — Code Review Synthesis

Browser Three.js boat sim (hobby/portfolio). Intent: soothing + fun. Targets desktop + mobile. No tests, manual Netlify deploy. ~9,600 lines of TS.

This report synthesizes findings across 12 review dimensions. Each high/critical finding carries an adversarial **verdict** (`confirmed` held up under a skeptic; `partially-confirmed`/`refuted` were discounted). Findings are grouped by cross-cutting theme. Severities reflect the *adjusted* severity where a verifier downgraded the original.

Legend for verification status:
- **confirmed** — skeptic reproduced it against the actual code.
- **partially-confirmed** — core mechanism real, scope/impact overstated; trimmed.
- **(no verdict)** — medium/low finding not adversarially tested; treat as plausible-but-unconfirmed.

---

## Theme 1 — The teardown path leaks everything (the dominant risk)

`Engine.dispose()` is the only teardown, and it runs on every ESC → selector → new-game cycle. It misses entire categories of resources, so each replay accumulates leaks. This is the single most important cluster in the review — multiple independent dimensions (correctness, memory) converged on it, and almost every high finding here is **confirmed**.

### 1.1 Engine.dispose() never calls any sub-system dispose() — working cleanup is dead code
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/Engine.ts:325-360`; `src/systems/WeaponsSystem.ts:652`; `src/ecs/World.ts` (no `removeSystem`/`dispose`)
- **Problem:** `WeaponsSystem.dispose()` is complete (removes its Y/U window keydown listener, disposes explosion/confetti/unicorn buffers and orphaned wakes/trails) but is never invoked. `World` has no teardown propagation. So every selector round-trip leaks the WeaponsSystem keydown listener (closing over the whole dead Engine graph) plus any in-flight effects.
- **Fix:** Add `World.dispose()` that calls `dispose()` on each system defining one; call it from `Engine.dispose()` before the scene traverse. Give Wildlife/Seagull/Chunk systems top-level dispose() too.
- **Effort:** medium

### 1.2 scene.traverse() dispose filter skips all Points, Sprite, and Line objects
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/Engine.ts:337-346`
- **Problem:** Filter is `obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh`. `Points`/`Sprite`/`Line` are not Mesh subclasses, so their geometries and ShaderMaterials never dispose. Leaked each session: Bioluminescence (300 pts), BowSpray, ExplosionEffect (2000 pts), ConfettiEffect, Stars, rain mesh (5000 pts), Moon (2 sprites), plus weapon/tow lines. Compiled GPU programs and VBOs accumulate toward the WebGL context limit.
- **Fix:** Broaden the callback to dispose any renderable uniformly: `const o = obj as any; o.geometry?.dispose(); const m = o.material; Array.isArray(m) ? m.forEach(x=>x.dispose()) : m?.dispose();`
- **Effort:** small

### 1.3 InputManager registers 8 permanent window listeners with no dispose
- **Severity:** high · **Verdict:** confirmed (×2 dimensions)
- **Location:** `src/core/InputManager.ts:16-61`
- **Problem:** keydown/keyup/blur/mousedown/mouseup/mousemove/wheel/contextmenu added as anonymous closures capturing `this`; no `dispose()`, Engine never touches InputManager. Each replay adds 8 more, each retaining a dead InputManager (and the Engine graph via injection into BoatControl/Camera systems). Repeated `preventDefault` side-effects on contextmenu/mousedown also stack.
- **Fix:** Store handlers in fields, add `InputManager.dispose()` removing all 8, call from `Engine.dispose()`. Or make InputManager a page-lifetime singleton.
- **Effort:** small

### 1.4 PostProcessing leaks resize listener and never disposes EffectComposer render targets
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/rendering/PostProcessing.ts:30-33`; instantiated `src/Engine.ts:179`
- **Problem:** Anonymous window `resize` listener, no `dispose()`. EffectComposer's read/write WebGLRenderTargets + UnrealBloom's mip chain (the heaviest GPU allocations in the app) are never freed; a fresh set allocates each replay while stale listeners fire `setSize` on dead composers.
- **Fix:** Store the handler; add `dispose()` calling `composer.dispose()` + `bloomPass.dispose()` and removing the listener; invoke from `Engine.dispose()`.
- **Effort:** small

### 1.5 Engine.dispose() bypasses SceneManager.dispose(), leaking its resize listener
- **Severity:** medium · **Verdict:** (not separately adjudicated)
- **Location:** `src/Engine.ts:359`; `src/rendering/SceneManager.ts:40-43`
- **Problem:** `SceneManager.dispose()` already removes its resize listener and disposes the renderer, but Engine calls `this.sceneManager.renderer.dispose()` directly, leaving the resize listener bound to the old camera/renderer.
- **Fix:** Replace the direct `renderer.dispose()` with `this.sceneManager.dispose()`.
- **Effort:** small

### 1.6 TowingSystem leaks a window keydown listener every session
- **Severity:** medium (downgraded from high) · **Verdict:** partially-confirmed
- **Location:** `src/systems/TowingSystem.ts:62-66` (no dispose)
- **Problem:** Anonymous `KeyT` keydown listener, never stored, no `dispose()`. Leaks one listener per replay. The "leaks a tow line every session" part was overstated — the towLine is properly disposed in `releaseTow()` and only persists if the player was actively towing at exit. Stale instances aren't updated, so user-visible duplicate-firing impact is minimal; the real harm is unbounded listener/button accumulation.
- **Fix:** Store the handler, add `dispose()` removing it + the button + (if present) the towLine; wire through the World/Engine dispose path.
- **Effort:** small

### 1.7 HUD and Minimap re-bind click handlers to persistent index.html toggle buttons
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `src/ui/HUD.ts:40-49`; `src/ui/Minimap.ts:45-48`
- **Problem:** `#hud-toggle`/`#map-toggle` are static elements that persist across games; each new HUD/Minimap adds another click handler capturing a now-dead instance. After N replays a tap fires N handlers → icon/display desync (HUD) and toggle parity bugs (Minimap), plus retained dead instances. Only manifests after a replay; first play is fine; touch-oriented buttons.
- **Fix:** Add `dispose()` removing the listeners (store refs), or clone-and-replace the static buttons on selector return, or bind once at module load.
- **Effort:** medium

### 1.8 AmbientSoundscape leaks one-shot init listeners if the user leaves pre-interaction
- **Severity:** medium · **Verdict:** (not separately adjudicated)
- **Location:** `src/audio/AmbientSoundscape.ts:302-311`, `:371-385`
- **Problem:** `{once:true}` click/keydown init listeners aren't removed in `stop()` if they never fired; a later stray click spins up an untracked AudioContext. Chrome caps ~6 concurrent contexts, so repeated pre-interaction exits can eventually throw.
- **Fix:** Store the handler; always `removeEventListener` in `stop()` (no-op if already fired); guard init to bail if stopped. Consider one shared page-lifetime AudioContext.
- **Effort:** small

### 1.9 main.ts ESC handler / startGame idempotency (defensive)
- **Severity:** low · **Location:** `src/main.ts:163-181`, `:141-161`
- **Problem:** `startGame()` overwrites `escKeyHandler` without removing the old one first; safe only because `returnToSelector` always runs between two starts. No idempotency guard on `activeEngine`.
- **Fix:** At the top of `startGame()`, remove any existing handler and dispose any existing engine first.
- **Effort:** small

---

## Theme 2 — Onboarding & control-scheme clarity (first-session UX)

The "show up and sail" feel is lovely, but several avoidable issues leak first-time players. The headline is a control-label contradiction that does the opposite of what the player intends.

### 2.1 On-screen weapon buttons (T/M) contradict the actual fire keys (Y/U)
- **Severity:** high (downgraded from critical) · **Verdict:** confirmed
- **Location:** `src/systems/WeaponsSystem.ts:117,131,144-145`; `TowingSystem.ts:63`; `Engine.ts:200`; `index.html:539,542-544`
- **Problem:** Torpedo button reads `T`, missile reads `M`, but fire keys are `KeyY`/`KeyU`. `KeyT` = Tow, `KeyM` = Mute. A keyboard player reading the buttons and pressing T/M will tow a boat and mute audio — the opposite of firing. The help card lists the correct Y/U, contradicting the buttons. Downgraded from critical because the buttons *do* fire on click/tap and Y/U work — only the glyph-as-key-hint inference is wrong.
- **Fix:** Make button glyph == fire key. Either relabel buttons to `Y`/`U`, or rebind torpedo→KeyT, missile→KeyM and move Tow/Mute to other keys. Keep buttons, keys, and help card in agreement.
- **Effort:** small

### 2.2 Mobile players get no controls reference or feature explanation
- **Severity:** high · **Verdict:** confirmed
- **Location:** `index.html:461-463` (`#controls-help display:none` on coarse pointer); `src/ui/TouchControls.ts`
- **Problem:** The only onboarding (`#controls-help`) is force-hidden on touch. Nothing explains the camera gesture, weapon buttons, tow button, or modes. (Note: actual camera is single-finger orbit / two-finger pinch — fix copy accordingly; the tiller/throttle *are* labeled.)
- **Fix:** Add a one-time dismissible mobile coach overlay (localStorage-gated) labeling tiller/throttle, "one finger to look · pinch to zoom", and the weapon/tow buttons. At minimum render a touch-specific help instead of `display:none`.
- **Effort:** medium

### 2.3 Controls card auto-hides after 5s with no discoverable way to reopen
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/ui/HUD.ts:52,55-69`; `src/Engine.ts:207-209`
- **Problem:** Card fades after 5s; the only way back is pressing `/` or `?` — itself documented only inside the now-hidden card (circular). No visible `?` button anywhere; completely inaccessible on mobile.
- **Fix:** Add an always-visible low-key `?` button (desktop + mobile) that toggles the card. Optionally extend initial display to ~8s.
- **Effort:** small

### 2.4 Selector / mode pill get no focus on (re)entry
- **Severity:** low · **Verdict:** (accessibility dimension)
- **Location:** `src/main.ts:59-128`, `:141-161`
- **Problem:** `showSelector` never moves focus to the first control; after "Yes, leave" the focused element is removed and focus drops to body. WCAG 2.4.3.
- **Fix:** Focus the first mode button / boat card at the end of `showSelector`; add a visually-hidden heading for SR context.
- **Effort:** small

---

## Theme 3 — No design tokens / no focus states (UI system hygiene)

The UI is cohesive dark-glassmorphic, but values are hand-copied and keyboard affordances are absent.

### 3.1 No design tokens — colors/spacing/radii hand-copied across CSS + JS
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `index.html:30-489`; `src/main.ts:214-226`; `src/ui/Minimap.ts:89`
- **Problem:** Zero CSS custom properties (`:root`/`var(--` return nothing). `#e0e8f0` ×9, `rgba(255,255,255,0.15)` ×7, navy `#0a1628` in 3 CSS spots + Minimap + theme-color. Panel blacks drift across 0.25/0.3/0.35/0.5/0.6 with no semantic reason; radii are a 2/8/12/16/18/24/50% grab-bag. Install button re-hardcodes the palette inline. Downgraded because nothing is visually broken — it's maintainability debt.
- **Fix:** Add a `:root` token block (ink, bg-deep, accent, danger, panel, panel-strong, hairline, a 3-step radius scale, pill 999px, blur); replace literals with vars; mirror in Minimap. Replace the inline install button with a shared class.
- **Effort:** medium

### 3.2 No keyboard focus states on any interactive control
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `index.html:188-210, 227-250, 378-395`
- **Problem:** No `:focus`/`:focus-visible` rules anywhere. Boat cards, mode buttons, and ESC menu buttons (real `<button>`s) show only the UA default outline — often invisible on dark glass. The destructive "Yes, leave" button isn't focus-distinguished; the ESC modal doesn't move/trap focus. (Modern browsers do draw a default ring, so it's reduced visibility rather than total absence — hence medium.)
- **Fix:** Shared `:focus-visible` treatment (2px accent outline, 2px offset, lift on focus). Move initial focus to Cancel on ESC-open and trap Tab in the modal.
- **Effort:** small

### 3.3 Loading bar is fake — snaps to 100% with no real progress
- **Severity:** medium · **Location:** `index.html:118-131`; `src/main.ts:60`; `src/Engine.ts:306-314`
- **Fix:** Drive the bar from 2-3 real milestones (`document.fonts.ready`, first Engine step, first frame), or drop it and show an indeterminate shimmer only during `Engine.start`.
- **Effort:** small

### 3.4 HUD wind arrow low-contrast over bright horizon
- **Severity:** medium · **Location:** `index.html:515-520, 43`
- **Fix:** Brighten arrow to `#7db8ec`/ink + drop-shadow; strengthen panel to `rgba(0,0,0,0.45)`; raise label opacity 0.6→0.7.
- **Effort:** small

---

## Theme 4 — Mobile layout not hardened for modern phones

The touch layer is thoughtfully built but not adapted to notches, orientation, or overlap.

### 4.1 No safe-area-inset handling — controls clipped by notch / home indicator
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `index.html:5` (viewport meta), `:451-488`; `src/ui/TouchControls.ts:35-39`; `manifest.json` (`display:fullscreen`)
- **Problem:** No `viewport-fit=cover`, no `env(safe-area-inset-*)` anywhere; manifest is fullscreen + `black-translucent` status bar. Fixed 16px/20px offsets can fall under the notch, rounded corners, and the ~34px home-indicator zone — including the bottom-left tiller. (Manifest is `orientation:any`, not landscape-locked, so the "natural landscape" framing is loose, but the clipping occurs in both orientations.)
- **Fix:** Add `viewport-fit=cover`; pad fixed UI with `env(safe-area-inset-*)` in TouchControls and the coarse-pointer media block.
- **Effort:** small

### 4.2 Action buttons overlap the tiller on small screens
- **Severity:** medium · **Location:** `index.html:478-486` vs `src/ui/TouchControls.ts:42-77`
- **Fix:** Re-anchor torpedo/missile to `right:16px` near the throttle (or well clear of the 200px tiller). Verify at 360px width.
- **Effort:** small

### 4.3 Camera gesture math breaks on 1↔2-finger transitions
- **Severity:** medium · **Location:** `src/ui/TouchControls.ts:283-317`
- **Fix:** Track gesture mode explicitly on touchstart/end; reset the per-gesture baseline on finger-count change; look up the specific tracked id rather than `changedTouches[0]`.
- **Effort:** medium

### 4.4 Fixed-pixel control sizes don't scale across devices
- **Severity:** medium · **Location:** `src/ui/TouchControls.ts:54,92,69,107`
- **Fix:** `clamp()`/viewport-relative sizing; bump 36px corner buttons to a 44px hit area.
- **Effort:** medium

### 4.5 orientation:any with no portrait layout
- **Severity:** medium · **Location:** `manifest.json`; `index.html:451-488`
- **Fix:** Lock manifest to `landscape`, or add a portrait "rotate" nudge + per-orientation control sizing.
- **Effort:** small

### 4.6 No overscroll/pull-to-refresh suppression
- **Severity:** medium · **Location:** `index.html:31`; `src/rendering/SceneManager.ts:13`
- **Fix:** `overscroll-behavior: none` on `html,body`; `touch-action: none` on body; `overscroll-behavior: contain` on the selector screen.
- **Effort:** small

### 4.7 Boat-selector card has both click + touchend handlers (double-fire risk)
- **Severity:** low · **Location:** `src/main.ts:119-123`
- **Fix:** Drop the redundant touchend; add `touch-action: manipulation`; guard `startGame` with `if (activeEngine) return;`.
- **Effort:** small

### 4.8 Throttle has no value readout; 4.9 Minimap toggle crowds corner buttons; 4.10 pixelRatio≤2 + AA + bloom heavy on mobile
- **Severity:** low each · **Locations:** `TouchControls.ts:240-270`; `index.html:467-477`; `SceneManager.ts:9-10`
- **Fix:** Throttle fill indicator; space top-row buttons ≥8px and enlarge to 44px; cap mobile pixelRatio at ~1.5 and gate bloom behind a quality flag.
- **Effort:** small–medium

---

## Theme 5 — Worldgen hitches & visual/physics drift

Deterministic and organic, but synchronous generation causes hitches and a few consistency defects undercut the polish.

### 5.1 Entire 81-chunk ring generates synchronously on first frame + per-frame spikes
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/Engine.ts:217`; `src/world/ChunkManager.ts:45-47, 60-96`
- **Problem:** Startup builds all 81 chunks at once; the live-seed window around origin holds ~44 islands (verifier measured higher than the ~38 estimate). Each island = 4096-cell heightmap (multi-octave FBM+ridged+warp) + mesh + instancing, all main-thread. The same `update()` runs every frame, so a teleport/turn can build a full new 9-chunk row in one frame — a real gameplay hitch, not just startup.
- **Fix:** Queue needed-but-unloaded keys; load 1-2/frame nearest-first; generate the immediate 3×3 synchronously at startup and stream the rest; optionally move heightmap noise to a Web Worker.
- **Effort:** medium

### 5.2 Synchronous chunk/island generation hitches at boundary crossings
- **Severity:** high · **Verdict:** confirmed
- **Location:** `src/world/ChunkManager.ts:31→60`; `IslandGenerator.ts:33`; `TerrainGenerator.ts:45`
- **Problem:** Same root cause as 5.1 from the perf dimension. Cheap partial win: hoist the per-vertex `new THREE.Color()` out of the 4096-iteration loop in `createTerrainMesh`.
- **Fix:** Per-frame load budget + the Color hoist.
- **Effort:** medium

### 5.3 No chunk-load hysteresis — boundary thrash
- **Severity:** medium (downgraded from high) · **Verdict:** partially-confirmed
- **Location:** `src/world/ChunkManager.ts:31-58`
- **Problem:** Loaded set recomputed each frame with immediate unload; no hysteresis. Real, but `CHUNK_SIZE=300` means wave/idle jitter (a few meters) does *not* thrash — only a mean position sitting within meters of a 300-unit seam does, and ~half the strip is cheap water chunks. So frequency/cost are lower than first framed.
- **Fix:** Unload radius > load radius, or cache `currentChunkX/Z` and early-return when unchanged.
- **Effort:** small

### 5.4 Terrain mesh vs height/collision sampler use different horizontal scales
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `TerrainGenerator.ts:49-55` vs `ChunkManager.ts:241-249`, `IslandGenerator.ts:55-56`
- **Problem:** Generation/trees/collision share spacing `scale`, but the rendered `PlaneGeometry(scale*size,...)` has spacing `scale*size/(size-1)` (×1.587% stretch). Heights are correct per column but drawn slightly outboard of where collision reads them — 0 at center, growing to ~1.56m (radius 40) up to ~3.9m on big islands. Cosmetic/physics-drift at the shoreline only; downgraded accordingly.
- **Fix:** `PlaneGeometry(scale*(size-1), scale*(size-1), size-1, size-1)` so vertex spacing == scale.
- **Effort:** small

### 5.5 Island density very high (~47%) and locked one-per-chunk → 300m grid regularity
- **Severity:** medium · **Location:** `IslandGenerator.ts:25-28, 33-47`
- **Fix:** Raise threshold (~0.45-0.6 → ~20-30%); decouple from the grid via a low-freq likelihood field + jittered/Poisson placement; increase center jitter.
- **Effort:** medium

### 5.6 Trees float/sink (Y from raw heightmap, not clamped mesh)
- **Severity:** medium · **Location:** `IslandGenerator.ts:141` vs `TerrainGenerator.ts:68-69`
- **Fix:** Bilinearly sample post-clamp height; raise `minHeight` away from sunk (<0.3) vertices.
- **Effort:** medium

### 5.7 Underwater skirt overlap / ambiguous collision; 5.8 stepped (non-interpolated) collision; 5.9 decoration `Math.sin` hashes banding; 5.10 fixed 64×64 heightmap
- **Severity:** low–medium each · **Locations:** `IslandGenerator.ts:46-50`; `ChunkManager.ts:247-251`; `TerrainGenerator.ts:144-195`; `IslandGenerator.ts:36`
- **Fix:** Clamp island radius to chunk / polygonOffset skirt + return max height on overlap; bilinear-interpolate collision + drop the 0.3 gate; route decorations through seeded noise; scale hmSize with radius.
- **Effort:** small–medium

---

## Theme 6 — Audio robustness

### 6.1 Ambient audio misses the first gesture — silent until a second interaction
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `src/audio/AmbientSoundscape.ts:302-311`; wired `Engine.ts:175-176`, `main.ts:119`
- **Problem:** `start()` only registers `{once:true}` click/keydown listeners; the launching click already fired before they attach, so ambience initializes on the *next* input. Real and noticeable, but self-heals on the next keypress (steering happens within ~1-2s) — hence medium.
- **Fix:** `start()` runs inside a user gesture already — call `initSynthetic()` + `resume()` immediately and drop the once-listeners.
- **Effort:** small

### 6.2 Pause menu doesn't suspend the AudioContext — engine/ocean keep droning
- **Severity:** medium · **Location:** `main.ts:130-139`; `GameLoop.ts:20-26`
- **Fix:** Add `suspend()`/`resume()` (ctx.suspend/resume) called from ESC open/close; ramp masterGain down first to avoid a pop.
- **Effort:** small

### 6.3 Overlapping explosions hard-clip (no limiter)
- **Severity:** medium · **Location:** `SoundEffects.ts:154-215, 12-23`
- **Fix:** Insert a `DynamicsCompressorNode` limiter between masterGain and destination; optionally lower masterGain to ~0.6.
- **Effort:** small

### 6.4 Mute pops + two desyncable mute flags
- **Severity:** medium · **Location:** `AmbientSoundscape.ts:363-369`; `SoundEffects.ts:285-291`; `Engine.ts:200-203`
- **Fix:** Ramp via `setTargetAtTime(...,0.02)`; unify behind one Engine-level mute flag; reflect in HUD; persist to localStorage.
- **Effort:** small

---

## Theme 7 — Engagement & session persistence

### 7.1 No persistence of mode/boat/mute between sessions
- **Severity:** medium · **Location:** `main.ts:57`; `Engine.ts:200-203`
- **Fix:** Persist last mode, boat, and mute in localStorage; read in `showSelector` to pre-highlight; pass mute into audio.
- **Effort:** small

### 7.2 Modes named but never explained on the selector
- **Severity:** medium · **Location:** `main.ts:71-93`
- **Fix:** One-line descriptor under each mode button, matching the boat-card pattern.
- **Effort:** small

### 7.3 Kills produce no satisfying confirmation
- **Severity:** medium · **Location:** `KillTracker.ts:9-15`; `HUD.ts:96-98`; `WeaponsSystem.ts:333,341`
- **Fix:** Pulse the counter ~300ms on increment; float a "+1"/sparkle; distinct kill chime in classic mode.
- **Effort:** small

### 7.4 ESC is a "leave the game?" modal, not a pause/settings hub
- **Severity:** medium · **Location:** `main.ts:130-190`; `index.html:557-563`
- **Fix:** Turn it into Resume / volume slider / Controls / Leave-to-menu.
- **Effort:** medium

### 7.5 No objective or progression past the first two minutes
- **Severity:** medium · **Location:** `KillTracker.ts`
- **Fix:** Lightweight optional goals (first kill/tow, reached-island), a persisted best score on the selector, a soft minimap nudge.
- **Effort:** large

---

## Theme 8 — Architecture & duplication (future-feature friction)

Well-factored overall; debt concentrated in a god-object orchestrator and copy-pasted effect families. None affects the shipped experience.

### 8.1 Engine.update() re-orders subsystems the ECS already sequences
- **Severity:** medium · **Location:** `src/Engine.ts:220-304`
- **Fix:** Collapse the two ordering mechanisms — register a `FrameUpdatable` list or fold subsystems into the ECS with priorities; extract a `FrameContext` computed once; move the fog-color block into WeatherSystem.
- **Effort:** medium

### 8.2 Wake-ribbon classes duplicate ~90% of geometry/rebuild code (highest-leverage dedup)
- **Severity:** medium · **Location:** `WakeTrail.ts`, `TorpedoWake.ts`, `RainbowTorpedoWake.ts`
- **Problem:** Identical buffer alloc, triangle-strip index build, ribbon rebuild; already drifting (`i/5` vs `i/3`).
- **Fix:** Extract a `RibbonTrail` base parameterized by `{maxPoints, widthFn, material}`.
- **Effort:** medium

### 8.3 Classic-vs-magical logic scattered as inline conditionals
- **Severity:** medium · **Location:** `WeaponsSystem.ts` (≥12 sites)
- **Fix:** `ImpactEffects` strategy interface with Classic/Magical implementations selected once from config.
- **Effort:** medium

### 8.4 Rainbow effects copy-paste an orphan/freeze lifecycle; 8.5 GPU particle-burst boilerplate repeated ×4
- **Severity:** low each · **Locations:** `RainbowTorpedoWake.ts`/`RainbowMissileTrail.ts`; `ExplosionEffect`/`ConfettiEffect`/`BowSpray`/`Bioluminescence`
- **Fix:** Shared `OrphanLifecycle` helper + `ParticlePool` helper (opportunistic).
- **Effort:** small–medium

### 8.6 AudioManager.ts is dead code, drags in unused howler
- **Severity:** low · **Verdict:** (build dimension confirmed dead) · **Location:** `src/audio/AudioManager.ts`; `AmbientSoundscape.ts:1`; `package.json:15,20`
- **Fix:** Delete the file + unused import; `npm uninstall howler @types/howler`.
- **Effort:** small

### 8.7 Deep constructor-injection chains + setter init; 8.8 priority comments already drifted; 8.9 BoatFactory.ts 805-line mix
- **Severity:** low each · **Locations:** `Engine.ts:108-168`; `TowingSystem.ts:38` vs `SeagullSystem.ts:37`; `BoatFactory.ts`
- **Fix:** Options-object constructors for the big systems; centralize priorities in one const map (fix the stale comment); split per-boat mesh builders into files + shared materials palette.
- **Effort:** small–medium

---

## Theme 9 — Type safety (the compiler is the only test harness)

Compiles under `strict:true`; weaknesses are latent, not live bugs.

### 9.1 ECS getComponent returns T|undefined with no query() type link → fragile `!` (×11)
- **Severity:** medium (downgraded from high) · **Verdict:** confirmed
- **Location:** `src/ecs/World.ts:31-49`; consumers in Physics/Buoyancy/BoatControl/Render/SailAnimation systems
- **Problem:** `query('Transform',...)` returns plain `EntityId[]`; callers must `getComponent<T>(e,'Transform')!`. All 11 sites are currently sound, but a typo/renamed component is uncaught and crashes at runtime. Latent maintainability risk, not a live defect.
- **Fix:** Branded `defineComponent<T>('Transform')` keys, or a lighter `getComponentOrThrow<T>` that fails loudly with the component name.
- **Effort:** medium

### 9.2 Component store is `Map<string, Map<EntityId, any>>` (types erased at the boundary)
- **Severity:** medium · **Location:** `src/ecs/World.ts:8, 31-33`
- **Fix:** Central `ComponentMap` interface; key add/get by `keyof ComponentMap`.
- **Effort:** medium

### 9.3 meshType union widened to `string` at every consumer (lost exhaustiveness)
- **Severity:** medium · **Location:** `BoatDefinition.ts:5` vs `BoatLights.ts`, `AmbientSoundscape.ts`, `BoatFactory.ts:796`
- **Fix:** Export `MeshType`; use everywhere; `Record<MeshType,...>`; add `assertNever` in switches.
- **Effort:** small

### 9.4 tsconfig omits cheap high-value flags
- **Severity:** medium · **Location:** `tsconfig.json:6`
- **Fix:** Add `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`. (De-facto lint layer for a linter-less project.)
- **Effort:** medium

### 9.5 HUD.windArrow `as unknown as SVGElement`; 9.6 PWA prompt / window.__engine `as any`; 9.7 inconsistent DOM-null discipline; 9.8 untyped EventBus; 9.9 unchecked material casts at ~15 dispose sites
- **Severity:** low–medium each · **Locations:** `HUD.ts:14,27`; `main.ts:166,237-238`; `main.ts`/`Minimap.ts` vs `HUD.ts`; `EventBus.ts`; `ChunkManager.ts`/`WeaponsSystem.ts`/etc.
- **Fix:** Drop the double-cast; add `BeforeInstallPromptEvent` + `Window.__engine` decls; `requireEl()` helper; generic `EventBus<E>`; a shared `disposeMaterial()` handling the array case (reuse Engine's logic).
- **Effort:** small

---

## Theme 10 — Per-frame allocations (GC churn on mobile)

The codebase pools particle buffers well; the gap is scratch-vector allocation in hot paths. All small, all the same pattern.

### 10.1 Per-frame Vector3 allocations in Engine.update + core systems
- **Severity:** medium · **Location:** `Engine.ts:265,285`; `BuoyancySystem.ts:60-81`; `HUD.ts:102`
- **Fix:** Hoist to module-level temps (the codebase already does this in `PhysicsSystem`/`TowingSystem`).
- **Effort:** small

### 10.2 WakeTrail/TorpedoWake allocate Vector3 in the per-point loop (~150+/frame while sailing)
- **Severity:** medium · **Location:** `WakeTrail.ts:97-98`; `TorpedoWake.ts:88-89`; `RainbowTorpedoWake.ts:160-161`
- **Fix:** Module-level `const _UP` + reusable `_dir` temp.
- **Effort:** small

### 10.3 ChunkManager.getTerrainHeight is O(loaded-chunks), called several times/frame
- **Severity:** medium · **Location:** `ChunkManager.ts:236`; callers in Physics/Wildlife/Weapons
- **Fix:** Compute chunk key from world position and `Map.get` only that chunk (+neighbors) → O(1).
- **Effort:** small

### 10.4 DayNight Color allocs; 10.5 Bioluminescence Vector3 allocs; 10.6 Minimap full redraw every frame; 10.7 Explosion pool O(n) dead-slot scan + full buffer re-upload; 10.8 no adaptive quality; 10.9 missile per-frame Vector3/clone
- **Severity:** low each · **Locations:** `DayNightSystem.ts:107-151`; `Bioluminescence.ts:104-105`; `Minimap.ts:68`; `ExplosionEffect.ts:275,166-273`; `SceneManager.ts`/`PostProcessing.ts`; `WeaponsSystem.ts:400,414`
- **Fix:** Scratch Colors; module temps; throttle minimap to ~10-15Hz + reuse the wildlife array; free-list + setDrawRange for particles; rolling-frametime quality fallback (pixelRatio/bloom).
- **Effort:** small–medium

---

## Theme 11 — Build / deploy / PWA hygiene

### 11.1 Dead dependencies: howler, @types/howler, lil-gui
- **Severity:** medium · **Location:** `package.json:15,20,22`; `AudioManager.ts:1`
- **Fix:** Delete AudioManager + import; uninstall all three.
- **Effort:** small

### 11.2 Social-preview meta points to wrong domain
- **Severity:** medium · **Location:** `index.html:17,21,22,26`
- **Problem:** `tugboatbliss.com` vs live `tugboat-bliss.netlify.app`.
- **Fix:** Update the four URLs or register the custom domain; validate with a card tool.
- **Effort:** small

### 11.3 Service worker never versions its cache (stale shell)
- **Severity:** medium · **Location:** `public/sw.js:1,3-8,32-37`
- **Fix:** Per-deploy cache name (build hash) + skipWaiting/clients.claim.
- **Effort:** medium

### 11.4 No CI/tests; manual deploy can ship a broken build
- **Severity:** medium · **Verdict:** (build) · **Location:** no workflows; `netlify.toml`; `Ocean.ts:73`; `IslandGenerator.ts:25,33`
- **Fix:** Add `ci.yml` (node 20, `npm ci`, `npm run build`); Vitest snapshot of `getWaveHeight` + determinism assertions on `hasIsland`/`generateIsland`.
- **Effort:** small

### 11.5 Single 728KB chunk, no manual chunking, no sourcemaps; 11.6 19 root screenshot PNGs + stale dist (ignored, clutter)
- **Severity:** low each · **Location:** `vite.config.ts:6-8`; repo root
- **Fix:** `manualChunks` for three (or raise the warning limit) + `build.sourcemap`; move/delete scratch PNGs.
- **Effort:** small

---

## Discounted / trimmed by adversarial review
- **TowingSystem "leaks tow line every session" (1.6)** — towLine leak is *conditional* on towing-at-exit; only the listener leaks unconditionally. Severity high→medium.
- **HUD/Minimap stale handlers (1.7)** — confirmed but high→medium (only after a replay, touch-oriented buttons).
- **Weapon T/M vs Y/U (2.1)** — confirmed but critical→high (buttons + Y/U both still fire; only the key-hint inference is wrong).
- **Chunk-load hysteresis (5.3)** & **terrain scale drift (5.4)** — confirmed mechanism, high→medium (300m seams rarely thrash; drift is sub-2m shoreline-only).
- **Safe-area (4.1)** — confirmed, high→medium (cosmetic/usability on notched hardware, not a hard block; orientation framing loose).
- **Ambient first-gesture (6.1)** — confirmed, high→medium (self-heals on next input).
- **ECS getComponent `!` (9.1)** — confirmed, high→medium (latent; all sites currently sound).
