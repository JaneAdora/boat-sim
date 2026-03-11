import * as THREE from 'three';
import { World } from './ecs/World';
import { GameLoop } from './core/GameLoop';
import { InputManager } from './core/InputManager';
import { SceneManager } from './rendering/SceneManager';
import { Ocean } from './rendering/Ocean';
import { SkyRenderer } from './rendering/Sky';
import { Stars } from './rendering/Stars';
import { ChunkManager } from './world/ChunkManager';
import { BoatControlSystem } from './systems/BoatControlSystem';
import { WindSystem } from './systems/WindSystem';
import { BuoyancySystem } from './systems/BuoyancySystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { CameraSystem } from './systems/CameraSystem';
import { RenderSystem } from './systems/RenderSystem';
import { DayNightSystem } from './systems/DayNightSystem';
import { SailAnimationSystem } from './systems/SailAnimationSystem';
import { WildlifeSystem } from './systems/WildlifeSystem';
import { TowingSystem } from './systems/TowingSystem';
import { WeaponsSystem } from './systems/WeaponsSystem';
import { SeagullSystem } from './systems/SeagullSystem';
import { spawnBoat } from './boats/BoatFactory';
import { BoatDefinition } from './boats/BoatDefinition';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';
import { AmbientSoundscape } from './audio/AmbientSoundscape';
import { SoundEffects } from './audio/SoundEffects';
import { PostProcessing } from './rendering/PostProcessing';
import { WakeTrail } from './rendering/WakeTrail';
import { BowSpray } from './rendering/BowSpray';
import { Bioluminescence } from './rendering/Bioluminescence';
import { Moon } from './rendering/Moon';
import { WeatherSystem } from './rendering/WeatherSystem';
import { BoatLights } from './rendering/BoatLights';
import { KillTracker } from './state/KillTracker';
import { MeshRenderable } from './components/MeshRenderable';
import { Transform } from './components/Transform';
import { RigidBody } from './components/RigidBody';
import { BoatControl } from './components/BoatControl';

