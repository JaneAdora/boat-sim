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
import { GenerativeMusic } from './audio/GenerativeMusic';
import { PostProcessing } from './rendering/PostProcessing';
import { WakeTrail } from './rendering/WakeTrail';
import { BowSpray } from './rendering/BowSpray';
import { Bioluminescence } from './rendering/Bioluminescence';
import { Moon } from './rendering/Moon';
import { WeatherSystem } from './rendering/WeatherSystem';
import { Aurora } from './rendering/Aurora';
import { BoatLights } from './rendering/BoatLights';
import { KillTracker } from './state/KillTracker';
import { DiscoveryTracker } from './state/DiscoveryTracker';
import { JournalTracker, JOURNAL_TOTAL } from './state/JournalTracker';
import { bumpBestKills, bumpContracts } from './state/VoyageLog';
import { addCredits } from './state/Wallet';
import { addKarma } from './state/Karma';
import { hasUpgrade } from './state/Upgrades';
import { loadCombatSettings } from './state/CombatSettings';
import { islandName } from './world/IslandNames';
import { ContractSystem } from './systems/ContractSystem';
import { ReturnFireSystem } from './systems/ReturnFireSystem';
import { CommandeerSystem } from './systems/CommandeerSystem';
import { HeistSystem } from './systems/HeistSystem';
import { TrickSystem } from './systems/TrickSystem';
import { BottleSystem } from './systems/BottleSystem';
import { TreasureChart } from './ui/TreasureChart';
import { LeviathanSystem } from './systems/LeviathanSystem';
import { MermaidSystem } from './systems/MermaidSystem';
import { FishingSystem } from './systems/FishingSystem';
import { HarborSystem } from './systems/HarborSystem';
import { RaceSystem } from './systems/RaceSystem';
import { DistressSystem } from './systems/DistressSystem';
import { AircraftSystem } from './systems/AircraftSystem';
import { SeaplaneSystem } from './systems/SeaplaneSystem';
import { SubmarineSystem } from './systems/SubmarineSystem';
import { Underwater } from './rendering/Underwater';
import { WaypointIndicator } from './ui/WaypointIndicator';
import { PhotoMode } from './ui/PhotoMode';
import { MeshRenderable } from './components/MeshRenderable';
import { Transform } from './components/Transform';
import { RigidBody } from './components/RigidBody';
import { BoatControl } from './components/BoatControl';
import { GameConfig } from './state/GameConfig';
import { MissionSystem } from './systems/MissionSystem';
import { QuestLog } from './ui/QuestLog';
import { CampaignState, loadCampaign, newCampaign } from './state/CampaignState';
import { findStoryHarbor, StoryHarbor } from './state/StoryHarbor';

