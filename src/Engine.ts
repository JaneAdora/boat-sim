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
import { SeagullSystem } from './systems/SeagullSystem';
import { Clouds } from './rendering/Clouds';
import { spawnBoat } from './boats/BoatFactory';
import { BoatDefinition } from './boats/BoatDefinition';
import { HUD } from './ui/HUD';
import { TouchControls } from './ui/TouchControls';
import { AmbientSoundscape } from './audio/AmbientSoundscape';
import { PostProcessing } from './rendering/PostProcessing';
import { WakeTrail } from './rendering/WakeTrail';
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
  private soundscape: AmbientSoundscape;
  private postProcessing: PostProcessing;
  private wakeTrail: WakeTrail;
  private clouds: Clouds;
  private boatEntity: number;
  private elapsedTime = 0;

  constructor(boatDef: BoatDefinition) {
    // Core
    this.world = new World();
    this.input = new InputManager();
    this.sceneManager = new SceneManager();

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
    const touchControls = isTouchDevice ? new TouchControls() : null;

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

    // Wildlife & ambient vessels
    const wildlifeSystem = new WildlifeSystem(this.sceneManager.scene, this.ocean, this.boatEntity);
    this.world.addSystem(wildlifeSystem);

    // Seagulls near islands
    const seagullSystem = new SeagullSystem(this.sceneManager.scene, this.chunkManager, this.boatEntity);
    this.world.addSystem(seagullSystem);

    // Clouds
    this.clouds = new Clouds(this.sceneManager.scene);

    // UI
    this.hud = new HUD(this.input);

    // Audio
    this.soundscape = new AmbientSoundscape();
    this.soundscape.start();

    // Post-processing (subtle bloom for sun reflections)
    this.postProcessing = new PostProcessing(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.sceneManager.camera
    );

    // Wake trail
    this.wakeTrail = new WakeTrail(this.sceneManager.scene);

    // Mute toggle
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.soundscape.toggleMute();
      }
    });

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

    // Update fog color with time of day
    const fog = this.sceneManager.scene.fog as THREE.FogExp2;
    if (fog) {
      const sunElev = sunDir.y;
      if (sunElev > 0.1) {
        fog.color.setRGB(0.53, 0.67, 0.8);
      } else if (sunElev > 0) {
        fog.color.setRGB(
          THREE.MathUtils.lerp(0.3, 0.53, sunElev * 10),
          THREE.MathUtils.lerp(0.2, 0.67, sunElev * 10),
          THREE.MathUtils.lerp(0.3, 0.8, sunElev * 10)
        );
      } else {
        fog.color.setRGB(0.05, 0.05, 0.1);
      }
    }

    // Update clouds
    this.clouds.update(dt, this.sceneManager.camera.position, sunDir.y);

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
      }
    }

    // Update HUD
    this.hud.update(this.world, this.boatEntity, this.windSystem, dt);

    // Update ambient audio
    this.soundscape.update(this.windSystem.strength, false, dt);
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
}