export class Engine {
  private world: World;
  private gameLoop: GameLoop;
  private input: InputManager;
  private sceneManager: SceneManager;
  private ocean: Ocean;
  private chunkManager: ChunkManager;
  private windSystem: WindSystem;
  private dayNightSystem: DayNightSystem;
  private cameraSystem: CameraSystem;
  private hud: HUD;
  private minimap: Minimap;
  private soundscape: AmbientSoundscape;
  private soundEffects: SoundEffects;
  private postProcessing: PostProcessing;
  private wakeTrail: WakeTrail;
  private bowSpray: BowSpray;
  private bioluminescence: Bioluminescence;
  private moon: Moon;
  private weather: WeatherSystem;
  private boatLights: BoatLights;
  private wildlifeSystem: WildlifeSystem;
  private weaponsSystem: WeaponsSystem;
  private killTracker: KillTracker;
  private boatEntity: number;
  private elapsedTime = 0;
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor(boatDef: BoatDefinition) {
    // Core
    this.world = new World();
    this.input = new InputManager();
    this.sceneManager = new SceneManager();

    // Kill tracking
    this.killTracker = new KillTracker();

    // Rendering
    this.ocean = new Ocean();
    this.sceneManager.scene.add(this.ocean.mesh);

    const sky = new SkyRenderer(this.sceneManager.scene);
    const stars = new Stars(this.sceneManager.scene);

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sceneManager.scene.add(sunLight);

    const ambientLight = new THREE.HemisphereLight(0x4477aa, 0x222211, 0.6);
    this.sceneManager.scene.add(ambientLight);

    // Fog
    this.sceneManager.scene.fog = new THREE.FogExp2(0x88aacc, 0.00015);

    // World generation
    this.chunkManager = new ChunkManager(this.sceneManager.scene);

    // Touch controls (mobile only)
    const isTouchDevice = 'ontouchstart' in window;
    const touchControls = isTouchDevice ? new TouchControls(this.sceneManager.renderer.domElement) : null;

    // Systems (added in priority order)
    const boatControlSystem = new BoatControlSystem(this.input);
    if (touchControls) boatControlSystem.setTouchControls(touchControls);
    this.world.addSystem(boatControlSystem);

    this.windSystem = new WindSystem();
    this.world.addSystem(this.windSystem);

    const buoyancySystem = new BuoyancySystem(this.ocean);
    this.world.addSystem(buoyancySystem);

    const physicsSystem = new PhysicsSystem(this.windSystem);
    physicsSystem.setChunkManager(this.chunkManager);
    this.world.addSystem(physicsSystem);

    const sailAnimationSystem = new SailAnimationSystem(this.windSystem);
    this.world.addSystem(sailAnimationSystem);

    this.dayNightSystem = new DayNightSystem(sky, stars, this.ocean, sunLight, ambientLight);
    this.world.addSystem(this.dayNightSystem);

    this.cameraSystem = new CameraSystem(this.sceneManager.camera, this.input);
    if (touchControls) this.cameraSystem.setTouchControls(touchControls);
    this.world.addSystem(this.cameraSystem);

    const renderSystem = new RenderSystem();
    this.world.addSystem(renderSystem);

    // Spawn the boat
    this.boatEntity = spawnBoat(this.world, this.sceneManager.scene, boatDef);
    this.cameraSystem.setTarget(this.boatEntity);

    // Navigation lights for the player boat
    const boatMesh = this.world.getComponent<MeshRenderable>(this.boatEntity, 'MeshRenderable');
    this.boatLights = new BoatLights(boatMesh!.object3D as THREE.Group, boatDef.meshType);

    // Wildlife & ambient vessels
    this.wildlifeSystem = new WildlifeSystem(this.sceneManager.scene, this.ocean, this.boatEntity);
    this.world.addSystem(this.wildlifeSystem);

    // Towing (tugboat only)
    const towingSystem = new TowingSystem(
      this.sceneManager.scene, this.ocean, this.boatEntity,
      this.wildlifeSystem,
    );
    this.world.addSystem(towingSystem);

    // Sound effects (weapon SFX)
    this.soundEffects = new SoundEffects();

    // Weapons (torpedoes & missiles)
    this.weaponsSystem = new WeaponsSystem(
      this.sceneManager.scene, this.ocean, this.boatEntity,
      this.wildlifeSystem, this.chunkManager,
      this.killTracker, this.soundEffects,
    );
    this.world.addSystem(this.weaponsSystem);

    // Seagulls near islands
    const seagullSystem = new SeagullSystem(this.sceneManager.scene, this.chunkManager, this.boatEntity);
    this.world.addSystem(seagullSystem);

    // UI
    this.hud = new HUD(this.input, this.killTracker);
    this.minimap = new Minimap(this.chunkManager);

    // Audio
    this.soundscape = new AmbientSoundscape(boatDef.meshType);
    this.soundscape.start();

    // Post-processing (subtle bloom for sun reflections)
    this.postProcessing = new PostProcessing(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.sceneManager.camera
    );

    // Wake trail
    this.wakeTrail = new WakeTrail(this.sceneManager.scene);

    // Bow spray particles
    this.bowSpray = new BowSpray(this.sceneManager.scene);

    // Night-time visual effects
    this.bioluminescence = new Bioluminescence(this.sceneManager.scene);
    this.moon = new Moon(this.sceneManager.scene);

    // Weather (rain, fog, lightning)
    this.weather = new WeatherSystem(this.sceneManager.scene);

    // Keyboard toggles (stored for cleanup)
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        this.soundscape.toggleMute();
        this.soundEffects.toggleMute();
      }
      if (e.code === 'KeyN') {
        this.minimap.toggle();
      }
      if (e.key === '/' || e.key === '?') {
        this.hud.showControls(5);
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    // Game loop
    this.gameLoop = new GameLoop((dt) => this.update(dt));

    // Initial chunk load
    this.chunkManager.update(0, 0);
  }