// Reusable scratch vector for per-frame forward/heading math (avoids GC churn).
const _forward = new THREE.Vector3();

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
  private music: GenerativeMusic;
  private postProcessing: PostProcessing;
  private wakeTrail: WakeTrail;
  private bowSpray: BowSpray;
  private bioluminescence: Bioluminescence;
  private moon: Moon;
  private weather: WeatherSystem;
  private aurora: Aurora;
  private boatLights: BoatLights;
  private wildlifeSystem: WildlifeSystem;
  private weaponsSystem: WeaponsSystem;
  private killTracker: KillTracker;
  private discovery = new DiscoveryTracker();
  private journal = new JournalTracker();
  private discoveryTimer = 0;
  private contracts: ContractSystem;
  private returnFire: ReturnFireSystem;
  private commandeer: CommandeerSystem;
  private heists: HeistSystem;
  private tricks: TrickSystem;
  private bottles: BottleSystem;
  private treasureChart: TreasureChart;
  private leviathan: LeviathanSystem;
  private mermaid: MermaidSystem;
  private fishing: FishingSystem;
  private harbor: HarborSystem;
  private races: RaceSystem;
  private distress: DistressSystem;
  private aircraft: AircraftSystem;
  // Story Mode (campaign only) — null in Free Roam.
  private mission: MissionSystem | null = null;
  private questLog: QuestLog | null = null;
  private greyharbor: StoryHarbor | null = null;
  private readonly canFly: boolean;
  private readonly canDive: boolean;
  private underwater: Underwater | null = null;
  private waypoint = new WaypointIndicator();
  private photoMode: PhotoMode;
  private boatEntity: number;
  private elapsedTime = 0;
  private keydownHandler: (e: KeyboardEvent) => void;

  private readonly config: GameConfig;
  private audioVolume = 0.5;
  private audioMuted = false;

  constructor(boatDef: BoatDefinition, config: GameConfig = { mode: 'classic' }) {
    this.config = config;
    this.canFly = boatDef.canFly === true;
    this.canDive = boatDef.canDive === true;
    // Opt-in calm, chosen on the selector and read once here.
    const combatSettings = loadCombatSettings();

    // Restore persisted audio preferences (set by the pause menu / mute key).
    const storedVol = parseFloat(localStorage.getItem('tb-volume') ?? '');
    this.audioVolume = Number.isFinite(storedVol) ? Math.max(0, Math.min(1, storedVol)) : 0.5;
    this.audioMuted = localStorage.getItem('tb-muted') === '1';
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

    // Seaplane flight controller (only acts on a hull with a Flight component)
    const seaplaneSystem = new SeaplaneSystem(this.input, this.chunkManager);
    if (touchControls) seaplaneSystem.setTouchControls(touchControls);
    this.world.addSystem(seaplaneSystem);

    this.windSystem = new WindSystem();
    this.world.addSystem(this.windSystem);

    const buoyancySystem = new BuoyancySystem(this.ocean);
    buoyancySystem.setChunkManager(this.chunkManager); // amphibious hulls hover over land
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

    // Story Mode spawns at the Greyharbor dock, not the world origin.
    if (this.config.campaign && this.config.spawn) {
      const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
      if (t) t.position.set(this.config.spawn.x, 1, this.config.spawn.z);
    }

    // Navigation lights for the player boat
    const boatMesh = this.world.getComponent<MeshRenderable>(this.boatEntity, 'MeshRenderable');
    this.boatLights = new BoatLights(boatMesh!.object3D as THREE.Group, boatDef.meshType);

    // Wildlife & ambient vessels
    this.wildlifeSystem = new WildlifeSystem(this.sceneManager.scene, this.ocean, this.boatEntity);
    this.wildlifeSystem.setChunkManager(this.chunkManager);
    this.world.addSystem(this.wildlifeSystem);

    // Towing (tow-winch upgrade extends hook range)
    const towingSystem = new TowingSystem(
      this.sceneManager.scene, this.ocean, this.boatEntity,
      this.wildlifeSystem,
      hasUpgrade(boatDef.name, 'winch') ? 140 : 80,
    );
    this.world.addSystem(towingSystem);

    // Sound effects (weapon SFX)
    this.soundEffects = new SoundEffects();

    // Submarine dive controller (only acts on a hull with a Dive component) +
    // the underwater render pass. The ▲/▼ touch pad serves both the seaplane
    // (up/down) and the submarine (dive/surface).
    const submarineSystem = new SubmarineSystem(
      this.sceneManager.scene, this.input, this.chunkManager, this.soundEffects,
      { onSonarContact: (text) => this.hud.showToast('📡 Sonar', text) },
    );
    if (touchControls) submarineSystem.setTouchControls(touchControls);
    this.world.addSystem(submarineSystem);
    if (this.canDive) this.underwater = new Underwater(this.sceneManager.scene);
    if (touchControls && (this.canFly || this.canDive)) touchControls.setFlightControlsVisible(true);
    this.soundEffects.setMasterVolume(this.audioVolume);
    this.soundEffects.setMuted(this.audioMuted);

    // Weapons (torpedoes & missiles)
    this.weaponsSystem = new WeaponsSystem(
      this.sceneManager.scene, this.ocean, this.boatEntity,
      this.wildlifeSystem, this.chunkManager,
      this.killTracker, this.soundEffects, this.config, combatSettings,
    );
    this.world.addSystem(this.weaponsSystem);

    // Seagulls near islands
    const seagullSystem = new SeagullSystem(this.sceneManager.scene, this.chunkManager, this.boatEntity);
    this.world.addSystem(seagullSystem);

    // UI
    this.hud = new HUD(this.input, this.killTracker, this.config);
    this.minimap = new Minimap(this.chunkManager);

    // Sinking innocents and darkening beacons stains the permanent ledger
    this.weaponsSystem.onKarma = (delta, reason, journalKey) => this.awardKarma(delta, reason, journalKey);

    // Battleship return fire + limp-home hull damage
    const ownMaxHp = hasUpgrade(boatDef.name, 'hull') ? 4 : ReturnFireSystem.BASE_HP;
    this.returnFire = new ReturnFireSystem(
      this.sceneManager.scene, this.wildlifeSystem, this.soundEffects, this.config,
      {
        onHull: (hp, max) => this.hud.setHull(hp, max),
        onHit: () => this.hud.flashDamage(),
        isSafeHarbor: (x, z) => this.isSafeHarbor(x, z),
      },
      combatSettings,
      ownMaxHp,
    );
    if (this.config.mode === 'classic') {
      this.hud.setHull(this.returnFire.maxHp, this.returnFire.maxHp);
    }

    // Commandeering — pull alongside, press B, sail off with it
    this.commandeer = new CommandeerSystem(
      this.world, this.boatEntity, this.wildlifeSystem, this.ocean,
      boatDef, ownMaxHp,
      {
        onKarma: (delta, reason, journalKey) => this.awardKarma(delta, reason, journalKey),
        onHint: (text) => this.hud.setBoardHint(text),
        setHull: (maxHp) => this.returnFire.setHull(maxHp),
        onNavalAlert: (active) => this.returnFire.setNavalAlert(active),
      },
    );

    // Airtime trick scoring — the wave field is a skate park
    this.tricks = new TrickSystem(this.world, this.boatEntity, this.ocean, {
      onTrick: (credits, headline) => {
        addCredits(credits);
        this.soundEffects.playDiscovery();
        this.hud.showToast('✨ New best air', headline);
      },
    });

    // Cargo heists — F plunders a container; fence it far from the crime
    this.heists = new HeistSystem(this.wildlifeSystem, towingSystem, {
      onKarma: (delta, reason, journalKey) => this.awardKarma(delta, reason, journalKey),
      onBanner: (text) => this.hud.setHeist(text),
      onFence: (payout) => {
        addCredits(payout);
        this.soundEffects.playDiscovery();
        this.hud.showToast('Cargo fenced', `No questions asked · +${payout} cr`);
        const text = this.journal.log('pirate');
        if (text) {
          addCredits(15);
          this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
        }
      },
      onHeat: (stars) => {
        this.hud.setHeat(stars);
        this.returnFire.setHeatLevel(stars);
      },
      isSafeHarbor: (x, z) => this.isSafeHarbor(x, z),
    });

    // Buoy time-trials — gold buoy starts the course, ghost replays your best
    this.races = new RaceSystem(
      this.sceneManager.scene, this.chunkManager,
      boatMesh!.object3D as THREE.Group,
      {
        onTimer: (text) => this.hud.setRaceTimer(text),
        onFinish: (label, headline, reward) => {
          addCredits(reward);
          this.hud.showToast(label, `${headline} · +${reward} cr`);
          this.soundEffects.playDiscovery();
        },
      },
    );

    // Distress calls — rescue burning vessels, tow them to a discovered harbor
    this.distress = new DistressSystem(
      this.sceneManager.scene, this.wildlifeSystem, this.chunkManager,
      {
        onBanner: (text) => this.hud.setDistress(text),
        onComplete: (reward) => {
          // Story Mode grants the beat reward; never double-pay a scripted rescue.
          // (Belt-and-suspenders: scripted mode already skips this callback.)
          if (this.mission?.consumesRescue()) return;
          addCredits(reward);
          addKarma(15);
          this.hud.showToast('Rescue complete', `Survivor safe · +${reward} cr · ⚖️ +15 karma`);
          this.soundEffects.playDiscovery();
          const text = this.journal.log('rescue');
          if (text) {
            addCredits(15);
            this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
          }
        },
        onWhaleFreed: () => {
          this.soundEffects.playDiscovery();
          this.awardKarma(20, 'Freed a tangled whale', 'whale-freed');
        },
        isSafeHarbor: (x, z) => this.isSafeHarbor(x, z),
        nearestHarbor: (x, z) => this.nearestDiscoveredHarbor(x, z),
      },
    );

    // NPC aircraft — coastguard helicopter scrambles to nearby maydays; cargo
    // seaplane drops a salvage crate in a cove now and then
    this.aircraft = new AircraftSystem(
      this.sceneManager.scene, this.ocean, this.chunkManager,
      {
        activeDistress: () => this.distress.getMarker(),
        onCrateCollected: (credits) => {
          addCredits(credits);
          this.soundEffects.playDiscovery();
          this.hud.showToast('📦 Salvage drop', `Recovered an airdrop · +${credits} cr`);
        },
      },
    );

    // Salvage contracts (tow the barge to a named island)
    this.contracts = new ContractSystem(this.wildlifeSystem, this.chunkManager, {
      onBanner: (text) => this.hud.setContract(text),
      onComplete: (destName, payout) => {
        addCredits(payout);
        this.hud.showToast('Contract complete', `${destName} · +${payout} cr`);
        this.soundEffects.playDiscovery();
        bumpContracts();
      },
    });

    // Audio
    this.soundscape = new AmbientSoundscape(boatDef.meshType);
    this.aircraft.setSoundscape(this.soundscape); // rotor/drone fade + pan with distance
    this.soundscape.setMasterVolume(this.audioVolume);
    this.soundscape.setMuted(this.audioMuted);
    this.soundscape.start();

    // Generative ambient soundtrack (starts inside the launch gesture)
    this.music = new GenerativeMusic();
    this.music.setMasterVolume(this.audioVolume);
    this.music.setMuted(this.audioMuted);
    this.music.start();

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

    // Weather (rain, fog, lightning) + rare aurora nights
    this.weather = new WeatherSystem(this.sceneManager.scene);
    this.aurora = new Aurora(this.sceneManager.scene);

    // Photo mode — postcards with the place name and shareable coordinates
    this.photoMode = new PhotoMode({
      capture: () => {
        // Render and read back in the same task (no preserveDrawingBuffer)
        this.postProcessing.render();
        return this.sceneManager.renderer.domElement.toDataURL('image/png');
      },
      getPlaceName: () => {
        const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
        if (!t) return 'Open Ocean';
        let best: { name: string; d: number } | null = null;
        for (const isl of this.chunkManager.getIslandPositions()) {
          const d = Math.hypot(t.position.x - isl.x, t.position.z - isl.z);
          if (d < 300 && (!best || d < best.d)) {
            best = { name: islandName(isl.chunkX, isl.chunkZ, isl.biome), d };
          }
        }
        return best?.name ?? 'Open Ocean';
      },
      getCoords: () => {
        const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
        return { x: t?.position.x ?? 0, z: t?.position.z ?? 0 };
      },
    });

    // The Leviathan — spectacle first, then a storm boss for those who've seen it
    this.leviathan = new LeviathanSystem(
      this.sceneManager.scene, this.ocean, this.wildlifeSystem, this.chunkManager,
      {
        onWitnessed: () => {
          const text = this.journal.log('leviathan');
          if (text) {
            addCredits(15);
            this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
          }
        },
        onBanner: (text) => this.hud.setLeviathan(text),
        onSlam: () => {
          this.returnFire.applyExternalDamage();
          this.soundEffects.playExplosion();
        },
        groan: () => this.soundEffects.playLeviathanGroan(),
      },
    );
    this.weaponsSystem.onLeviathanSlain = () => {
      addCredits(200);
      this.hud.setLeviathan(null);
      this.soundEffects.playDiscovery();
      this.hud.showToast('🐙 The Leviathan is slain', 'Bounty · +200 cr');
      this.awardKarma(15, 'Slew the Leviathan', 'leviathan-slain');
    };

    // The Mermaid of the Arches — heard before she's seen, karma ≥ 0 only
    this.mermaid = new MermaidSystem(
      this.sceneManager.scene, this.ocean, this.chunkManager,
      {
        onSongBegins: () => this.hud.showToast('🎶', 'A strange song drifts over the water…'),
        onGift: (level) => {
          this.soundEffects.playDiscovery();
          if (level === 1) {
            addCredits(120);
            this.hud.showToast('🧜 The mermaid', 'She presses pearls into your hands · +120 cr');
            const text = this.journal.log('mermaid');
            if (text) {
              addCredits(15);
              this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
            }
          } else if (level === 2) {
            this.music.enableMermaidMotif();
            this.hud.showToast('🧜 The mermaid', 'Her melody joins your soundtrack, for good');
          } else {
            this.wildlifeSystem.dolphinAffinity = true;
            this.hud.showToast('🧜 Her blessing', 'Dolphins will seek your bow wake, always');
          }
        },
      },
    );
    // Past gifts persist across sessions
    if (this.mermaid.getLevel() >= 2) this.music.enableMermaidMotif();
    if (this.mermaid.getLevel() >= 3) this.wildlifeSystem.dolphinAffinity = true;
    this.mermaid.song.setMasterVolume(this.audioVolume);
    this.mermaid.song.setMuted(this.audioMuted);

    // Bottled messages + treasure hunts — the chart is the puzzle, no waypoint
    this.treasureChart = new TreasureChart();
    this.bottles = new BottleSystem(this.sceneManager.scene, this.ocean, this.chunkManager, {
      onMap: (map) => {
        this.treasureChart.setMap(map);
        this.soundEffects.playDiscovery();
        this.hud.showToast('🗺️ A torn chart', 'Press V — find the island by its shape');
      },
      onStory: (story) => {
        this.hud.showToast('📜 Message in a bottle', story);
        this.soundEffects.playDiscovery();
      },
      onTreasure: (reward) => {
        this.treasureChart.setMap(null);
        addCredits(reward);
        this.soundEffects.playDiscovery();
        this.hud.showToast('⚒️ Treasure', `The chest surfaces · +${reward} cr`);
        const text = this.journal.log('treasure');
        if (text) {
          addCredits(15);
          this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
        }
      },
    });
    this.treasureChart.setMap(this.bottles.getMap()); // resume a persisted hunt

    // Fishing — the calm verb (C to cast/reel)
    this.fishing = new FishingSystem(this.sceneManager.scene, this.ocean, this.chunkManager, localStorage, {
      onPrompt: (text) => this.hud.setFishing(text),
      onMeter: (state) => this.hud.setFishingMeter(state),
      onLanded: (species, value, weight, firstOfSpecies) => {
        addCredits(value);
        this.soundEffects.playDiscovery();
        const note = firstOfSpecies ? ' · new species!' : '';
        this.hud.setFishing(`🐟 Landed a ${species.name} (${weight}kg) · +${value} cr${note}`);
        const text = this.journal.log('angler');
        if (text) {
          addCredits(15);
          this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
        }
      },
    });

    // Harbour towns — dock at a discovered island (L) to buy the rod & hear rumours
    this.harbor = new HarborSystem(this.chunkManager, this.discovery, localStorage, {
      onPrompt: (text) => this.hud.setDock(text),
      onPurchase: () => {
        this.soundEffects.playDiscovery();
        this.hud.showToast('Harbour', "Angler's Rod acquired · press C to fish");
      },
    });

    // Story Mode — the scripted-campaign layer. Constructed ONLY when
    // config.campaign, so a Free Roam engine hits zero of this code.
    if (this.config.campaign) {
      this.greyharbor = findStoryHarbor();
      // Load chunks around the campaign spawn so Greyharbor exists in
      // getHarbors(), and pre-discover it so it's dockable from the start.
      const spawnX = this.config.spawn?.x ?? 0;
      const spawnZ = this.config.spawn?.z ?? 0;
      this.chunkManager.update(spawnX, spawnZ);
      if (this.greyharbor) this.discovery.discover(this.greyharbor.chunkX, this.greyharbor.chunkZ);

      const state: CampaignState = loadCampaign() ?? newCampaign();
      this.questLog = new QuestLog();
      this.mission = new MissionSystem({
        state,
        quest: this.questLog,
        journal: this.journal,
        scene: this.sceneManager.scene,
        ocean: this.ocean,
        greyharbor: this.greyharbor
          ? { x: this.greyharbor.x, z: this.greyharbor.z, dock: this.greyharbor.dock }
          : { x: spawnX, z: spawnZ, dock: { x: spawnX, z: spawnZ } },
        hud: { showToast: (l, h) => this.hud.showToast(l, h) },
        wildlife: this.wildlifeSystem,
        towing: towingSystem,
        distress: this.distress,
        sonarPing: () => this.soundEffects.playSonarPing(),
        getBoatPos: () => {
          const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
          return { x: t?.position.x ?? 0, z: t?.position.z ?? 0, y: t?.position.y ?? 0 };
        },
        isInBoat: (name) => boatDef.name === name,
      });
    }

    // Keyboard toggles (stored for cleanup)
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyX') {
        this.toggleMute();
      }
      if (e.code === 'KeyN') {
        this.minimap.toggle();
      }
      if (e.code === 'KeyP') {
        this.photoMode.toggle();
      }
      if (e.code === 'KeyV') {
        this.treasureChart.toggle();
      }
      if (e.key === '/' || e.key === '?') {
        this.hud.toggleControls();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

    // Game loop
    this.gameLoop = new GameLoop((dt) => this.update(dt));

    // Initial chunk load — around the campaign spawn if any, else the origin.
    this.chunkManager.update(this.config.spawn?.x ?? 0, this.config.spawn?.z ?? 0);

    // Arm the first story beat (after the loop + chunks are ready).
    this.mission?.start();

    // Teach the non-obvious seaplane takeoff
    if (this.canFly) {
      this.hud.showToast('✈ Seaplane', 'Open the throttle, then hold Space to lift off');
    }
    if (this.canDive) {
      this.hud.showToast('🤿 Submarine', 'Hold ▼ (Shift) to dive · ▲ (Space) to surface');
    }
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

      // Storms raise the sea state — rendering and physics together
      this.ocean.setStormScale(1 + this.weather.getRainIntensity() * 0.9);

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

      // Update wake trail — only near the surface, so there's no wake in the sky
      // (seaplane airborne) or in the deep (submarine submerged).
      if (boatRb && boatTransform.position.y < 3 && boatTransform.position.y > -2) {
        const speed = Math.abs(boatRb.velocity.dot(_forward.set(0, 0, 1).applyQuaternion(boatTransform.quaternion)));
        this.wakeTrail.update(boatTransform.position, boatTransform.quaternion, speed, dt);
        this.bowSpray.update(dt, boatTransform.position, boatTransform.quaternion, speed);
        this.bioluminescence.update(dt, boatTransform.position, boatTransform.quaternion, speed, sunDir.y);
      }

      // Underwater render pass — tint by the camera's depth, seabed under the sub.
      if (this.underwater) {
        this.underwater.update(this.sceneManager.camera.position.y, boatTransform.position.x, boatTransform.position.z);
      }

      // Update weapon effects (torpedo wakes, explosions)
      this.weaponsSystem.updateEffects(dt);

      // Salvage contracts (generation, banner, delivery detection)
      this.contracts.update(dt, boatTransform.position.x, boatTransform.position.z);

      // Distress calls (spawn, smoke, rescue detection)
      // horizontal speed only — wave heave would read as "moving" while holding station
      this.distress.update(dt, boatTransform.position.x, boatTransform.position.z,
        boatRb ? Math.hypot(boatRb.velocity.x, boatRb.velocity.z) : 0);

      // NPC aircraft — helicopter rides the active mayday, seaplane drops crates
      _forward.set(0, 0, 1).applyQuaternion(boatTransform.quaternion);
      this.aircraft.update(
        dt, boatTransform.position.x, boatTransform.position.z,
        Math.atan2(_forward.x, _forward.z),
      );

      // Battleship return fire + hull repair
      const ctrl = this.world.getComponent<BoatControl>(this.boatEntity, 'BoatControl');
      if (boatRb && ctrl) {
        this.returnFire.update(dt, boatTransform, boatRb, ctrl);
      }

      // Boarding prompts + hull swaps
      this.commandeer.update(dt);

      // Heists: plunder requests, fence detection, naval heat
      this.heists.update(dt, boatTransform.position.x, boatTransform.position.z);

      // Airtime tricks (not the seaplane/sub — flight & diving aren't wave-hops)
      if (!this.canFly && !this.canDive) this.tricks.update(dt);

      // Bottles bob, get collected, and the dig check
      this.bottles.update(dt, boatTransform.position.x, boatTransform.position.z);

      // The Leviathan stirs in deep-water storms
      this.leviathan.update(dt, boatTransform.position.x, boatTransform.position.z, this.weather.getRainIntensity());

      // The mermaid sings on clear calm nights; her pan/gain track per frame
      this.mermaid.update(
        dt, boatTransform.position.x, boatTransform.position.z,
        new THREE.Euler().setFromQuaternion(boatTransform.quaternion, 'YXZ').y,
        sunDir.y, this.weather.getRainIntensity(),
      );

      // Fishing — cast/bite/fight state machine
      this.fishing.update(
        dt, boatTransform.position.x, boatTransform.position.z,
        boatRb ? Math.hypot(boatRb.velocity.x, boatRb.velocity.z) : 0,
        sunDir.y < -0.1, this.weather.getRainIntensity() > 0.5,
      );

      // Harbour towns — dock prompt + notice board
      this.harbor.update(
        dt, boatTransform.position.x, boatTransform.position.z,
        boatRb ? Math.hypot(boatRb.velocity.x, boatRb.velocity.z) : 0,
      );

      // Time-trials (start detection, gates, ghost replay)
      this.races.update(dt, boatTransform);

      // Story Mode — arm/complete/advance the active beat (campaign only).
      // After the ambient encounter systems: scripted modes never fire their
      // own ambient callbacks, so order is safe.
      this.mission?.update(dt);

      // Island discovery + best-kills high-water mark, throttled to 2Hz —
      // neither needs frame-rate precision and both touch localStorage.
      this.discoveryTimer += dt;
      if (this.discoveryTimer >= 0.5) {
        this.discoveryTimer = 0;
        const found = this.discovery.check(
          boatTransform.position.x,
          boatTransform.position.z,
          this.chunkManager.getIslandPositions(),
        );
        if (found) {
          addCredits(10);
          this.hud.showToast('Discovered', `${islandName(found.chunkX, found.chunkZ, found.biome)} · +10 cr`);
          this.soundEffects.playDiscovery();
        }
        bumpBestKills(this.killTracker.total);

        // Field journal sightings (same 2Hz cadence)
        if (boatRb) this.checkJournal(boatTransform, boatRb, sunDir.y);

        // Soundtrack mood: storm darkens, night thins, battleships add a pulse
        const dangerNear = this.wildlifeSystem.getBattleships().some((b) =>
          Math.hypot(b.mesh.position.x - boatTransform.position.x, b.mesh.position.z - boatTransform.position.z) < 300);
        this.music.setMood(this.weather.getRainIntensity(), sunDir.y < -0.05, dangerNear);
      }
    }

    // Update moon, boat lights, and aurora
    this.moon.update(sunDir, sunDir.y);
    this.boatLights.update(sunDir.y);
    this.aurora.update(dt, this.sceneManager.camera.position, sunDir.y, this.weather.getRainIntensity());

    // Update HUD
    this.hud.update(this.world, this.boatEntity, this.windSystem, dt);

    // Update minimap — compute heading from forward vector (immune to pitch/roll)
    if (boatTransform) {
      _forward.set(0, 0, 1).applyQuaternion(boatTransform.quaternion);
      const heading = Math.atan2(_forward.x, _forward.z);
      this.minimap.update(
        boatTransform.position.x,
        boatTransform.position.z,
        heading,
        this.wildlifeSystem.getWildlifePositions(),
        this.mission?.getMarker() ?? this.distress.getMarker() ?? this.contracts.getMarker(),
      );

      // Screen-space waypoint to the active objective (campaign beat first,
      // then rescue, then contract).
      this.waypoint.update(
        this.sceneManager.camera,
        this.mission?.getMarker() ?? this.distress.getMarker() ?? this.contracts.getMarker(),
        boatTransform.position.x,
        boatTransform.position.z,
      );
    }

    // Update ambient audio + soundtrack timers
    this.music.update(dt);
    this.soundscape.update(this.windSystem.strength, false, dt, this.weather.getRainIntensity());
    const boatCtrl = this.world.getComponent<BoatControl>(this.boatEntity, 'BoatControl');
    if (boatCtrl) {
      this.soundscape.updateEngine(boatCtrl.throttle, dt);
    }

    // Render with post-processing
    this.postProcessing.render();
  }

  /** Safe harbor = the calm shallows of any *discovered* island. */
  private isSafeHarbor(x: number, z: number): boolean {
    for (const isl of this.chunkManager.getIslandPositions()) {
      if (!this.discovery.isDiscovered(isl.chunkX, isl.chunkZ)) continue;
      if (Math.hypot(x - isl.x, z - isl.z) < isl.radius + 80) return true;
    }
    return false;
  }

  private nearestDiscoveredHarbor(x: number, z: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestDist = Infinity;
    for (const isl of this.chunkManager.getIslandPositions()) {
      if (!this.discovery.isDiscovered(isl.chunkX, isl.chunkZ)) continue;
      const d = Math.hypot(x - isl.x, z - isl.z);
      if (d < bestDist) {
        bestDist = d;
        best = { x: isl.x, z: isl.z };
      }
    }
    return best;
  }

  /** First-time wildlife/moment sightings → field journal toast + bell. */
  /** Apply a karma change with a toast; optionally log a journal entry (good or shameful). */
  private awardKarma(delta: number, reason: string, journalKey?: string): void {
    addKarma(delta);
    this.hud.showToast(`⚖️ Karma ${delta > 0 ? '+' : ''}${delta}`, reason);
    if (journalKey) {
      const text = this.journal.log(journalKey);
      if (text) {
        addCredits(15);
        this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
      }
    }
  }

  private checkJournal(boatTransform: Transform, boatRb: RigidBody, sunY: number): void {
    const bx = boatTransform.position.x;
    const bz = boatTransform.position.z;
    const speed = boatRb.velocity.length();
    const hits: string[] = [];

    // getJournalPositions excludes mission-owned vessels (Story Mode); it equals
    // getWildlifePositions in Free Roam, so this scan is unchanged there.
    for (const w of this.wildlifeSystem.getJournalPositions()) {
      const dist = Math.hypot(w.x - bx, w.z - bz);
      if (w.type === 'dolphin' && dist < 15 && speed > 3) hits.push('dolphins');
      else if (w.type === 'whale' && dist < 60) hits.push('whale');
      else if (w.type === 'fishing_boat' && dist < 60) hits.push('fishing');
      else if (w.type === 'cargo_ship' && dist < 80) hits.push('cargo');
      else if (w.type === 'battleship' && dist < 150) hits.push('battleship');
    }
    if (sunY < -0.1) hits.push('night');
    if (this.weather.getRainIntensity() > 0.8) hits.push('storm');
    if (this.aurora.isActive()) hits.push('aurora');
    for (const lm of this.chunkManager.getLandmarks()) {
      const dist = Math.hypot(lm.x - bx, lm.z - bz);
      if (lm.type === 'wrecks' && dist < 70) hits.push('wrecks');
      else if (lm.type === 'arch' && dist < 30) hits.push('arch');
    }

    for (const key of hits) {
      const text = this.journal.log(key);
      if (text) {
        addCredits(15);
        this.hud.showToast(`Field Journal · ${this.journal.count()}/${JOURNAL_TOTAL}`, `${text} · +15 cr`);
        this.soundEffects.playDiscovery();
      }
    }
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
    this.soundscape.suspend();
    this.soundEffects.suspend();
    this.music.suspend();
    this.mermaid.song.suspend();
  }

  resume(): void {
    this.gameLoop.resume();
    this.soundscape.resume();
    this.soundEffects.resume();
    this.music.resume();
    this.mermaid.song.resume();
  }

  /** 0..1 master volume; persisted and applied to both audio engines. */
  setVolume(v: number): void {
    this.audioVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem('tb-volume', String(this.audioVolume));
    this.soundscape.setMasterVolume(this.audioVolume);
    this.soundEffects.setMasterVolume(this.audioVolume);
    this.music.setMasterVolume(this.audioVolume);
    this.mermaid.song.setMasterVolume(this.audioVolume);
  }

  setMuted(muted: boolean): void {
    this.audioMuted = muted;
    localStorage.setItem('tb-muted', muted ? '1' : '0');
    this.soundscape.setMuted(muted);
    this.soundEffects.setMuted(muted);
    this.music.setMuted(muted);
    this.mermaid.song.setMuted(muted);
  }

  toggleMute(): boolean {
    this.setMuted(!this.audioMuted);
    return this.audioMuted;
  }

  getVolume(): number {
    return this.audioVolume;
  }

  isMuted(): boolean {
    return this.audioMuted;
  }

  dispose(): void {
    // Stop game loop
    this.gameLoop.stop();

    // Remove keyboard handler
    window.removeEventListener('keydown', this.keydownHandler);

    // Story Mode teardown FIRST — MissionSystem removes its scripted entities
    // and pickup props (which live in the scene / wildlife roster) before those
    // subsystems are torn down below.
    this.mission?.dispose();
    this.questLog?.dispose();

    // Tear down ECS systems — each removes its own listeners + GPU resources
    // (WeaponsSystem/TowingSystem keydown handlers, weapon effect buffers, etc.)
    this.world.dispose();

    // Tear down non-ECS managers that hold window listeners / render targets
    this.input.dispose();
    this.postProcessing.dispose();
    this.hud.dispose();
    this.returnFire.dispose();
    this.races.dispose();
    this.distress.dispose();
    this.aircraft.dispose();
    this.underwater?.dispose();
    this.commandeer.dispose();
    this.heists.dispose();
    this.bottles.dispose();
    this.treasureChart.dispose();
    this.leviathan.dispose();
    this.mermaid.dispose();
    this.fishing.dispose();
    this.harbor.dispose();
    this.waypoint.dispose();
    this.aurora.dispose();
    this.photoMode.dispose();

    // Stop audio
    this.soundscape.stop();
    this.soundEffects.stop();
    this.music.stop();

    // Dispose every remaining renderable in the scene — NOT just Mesh.
    // Points / Line / Sprite (particles, wakes, stars, moon, rain) are not Mesh
    // subclasses, so a Mesh-only filter would leak all of their geometry + shaders.
    this.sceneManager.scene.traverse((obj) => {
      const o = obj as unknown as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      o.geometry?.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });

    // Remove dynamically created DOM elements (idempotent safety net; systems
    // already remove their own buttons in dispose()).
    document.getElementById('torpedo-button')?.remove();
    document.getElementById('missile-button')?.remove();
    document.getElementById('tow-button')?.remove();
    document.getElementById('touch-controls')?.remove();

    // Remove the renderer's canvas
    const canvas = this.sceneManager.renderer.domElement;
    canvas.parentElement?.removeChild(canvas);

    // Dispose renderer + remove SceneManager's own resize listener
    this.sceneManager.dispose();
  }
}