  private update(dt: number): void {
    this.elapsedTime += dt;

    // Update ECS systems
    this.world.update(dt);

    // Update ocean (follows camera, updates time)
    const sunDir = this.dayNightSystem.getSunDirection();
    this.ocean.update(dt, this.sceneManager.camera.position, sunDir);

    // Update weather system (rain, lightning, fog density)
    const fog = this.sceneManager.scene.fog as THREE.FogExp2;
    if (fog) {
      this.weather.update(dt, this.sceneManager.camera.position, fog);

      // Fog color based on time of day + weather darkness
      const sunElev = sunDir.y;
      const dark = this.weather.getWeatherDarkness();
      const flash = this.weather.getLightningFlash();
      if (sunElev > 0.1) {
        fog.color.setRGB(
          THREE.MathUtils.lerp(0.53, 0.35, dark) + flash * 0.3,
          THREE.MathUtils.lerp(0.67, 0.45, dark) + flash * 0.3,
          THREE.MathUtils.lerp(0.8, 0.55, dark) + flash * 0.3
        );
      } else if (sunElev > 0) {
        fog.color.setRGB(
          THREE.MathUtils.lerp(0.3, 0.53, sunElev * 10) * (1 - dark * 0.4) + flash * 0.2,
          THREE.MathUtils.lerp(0.2, 0.67, sunElev * 10) * (1 - dark * 0.4) + flash * 0.2,
          THREE.MathUtils.lerp(0.3, 0.8, sunElev * 10) * (1 - dark * 0.4) + flash * 0.2
        );
      } else {
        fog.color.setRGB(0.05 + flash * 0.15, 0.05 + flash * 0.15, 0.1 + flash * 0.1);
      }
    }

    // Update chunk loading and wake based on boat position
    const boatTransform = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
    const boatRb = this.world.getComponent<RigidBody>(this.boatEntity, 'RigidBody');
    if (boatTransform) {
      this.chunkManager.update(boatTransform.position.x, boatTransform.position.z);
      this.chunkManager.updateAnimations(dt, this.elapsedTime, sunDir.y);

      // Update wake trail
      if (boatRb) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(boatTransform.quaternion);
        const speed = Math.abs(boatRb.velocity.dot(forward));
        this.wakeTrail.update(boatTransform.position, boatTransform.quaternion, speed, dt);
        this.bowSpray.update(dt, boatTransform.position, boatTransform.quaternion, speed);
        this.bioluminescence.update(dt, boatTransform.position, boatTransform.quaternion, speed, sunDir.y);
      }

      // Update weapon effects (torpedo wakes, explosions)
      this.weaponsSystem.updateEffects(dt);
    }

    // Update moon and boat lights
    this.moon.update(sunDir, sunDir.y);
    this.boatLights.update(sunDir.y);

    // Update HUD
    this.hud.update(this.world, this.boatEntity, this.windSystem, dt);

    // Update minimap
    if (boatTransform) {
      this.minimap.update(
        boatTransform.position.x,
        boatTransform.position.z,
        boatTransform.rotation.y,
        this.wildlifeSystem.getWildlifePositions(),
      );
    }

    // Update ambient audio
    this.soundscape.update(this.windSystem.strength, false, dt, this.weather.getRainIntensity());
    const boatCtrl = this.world.getComponent<BoatControl>(this.boatEntity, 'BoatControl');
    if (boatCtrl) {
      this.soundscape.updateEngine(boatCtrl.throttle, dt);
    }

    // Render with post-processing
    this.postProcessing.render();
  }

  start(): void {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 800);
    }
    this.gameLoop.start();
  }

  pause(): void {
    this.gameLoop.pause();
  }

  resume(): void {
    this.gameLoop.resume();
  }

  dispose(): void {
    // Stop game loop
    this.gameLoop.stop();

    // Remove keyboard handler
    window.removeEventListener('keydown', this.keydownHandler);

    // Stop audio
    this.soundscape.stop();
    this.soundEffects.stop();

    // Dispose Three.js scene
    this.sceneManager.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: THREE.Material) => m.dispose());
        } else if (obj.material) {
          (obj.material as THREE.Material).dispose();
        }
      }
    });

    // Remove dynamically created DOM elements
    document.getElementById('torpedo-button')?.remove();
    document.getElementById('missile-button')?.remove();
    document.getElementById('tow-button')?.remove();

    // Remove the renderer's canvas
    const canvas = this.sceneManager.renderer.domElement;
    canvas.parentElement?.removeChild(canvas);

    // Dispose renderer
    this.sceneManager.renderer.dispose();
  }
}
