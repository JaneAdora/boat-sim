import * as THREE from 'three';
import type { Ocean } from '../rendering/Ocean';
import {
  CampaignState,
  currentBeat,
  isComplete,
  markCompleted,
  advanceBeat,
  unlockBoat,
  setFlag,
  saveCampaign,
} from '../state/CampaignState';
import type { StoryBeat, EncounterSpec } from '../state/StoryBeats';
import type { MissionInstance } from '../components/MissionInstance';
import { addCredits } from '../state/Wallet';
import { addKarma } from '../state/Karma';
import type { JournalTracker } from '../state/JournalTracker';
import type { QuestLog } from '../ui/QuestLog';
import type { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import type { TowingSystem } from './TowingSystem';
import type { DistressSystem } from './DistressSystem';
import type { MermaidSystem } from './MermaidSystem';
import type { LeviathanSystem } from './LeviathanSystem';
import type { WeatherSystem } from '../rendering/WeatherSystem';
import { LureCounter } from '../state/LureCounter';
import { MultiPickup } from '../state/MultiPickup';
import { SoulTransport } from '../state/SoulTransport';
import { HoldTimer } from '../state/HoldTimer';
import { RescueSequence } from '../state/RescueSequence';
import { SongAnswer, type SongViolation } from '../state/SongAnswer';
import { SOUL_NAMES } from '../state/StoryBeatsAct2';
import type { SoulId } from '../state/CampaignState';
import { TRENCH, TRENCH_ACT3, inBand, setEra } from '../world/TrenchProfile';
import {
  createWreckHull,
  createSoulSprite,
  createRecoveryVessel,
  createDrownedHamlet,
  createBellBuoy,
  createMermaidSilhouette,
  createGuardianSerpent,
  createDeepPresence,
  createMoteRing,
  WARM_GOLD,
  disposeGroup,
} from '../props/StoryProps';
import type { InterludeCard } from '../ui/StoryInterlude';

/**
 * Which storyboard plate (public/story/panel-NN.jpg) plays at each beat
 * boundary. 'begin' cards show the beat's brief; 'complete' cards show its
 * successLine. Plate 01 (the Greyharbor title card) fires once on a fresh
 * campaign; beat 8 has no card — the finale stays pure gameplay.
 */
const INTERLUDE_PLATES: Record<string, { begin?: number; complete?: number }> = {
  'empty-berth': { begin: 2, complete: 3 },
  'message-swell': { complete: 4 },
  'reef-wrecks': { complete: 5 },
  'souls-water': { begin: 6, complete: 7 },
  'down-dark': { complete: 8 },
  'mermaid-warning': { complete: 9 },
  witness: { complete: 10 },
  // ── Act 2 (plates 11–18 from the storyboard's second act) ──
  'tide-stayed': { begin: 11 },
  exodus: { complete: 12 },
  'deep-refit': { complete: 13 },
  'into-trench': { complete: 14 },
  'drowned-choir': { complete: 15 },
  'old-enemy': { complete: 16 },
  'king-tide': { begin: 17 },
  'drowned-light': { begin: 18 },
};

const plateUrl = (n: number): string => `/story/panel-${String(n).padStart(2, '0')}.jpg`;

/** Live coaching for the slow deep passes — beat 16's lines, reused verbatim
 *  by beat 20's gates (the plan: same feedback semantics, gate after gate). */
const SONG_COACHING: Record<SongViolation, string | null> = {
  none: null,
  outside: null, // the marker already leads there
  'too-fast': 'Slow. Approach like a prayer.',
  'too-shallow': 'Deeper — the song is below you.',
  'too-deep': 'Ease up — hold inside the song.',
};

export interface MissionDeps {
  state: CampaignState;
  quest: QuestLog;
  journal: JournalTracker;
  scene: THREE.Scene;
  ocean: Ocean;
  greyharbor: { x: number; z: number; dock: { x: number; z: number } };
  hud: { showToast(label: string, headline: string): void };
  wildlife: WildlifeSystem;
  towing: TowingSystem;
  distress: DistressSystem;
  mermaid: MermaidSystem;
  leviathan: LeviathanSystem;
  weather: WeatherSystem;
  /** A clean sonar 'pong' on first reef contact (beat 5). */
  sonarPing(): void;
  /** The drowned bell's slow strike (Act 2 beat 9). */
  bellToll(): void;
  /** Night gate for the exodus mermaid (Act 2 beat 10). */
  isNight(): boolean;
  /** The Leviathan's answering call (Act 2 finale, mercy branch). */
  deepCall(): void;
  /** Act 3: the blocking mid-beat ask (beat 22). Resolves the chosen index;
   *  rejects with 'cancelled' if the ask is closed by a beat change. */
  choice(title: string, line: string, options: string[]): Promise<number>;
  /** Close any pending ask — called on every disarm/dispose. */
  cancelChoice(): void;
  /** Current boat speed, engine units (Act 2 finale: calm-approach check). */
  getBoatSpeed(): number;
  /** No-weapons mode (tb-disarmed): the finale is won by luring, not sinking. */
  disarmed: boolean;
  getBoatPos(): { x: number; z: number; y: number };
  isInBoat(name: string): boolean;
  /** Full-screen story cards at beat boundaries (see INTERLUDE_PLATES). */
  interlude: { show(card: InterludeCard): void; preload(image: string): void };
}

/**
 * The scripted-encounter layer for Story Mode ("The Vanishing Tide").
 *
 * A plain class (NOT an ECS System) owned by Engine and ticked manually in
 * Engine.update — and ONLY when config.campaign. It reads CampaignState, arms
 * the active beat (spawning mission-owned encounters at fixed coordinates and
 * suspending the conflicting ambient trigger), detects completion against the
 * exact mission instance, grants the beat reward ONCE, advances, and persists.
 *
 * Unifying rule (binding): scripted encounters are fully mission-owned. This
 * system is the SOLE granter of credits/karma/journal for story beats; the
 * scripted per-system modes never fire their ambient completion/reward paths.
 *
 * Encounter spawn/complete/disarm bodies are filled per beat in Task 9
 * (tow/pickup/rescue) and Milestone 2 (sonar/mermaid/leviathan).
 */
export class MissionSystem {
  private marker: { x: number; z: number } | null = null;
  /** The active mission-owned encounter object (vessel or prop), if any. */
  private instance: MissionInstance | null = null;
  /** A floating pickup prop (beats 2, 3) — bobs on the ocean surface. */
  private prop: THREE.Group | null = null;
  /** Set once a scripted-rescue vessel has been hooked, so completion only
   *  fires after the player tows it (not by spawning already-clear). */
  private rescueHooked = false;
  /** Beat 5: the sonar 'pong'/contact toast fires once on first reef contact. */
  private sonarPinged = false;
  /** Beat 7: the scripted spectacle triggers once, when the player first reaches
   *  the trench (it then plays out and completes on its own animation end). */
  private spectacleTriggered = false;
  /** Beat 8 (armed path): set when the scripted boss is slain (WeaponsSystem →
   *  Engine.onLeviathanSlain → onLeviathanDefeated). complete() reads it. */
  private leviathanDefeated = false;
  /** Beat 8 (no-weapons path): the pure lure-pass counter. */
  private lure = new LureCounter();
  /** Beat 1: the "press G to tow" hint shows once when first near the Marigold. */
  private towHintShown = false;
  /** Beat 5: one-time "swap boats via ESC" hint when idling at the dock in the
   *  wrong boat — the swap mechanism is otherwise never explained. */
  private swapHintShown = false;
  /** Beat 5: one-time "dive deeper" nudge when over the reef but too shallow. */
  private diveHintShown = false;
  /** Beat 8 (lure path): last banked pass count, for progress toasts. */
  private lastLurePasses = 0;
  // ── Act 2 encounter state ──
  /** Beat 11: the salvage machine + one prop per uncollected piece. */
  private multi: MultiPickup | null = null;
  private multiProps = new Map<string, THREE.Group>();
  /** Beat 12: slow sonar cadence while closing on the trench. */
  private deepPingTimer = 0;
  /** Beat 13: the soul machine, hamlet dressing, and the carried glow. */
  private soulRun: SoulTransport | null = null;
  private soulProps = new Map<string, THREE.Group>();
  private hamletProp: THREE.Group | null = null;
  private recoveryProp: THREE.Group | null = null;
  private carryGlow: THREE.Group | null = null;
  /** Beat 9: the drowned bell out on the flats, tolling to no one. */
  private bellProp: THREE.Group | null = null;
  private bellTimer = 0;
  /** Beat 10: the mermaid waits for dark; her people leave when she sings. */
  private exodusStarted = false;
  private exodusSwimmers: { group: THREE.Group; vx: number; vz: number; age: number }[] = [];
  /** Beat 14: the mission-owned hold clock (authoritative for both branches). */
  private hold: HoldTimer | null = null;
  private holdEntered = false;
  private holdMidpointToasted = false;
  /** Beat 15: the storm-rescue sequencer. */
  private rescueSeq: RescueSequence | null = null;
  /** Beat 16: the finale — the song machine, the presence, and (mercy) the
   *  answering serpent on its fixed circuit. */
  private song: SongAnswer | null = null;
  private presenceProp: THREE.Group | null = null;
  private callSerpent: THREE.Group | null = null;
  private callAngle = 0;
  private lastSongViolation: SongViolation = 'none';
  private songToastAt = -10;
  // ── Act 3 encounter state ──
  /** Beat 20: the maelstrom's slow spiral (the song machine is reused). */
  private moteRing: THREE.Group | null = null;
  private time = 0;

  constructor(private d: MissionDeps) {}

  start(): void {
    // A brand-new campaign opens on the Greyharbor title plate before beat 1's
    // own card — the pair reads as the story's cold open.
    if (this.d.state.beat === 0 && this.d.state.completed.length === 0) {
      this.showPlate(1, 'Greyharbor', 'The eastern boats aren’t coming home.');
    }
    this.armCurrent();
  }

  /** Show a storyboard plate once per campaign (seen-flags persist in the
   *  save). Returns false if it was already seen (caller falls back to toast). */
  private showPlate(n: number, title: string, line: string): boolean {
    const key = `il${String(n).padStart(2, '0')}`;
    if (this.d.state.flags[key]) return false;
    setFlag(this.d.state, key);
    saveCampaign(this.d.state);
    this.d.interlude.show({ image: plateUrl(n), title, line });
    return true;
  }

  /** True when the armed beat names a boat the player isn't in. Generalized
   *  (Act 2 plan, stage 0): EVERY requiresBoat beat gets dock routing, the ESC
   *  swap hint, and a completion guard — not just sonar-contact. */
  private requiresBoatUnmet(beat: StoryBeat): boolean {
    return !!beat.requiresBoat && !this.d.isInBoat(beat.requiresBoat);
  }

  getMarker(): { x: number; z: number } | null {
    // While a boat-gated leg is armed but the player is in the wrong boat,
    // steer them back to the Greyharbor dock to swap — never at an objective
    // they can't reach.
    const beat = currentBeat(this.d.state);
    if (beat && this.requiresBoatUnmet(beat)) {
      return { x: this.d.greyharbor.dock.x, z: this.d.greyharbor.dock.z };
    }
    // Beat 1: once the Marigold is on the tow line, steer home to the dock;
    // before she's hooked, track the derelict herself.
    if (beat?.encounter.kind === 'tow-derelict') {
      const vessel = this.instance?.ref as WildlifeEntity | undefined;
      if (vessel) {
        if (this.d.towing.getTowedEntity() === vessel) {
          return { x: this.d.greyharbor.dock.x, z: this.d.greyharbor.dock.z };
        }
        return { x: vessel.mesh.position.x, z: vessel.mesh.position.z };
      }
    }
    // Beat 11: nearest uncollected salvage, then home to the dock.
    if (beat?.encounter.kind === 'multi-pickup' && this.multi) {
      if (this.multi.allCollected()) {
        return { x: this.d.greyharbor.dock.x, z: this.d.greyharbor.dock.z };
      }
      const b = this.d.getBoatPos();
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const p of beat.encounter.points) {
        if (this.multi.isCollected(p.id)) continue;
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < bestD) {
          bestD = d;
          best = { x: p.x, z: p.z };
        }
      }
      return best ?? this.marker;
    }
    // Beat 13: the hamlet below (and the recovery vessel above it — same column).
    if (beat?.encounter.kind === 'soul-transport') {
      return { x: beat.encounter.hamlet.x, z: beat.encounter.hamlet.z };
    }
    // Beat 16: the marker leads to the current song point.
    if (beat?.encounter.kind === 'song-answer' && this.song) {
      const idx = this.song.currentPoint();
      if (idx !== null) {
        const p = beat.encounter.points[idx];
        return { x: p.x, z: p.z };
      }
    }
    // Beat 20: the marker leads gate to gate, down the spiral.
    if (beat?.encounter.kind === 'descent-gates' && this.song) {
      const idx = this.song.currentPoint();
      if (idx !== null) {
        const gate = beat.encounter.gates[idx];
        return { x: gate.x, z: gate.z };
      }
    }
    // Beat 15: track the current stage's vessel; once hooked, point to clear
    // water past the safe radius (the clearPoint pattern from beat 4).
    if (beat?.encounter.kind === 'rescue-sequence' && this.rescueSeq) {
      const stage = this.rescueSeq.currentStage();
      if (stage != null) {
        const p = beat.encounter.points[stage];
        const vessel = this.d.distress.getScriptedVessel();
        if (vessel) {
          if (this.d.towing.getTowedEntity() === vessel) {
            return this.clearPoint(p, beat.encounter.safeRadius);
          }
          return { x: vessel.mesh.position.x, z: vessel.mesh.position.z };
        }
        return { x: p.x, z: p.z };
      }
    }
    // Beat 4: after the foundering vessel is hooked, point to clear water (toward
    // home, past the danger radius); before that, track the vessel at the mayday.
    if (beat?.encounter.kind === 'rescue') {
      const vessel = this.d.distress.getScriptedVessel();
      if (vessel) {
        if (this.d.towing.getTowedEntity() === vessel) {
          return this.clearPoint(beat.encounter.spawn, beat.encounter.safeRadius);
        }
        return { x: vessel.mesh.position.x, z: vessel.mesh.position.z };
      }
    }
    return this.marker;
  }

  /** A point in clear water past the danger radius, toward Greyharbor — where to
   *  tow a rescued vessel so the survivors are safe. */
  private clearPoint(spawn: { x: number; z: number }, safeRadius: number): { x: number; z: number } {
    const dock = this.d.greyharbor.dock;
    const dx = dock.x - spawn.x;
    const dz = dock.z - spawn.z;
    const len = Math.hypot(dx, dz) || 1;
    const r = safeRadius + 40;
    return { x: spawn.x + (dx / len) * r, z: spawn.z + (dz / len) * r };
  }

  /** R10: the coastguard heli scrambles to the trench through the finale (beats 7
   *  & 8) so it circles the Leviathan; null otherwise (it falls back to the
   *  ambient distress marker). */
  getAircraftMarker(): { x: number; z: number } | null {
    const beat = currentBeat(this.d.state);
    if (!beat) return null;
    const k = beat.encounter.kind;
    if (k !== 'leviathan-witness' && k !== 'leviathan-boss') return null;
    return { x: beat.encounter.spawn.x, z: beat.encounter.spawn.z };
  }

  /** True while the campaign owns an active rescue (beat 4) — the Engine's
   *  ambient rescue onComplete early-outs so only the beat reward is paid. */
  consumesRescue(): boolean {
    const beat = currentBeat(this.d.state);
    return !!beat && beat.id === 'souls-water' && this.d.state.armedBeat === this.d.state.beat;
  }

  /** True while the campaign owns the scripted boss (beat 8 armed) — the Engine's
   *  ambient onLeviathanSlain reward is suppressed so only the beat reward pays.
   *  Mirrors consumesRescue (R9). */
  consumesLeviathan(): boolean {
    const beat = currentBeat(this.d.state);
    return (
      !!beat &&
      beat.id === 'vanishing-tide' &&
      this.d.state.armedBeat === this.d.state.beat
    );
  }

  /** The scripted boss was slain (armed path). Records the kill so the next
   *  complete() poll finishes the beat with the BEAT reward (not the ambient
   *  200cr). Routed from Engine.onLeviathanSlain when consumesLeviathan(). */
  onLeviathanDefeated(): void {
    this.leviathanDefeated = true;
  }

  /** Whether a runtime object is the active mission-owned instance (so the
   *  Engine's ambient journal/despawn scans can skip it). */
  isMissionOwned(ref: object): boolean {
    return this.instance !== null && this.instance.ref === ref;
  }

  private armCurrent(): void {
    const beat = currentBeat(this.d.state);
    if (!beat) {
      this.marker = null;
      this.d.quest.clear();
      return;
    }
    this.d.state.armedBeat = this.d.state.beat;
    // R3: if this leg needs a boat the player isn't currently in, the objective
    // nudges them to swap (the marker — getMarker — points back to the dock).
    // The swap lives behind ESC, which nothing else teaches — say so here.
    const wrongBoat = this.requiresBoatUnmet(beat);
    let objective = beat.objective;
    if (wrongBoat) objective = `Take the ${beat.requiresBoat} out — press ESC to change boats.`;
    // No-weapons finale: the objective leads with the lure, not the fight.
    else if (beat.encounter.kind === 'leviathan-boss' && this.d.disarmed)
      objective = 'Lure the Leviathan: draw it close to the trench, then pull away. Three passes.';
    this.d.quest.set(beat.title, objective);
    // The beat's begin-card (if it has one and it hasn't played) replaces the
    // brief toast; on reloads the seen-flag skips the card and the toast fires.
    const plates = INTERLUDE_PLATES[beat.id];
    const cardShown = plates?.begin
      ? this.showPlate(plates.begin, beat.title, beat.brief)
      : false;
    if (!cardShown) this.d.hud.showToast(beat.title, beat.brief);
    if (plates?.complete) this.d.interlude.preload(plateUrl(plates.complete));
    this.arm(beat);
    saveCampaign(this.d.state);
  }

  /** Arm generation — bumps on every arm/disarm so async resolutions (the
   *  keeper ask) can prove they belong to the currently armed beat. */
  private armGen = 0;

  private arm(beat: StoryBeat): void {
    const e = beat.encounter;
    this.armGen++;
    // Depth era: the trench deepens ONLY while an Act 3 descent beat (authored
    // beat ≥ 20, zero-based index ≥ 19) is armed; every disarm resets to act2,
    // so no path can leave the deep era active outside the maelstrom.
    setEra(this.d.state.beat >= 19 ? 'act3' : 'act2');
    if ('spawn' in e) this.marker = { x: e.spawn.x, z: e.spawn.z };
    else if (e.kind === 'multi-pickup') this.marker = { x: e.points[0].x, z: e.points[0].z };
    else if (e.kind === 'soul-transport') this.marker = { x: e.hamlet.x, z: e.hamlet.z };
    this.deepPingTimer = 0;
    this.rescueHooked = false;
    this.sonarPinged = false;
    this.spectacleTriggered = false;
    this.towHintShown = false;
    this.swapHintShown = false;
    this.diveHintShown = false;
    this.lastLurePasses = 0;

    switch (e.kind) {
      case 'tow-derelict': {
        // Mission-owned derelict (spawnDistressedVessel sets maxAge:Infinity, so
        // it won't ambient-despawn). Tow it home to the Greyharbor dock.
        // Untargetable: an armed player must not be able to sink the objective.
        const vessel = this.d.wildlife.spawnDistressedVessel(e.spawn.x, e.spawn.z);
        this.d.wildlife.setMissionOwned(vessel, true);
        this.d.wildlife.setUntargetable(vessel);
        this.instance = { beatId: beat.id, ref: vessel };
        this.d.towing.setPreferredTowable(vessel);
        // Beat 9: the drowned bell tilts on the flats near the derelict.
        if (beat.id === 'tide-stayed') {
          this.bellProp = createBellBuoy();
          this.bellProp.position.set(e.spawn.x + 26, 0, e.spawn.z - 18);
          this.d.scene.add(this.bellProp);
          this.bellTimer = 2;
        }
        break;
      }
      case 'pickup': {
        // A small floating prop (a buoy bobbing on the swell) — reach it.
        this.prop = this.makePickupProp(e.spawn.x, e.spawn.z);
        this.d.scene.add(this.prop);
        this.instance = { beatId: beat.id, ref: this.prop };
        break;
      }
      case 'rescue': {
        // Mission-owned foundering vessel; the ambient distress trigger + the
        // ambient harbor-completion path are suspended while scripted, and the
        // heli scrambles via the marker. Untargetable, still towable (towing
        // IS the objective).
        const vessel = this.d.distress.beginScriptedRescue(e.spawn.x, e.spawn.z);
        this.d.wildlife.setMissionOwned(vessel, true);
        this.d.wildlife.setUntargetable(vessel);
        this.instance = { beatId: beat.id, ref: vessel };
        this.d.towing.setPreferredTowable(vessel);
        break;
      }
      case 'mermaid': {
        // Scripted mermaid: clears any ambient one, holds her spot, ignores
        // night/calm/karma/lifetime; MissionSystem grants the beat on contact.
        // Beat 10 (exodus) defers her until dark — scripted mode deliberately
        // bypasses the night gate, so the mission must not start her early.
        this.exodusStarted = false;
        if (beat.id !== 'exodus') this.d.mermaid.beginScripted(e.spawn.x, e.spawn.z);
        break;
      }
      case 'leviathan-witness': {
        // Force the storm now so the spectacle has its weather on arrival (the
        // spectacle itself triggers on proximity in complete()).
        this.d.weather.beginScriptedStorm();
        break;
      }
      case 'leviathan-boss': {
        // The finale: a forced storm + the mission-owned boss. beginScripted
        // clears any active ambient/scripted Leviathan first (R9).
        this.d.weather.beginScriptedStorm();
        this.leviathanDefeated = false;
        this.lure.reset();
        this.d.leviathan.beginScripted(e.spawn.x, e.spawn.z, 'boss', true);
        break;
      }
      case 'multi-pickup': {
        // Beat 11: hydrate from persisted per-piece flags; only uncollected
        // salvage respawns. Props are wreck-hull silhouettes at the reef.
        this.multi = new MultiPickup(e.points.map((p) => p.id));
        this.multi.hydrate(e.points.filter((p) => this.d.state.flags[p.id]).map((p) => p.id));
        for (const p of e.points) {
          if (this.multi.isCollected(p.id)) continue;
          const prop = createWreckHull(p.id.length);
          prop.position.set(p.x, 0, p.z);
          this.d.scene.add(prop);
          this.multiProps.set(p.id, prop);
        }
        break;
      }
      case 'soul-transport': {
        // Beat 13: the drowned hamlet on the trench floor, one glow per
        // undelivered soul, and the recovery vessel holding station above.
        this.soulRun = new SoulTransport(e.souls.map((s) => s.id));
        this.soulRun.hydrate(
          e.souls.filter((s) => this.d.state.fates[s.id as SoulId] === 'saved').map((s) => s.id),
        );
        this.hamletProp = createDrownedHamlet();
        this.hamletProp.position.set(e.hamlet.x, TRENCH.hamletDepth, e.hamlet.z);
        this.d.scene.add(this.hamletProp);
        for (const s of e.souls) {
          if (this.d.state.fates[s.id as SoulId]) continue; // saved already
          const glow = createSoulSprite();
          glow.position.set(e.hamlet.x + s.dx, TRENCH.hamletDepth + 3, e.hamlet.z + s.dz);
          this.d.scene.add(glow);
          this.soulProps.set(s.id, glow);
        }
        this.recoveryProp = createRecoveryVessel();
        this.recoveryProp.position.set(e.hamlet.x, 0, e.hamlet.z);
        this.d.scene.add(this.recoveryProp);
        break;
      }
      case 'guardian': {
        // Beat 14: the hold clock is mission-owned and identical for both
        // branches; the branch decides presence (guardian circles) vs absence
        // (storm, alone) — never the completion logic.
        const spared = !!this.d.state.flags['mercy'];
        this.hold = new HoldTimer(spared ? e.mercySeconds : e.slainSeconds);
        this.holdEntered = false;
        this.holdMidpointToasted = false;
        if (spared) this.d.leviathan.beginScripted(e.spawn.x, e.spawn.z, 'guardian');
        else this.d.weather.beginScriptedStorm();
        break;
      }
      case 'rescue-sequence': {
        // Beat 15: forced storm; stages hydrate from per-stage flags so a
        // reload (or a lost vessel) restarts the current rescue, never the arc.
        this.d.weather.beginScriptedStorm();
        this.rescueSeq = new RescueSequence(e.points.length);
        this.rescueSeq.hydrate(e.points.map((_, i) => !!this.d.state.flags[`kt_rescue_${i + 1}`]));
        this.spawnRescueStage(e);
        break;
      }
      case 'song-answer': {
        // The finale. Mercy: unforced sky and the spared Leviathan circling
        // the presence on a fixed circuit, answering each pass. Slain: the
        // same song under forced storm, alone.
        this.song = new SongAnswer(e.points.length, {
          radius: e.radius,
          dwellSeconds: e.dwellSeconds,
          maxSpeed: e.maxSpeed,
          band: TRENCH.songBand,
        });
        this.lastSongViolation = 'none';
        this.songToastAt = -10;
        this.presenceProp = createDeepPresence();
        this.presenceProp.position.set(e.spawn.x, TRENCH.deepFloor - 14, e.spawn.z);
        this.d.scene.add(this.presenceProp);
        if (this.d.state.flags['mercy']) {
          this.callSerpent = createGuardianSerpent();
          this.callAngle = 0;
          this.d.scene.add(this.callSerpent);
        } else {
          this.d.weather.beginScriptedStorm();
        }
        break;
      }
      case 'listen': {
        // Beat 21: the heart of the deep. The guardian's hold clock, wrapped
        // without its branches — no storm, no serpent, no side effects. The
        // presence goes warm and gold, and larger than the finale's.
        this.hold = new HoldTimer(e.seconds);
        this.holdEntered = false;
        this.holdMidpointToasted = false;
        this.presenceProp = createDeepPresence(WARM_GOLD);
        this.presenceProp.scale.setScalar(1.35);
        this.presenceProp.position.set(e.spawn.x, TRENCH_ACT3.deepFloor - 14, e.spawn.z);
        this.d.scene.add(this.presenceProp);
        break;
      }
      case 'descent-gates': {
        // Beat 20: the maelstrom. The act3 era (armed above for beats ≥ 20)
        // has already opened the floor to −105; the finale's song machine
        // runs the gates with per-gate bands, same dwell/violation semantics.
        this.song = new SongAnswer(e.gates.length, {
          radius: e.radius,
          dwellSeconds: e.dwellSeconds,
          maxSpeed: e.maxSpeed,
          band: e.gates[0].band,
          bands: e.gates.map((g) => g.band),
        });
        this.lastSongViolation = 'none';
        this.songToastAt = -10;
        this.moteRing = createMoteRing();
        this.moteRing.position.set(e.spawn.x, 0, e.spawn.z);
        this.d.scene.add(this.moteRing);
        break;
      }
      default:
        // sonar-contact is marker-only (R3 handles the dock swap in getMarker).
        break;
    }
  }

  /** Spawn (or respawn) the current king-tide rescue stage's vessel. */
  private spawnRescueStage(e: Extract<EncounterSpec, { kind: 'rescue-sequence' }>): void {
    const stage = this.rescueSeq?.currentStage();
    if (stage == null) return;
    const p = e.points[stage];
    const vessel = this.d.distress.beginScriptedRescue(p.x, p.z);
    this.d.wildlife.setMissionOwned(vessel, true);
    this.d.wildlife.setUntargetable(vessel);
    this.instance = { beatId: 'king-tide', ref: vessel };
    this.d.towing.setPreferredTowable(vessel);
    this.rescueHooked = false;
  }

  /** Instance-backed encounters must still have their critical object; the
   *  systems-owned kinds (mermaid/leviathan/weather) manage their own
   *  lifecycles and are always "healthy" from the mission's view. */
  private encounterHealthy(beat: StoryBeat): boolean {
    switch (beat.encounter.kind) {
      case 'tow-derelict': {
        const v = this.instance?.ref as WildlifeEntity | undefined;
        return !!v && this.d.wildlife.isEntityAlive(v);
      }
      case 'rescue':
        return this.d.distress.getScriptedVessel() !== null;
      case 'rescue-sequence':
        // Mid-arc a live stage must have its vessel; done means done.
        return !this.rescueSeq || this.rescueSeq.complete()
          ? true
          : this.d.distress.getScriptedVessel() !== null;
      case 'pickup':
        return this.prop !== null;
      default:
        return true;
    }
  }

  /** Called each frame from Engine.update (campaign only). */
  update(dt: number): void {
    this.time += dt;
    const beat = currentBeat(this.d.state);
    if (!beat) return;

    // Self-heal (Act 2 stage 0): if the armed encounter's critical object is
    // ever gone — destroyed, culled, or lost across a reload edge — quietly
    // rebuild the beat rather than soft-locking on a completion that can
    // never fire. (Act 1's beat-4 "empty mayday" bug, prevented by design.)
    if (this.d.state.armedBeat === this.d.state.beat && !this.encounterHealthy(beat)) {
      this.disarm();
      this.arm(beat);
    }

    // Bob the pickup prop on the swell so it reads as floating, not static.
    if (this.prop) {
      const waveY = this.d.ocean.getWaveHeight(this.prop.position.x, this.prop.position.z, this.time);
      this.prop.position.y = waveY;
      this.prop.rotation.z = Math.sin(this.time * 0.9) * 0.08;
      this.prop.rotation.x = Math.sin(this.time * 0.7) * 0.06;
    }

    // Beat 1: auto-hook the Marigold when the player pulls alongside, then the
    // waypoint flips home — no tow-control fiddling for the very first beat.
    if (beat.encounter.kind === 'tow-derelict') {
      const vessel = this.instance?.ref as WildlifeEntity | undefined;
      if (vessel && this.d.towing.getTowedEntity() !== vessel) {
        const b = this.d.getBoatPos();
        if (Math.hypot(vessel.mesh.position.x - b.x, vessel.mesh.position.z - b.z) < 24) {
          if (this.d.towing.towEntity(vessel) && !this.towHintShown) {
            this.d.hud.showToast('The Marigold', 'Under tow — follow the marker home to Greyharbor.');
            this.towHintShown = true;
          }
        }
      }
    }

    // Unstick hints — the places players stall with no feedback:
    // (a) any boat-gated beat: at the dock in the wrong boat, not knowing ESC
    // is the swap; (b) sonar legs: over the reef but too shallow for contact.
    if (beat.requiresBoat) {
      const b = this.d.getBoatPos();
      if (this.requiresBoatUnmet(beat)) {
        if (!this.swapHintShown) {
          const dock = this.d.greyharbor.dock;
          if (Math.hypot(b.x - dock.x, b.z - dock.z) < 70) {
            this.swapHintShown = true;
            this.d.hud.showToast(
              'Greyharbor dock',
              `Press ESC and choose the ${beat.requiresBoat}, then set sail.`,
            );
          }
        }
      } else if (
        beat.encounter.kind === 'sonar-contact' &&
        !this.diveHintShown &&
        !this.sonarPinged
      ) {
        const e = beat.encounter;
        const flat = Math.hypot(b.x - e.spawn.x, b.z - e.spawn.z);
        if (flat < e.radius && b.y >= e.depth) {
          this.diveHintShown = true;
          this.d.hud.showToast('The wrecks below', 'You’re over them — dive deeper (hold ▼ / Shift).');
        }
      }
    }

    // Beat 9: the bell bobs and tolls, slow and mournful, while the player is
    // near enough to hear the flats.
    if (this.bellProp) {
      const waveY = this.d.ocean.getWaveHeight(this.bellProp.position.x, this.bellProp.position.z, this.time);
      this.bellProp.position.y = waveY;
      this.bellProp.rotation.z = 0.18 + Math.sin(this.time * 0.5) * 0.05;
      const b = this.d.getBoatPos();
      if (Math.hypot(this.bellProp.position.x - b.x, this.bellProp.position.z - b.z) < 280) {
        this.bellTimer -= dt;
        if (this.bellTimer <= 0) {
          this.bellTimer = 9;
          this.d.bellToll();
        }
      }
    }

    // Beat 10: nightfall starts the song — and her people start leaving.
    if (beat.encounter.kind === 'mermaid' && beat.id === 'exodus' && !this.exodusStarted) {
      if (this.d.isNight()) {
        this.exodusStarted = true;
        const e = beat.encounter;
        this.d.mermaid.beginScripted(e.spawn.x, e.spawn.z);
        for (let i = 0; i < 3; i++) {
          const swimmer = createMermaidSilhouette();
          const angle = Math.PI * 0.6 + i * 0.5; // streaming away east-southeast
          swimmer.position.set(e.spawn.x + (i - 1) * 12, -1.2, e.spawn.z + (i - 1) * 8);
          swimmer.rotation.y = angle;
          this.d.scene.add(swimmer);
          this.exodusSwimmers.push({
            group: swimmer,
            vx: Math.sin(angle) * 3.2,
            vz: Math.cos(angle) * 3.2,
            age: 0,
          });
        }
      }
    }
    if (this.exodusSwimmers.length) {
      for (let i = this.exodusSwimmers.length - 1; i >= 0; i--) {
        const s = this.exodusSwimmers[i];
        s.age += dt;
        s.group.position.x += s.vx * dt;
        s.group.position.z += s.vz * dt;
        s.group.position.y = -1.2 - s.age * 0.05 + Math.sin(this.time * 2 + i) * 0.2;
        if (s.age > 130) {
          disposeGroup(this.d.scene, s.group);
          this.exodusSwimmers.splice(i, 1);
        }
      }
    }

    // Beat 11: collect salvage on contact; each piece commits to a flag
    // immediately so a reload respawns only what's still out there.
    if (beat.encounter.kind === 'multi-pickup' && this.multi) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      for (const p of e.points) {
        if (this.multi.isCollected(p.id)) continue;
        if (Math.hypot(p.x - b.x, p.z - b.z) < e.radius && this.multi.collect(p.id)) {
          setFlag(this.d.state, p.id);
          saveCampaign(this.d.state);
          const prop = this.multiProps.get(p.id);
          if (prop) {
            disposeGroup(this.d.scene, prop);
            this.multiProps.delete(p.id);
          }
          const got = e.points.length - this.multi.remaining().length;
          this.d.hud.showToast(
            'Salvage secured',
            got < e.points.length
              ? `${got} of ${e.points.length} aboard — the marker leads on.`
              : 'All three aboard — bring her home to Greyharbor for the refit.',
          );
        }
      }
    }

    // Beat 12: a slow sonar heartbeat while closing on the trench, so the
    // descent has a pulse before the contact completes it.
    if (beat.encounter.kind === 'sonar-contact' && !this.requiresBoatUnmet(beat)) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      if (Math.hypot(b.x - e.spawn.x, b.z - e.spawn.z) < e.radius * 3) {
        this.deepPingTimer -= dt;
        if (this.deepPingTimer <= 0) {
          this.deepPingTimer = 5;
          this.d.sonarPing();
        }
      }
    }

    // Beat 13: soul pickup (3D contact in the deep band), the carried glow
    // riding the hull, and delivery on surfacing beside the recovery vessel.
    if (beat.encounter.kind === 'soul-transport' && this.soulRun) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      if (this.soulRun.carrying() === null) {
        for (const s of e.souls) {
          const glow = this.soulProps.get(s.id);
          if (!glow || !this.soulRun.canPickup(s.id)) continue;
          const dist3 = Math.hypot(
            glow.position.x - b.x,
            glow.position.y - b.y,
            glow.position.z - b.z,
          );
          if (dist3 < e.pickupRadius && inBand(b.y, TRENCH.pickupBand) && this.soulRun.pickup(s.id)) {
            disposeGroup(this.d.scene, glow);
            this.soulProps.delete(s.id);
            this.carryGlow = createSoulSprite();
            this.d.scene.add(this.carryGlow);
            this.d.hud.showToast(s.name, 'She rises with you. Carry her gently to the light.');
            break;
          }
        }
      } else {
        if (this.carryGlow) {
          this.carryGlow.position.set(b.x, b.y + 2.2, b.z);
          this.carryGlow.rotation.y = this.time * 0.6;
        }
        if (b.y >= -0.3 && Math.hypot(b.x - e.hamlet.x, b.z - e.hamlet.z) < e.deliverRadius) {
          const id = this.soulRun.deliver();
          if (id) {
            this.d.state.fates[id as SoulId] = 'saved'; // commits immediately
            // Act 3 reads the delivery ORDER (the pier casting, the volunteer,
            // the epilogue) — record it explicitly from now on.
            if (!this.d.state.savedOrder.includes(id as SoulId)) {
              this.d.state.savedOrder.push(id as SoulId);
            }
            saveCampaign(this.d.state);
            if (this.carryGlow) {
              disposeGroup(this.d.scene, this.carryGlow);
              this.carryGlow = null;
            }
            const name = e.souls.find((s) => s.id === id)?.name ?? id;
            const left = this.soulRun.complete() ? null : 'One more trip. Choose who you go back for.';
            this.d.hud.showToast(`${name} is safe`, left ?? 'The coastguard takes her aboard.');
          }
        }
      }
    }

    // Beat 14: tick the hold clock — surfaced, inside the radius. Leaving
    // pauses; the feedback tells the player the clock is real.
    if (beat.encounter.kind === 'guardian' && this.hold) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      const inside =
        b.y >= -0.3 && Math.hypot(b.x - e.spawn.x, b.z - e.spawn.z) < e.holdRadius;
      this.hold.step(dt, inside);
      if (inside && !this.holdEntered) {
        this.holdEntered = true;
        this.d.hud.showToast(
          'Hold the line',
          this.d.state.flags['mercy']
            ? 'Something vast rises — and circles you, not at you. Keep her steady.'
            : 'The glow climbs. Nothing comes to stand beside you. Keep her steady.',
        );
      }
      if (inside && !this.holdMidpointToasted && this.hold.progress() >= 0.5) {
        this.holdMidpointToasted = true;
        this.d.hud.showToast('The water holds', 'Halfway. The glow is slowing.');
      }
    }

    // Beat 15: run the current rescue stage through the scripted-rescue
    // contract; each save commits a stage flag and the next boat calls.
    if (beat.encounter.kind === 'rescue-sequence' && this.rescueSeq && !this.rescueSeq.complete()) {
      const e = beat.encounter;
      const stage = this.rescueSeq.currentStage();
      const vessel = this.d.distress.getScriptedVessel();
      if (stage != null && vessel) {
        if (this.d.towing.getTowedEntity() === vessel) this.rescueHooked = true;
        const p = e.points[stage];
        const clear =
          this.rescueHooked &&
          this.d.towing.getTowedEntity() === vessel &&
          Math.hypot(vessel.mesh.position.x - p.x, vessel.mesh.position.z - p.z) > e.safeRadius;
        if (clear && this.rescueSeq.completeStage(stage)) {
          setFlag(this.d.state, `kt_rescue_${stage + 1}`);
          saveCampaign(this.d.state);
          this.d.towing.releaseEntity(vessel);
          this.d.wildlife.setMissionOwned(vessel, false);
          this.d.distress.endScripted();
          this.instance = null;
          const n = this.rescueSeq.completedCount();
          if (!this.rescueSeq.complete()) {
            this.d.hud.showToast(
              `${n} of ${e.points.length} saved`,
              n === 1 ? 'Two crews still out there. The next boat is calling.' : 'One more out there. Bring them home.',
            );
            this.spawnRescueStage(e);
          }
        }
      }
    }

    // Beat 16: drive the song, breathe the presence, animate the answering
    // serpent, and keep the feedback honest (the Act 1 rule: never let the
    // player fail silently).
    if (beat.encounter.kind === 'song-answer' && this.song && !this.requiresBoatUnmet(beat)) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      if (this.presenceProp) {
        const breathe = 1 + Math.sin(this.time * 0.5) * 0.06;
        this.presenceProp.scale.setScalar(breathe);
      }
      if (this.callSerpent) {
        this.callAngle += dt * 0.12;
        const r = 95;
        this.callSerpent.position.set(
          e.spawn.x + Math.cos(this.callAngle) * r,
          -58,
          e.spawn.z + Math.sin(this.callAngle) * r,
        );
        this.callSerpent.rotation.y = -this.callAngle;
      }
      const idx = this.song.currentPoint();
      if (idx !== null) {
        const p = e.points[idx];
        const dist = Math.hypot(b.x - p.x, b.z - p.z);
        const banked = this.song.step(dt, dist, b.y, this.d.getBoatSpeed());
        if (banked) {
          const n = this.song.passesBanked();
          if (this.d.state.flags['mercy']) this.d.deepCall();
          if (!this.song.complete()) {
            this.d.hud.showToast(
              'The song answers',
              `${n} of ${e.points.length} — the next glow waits. Slowly, Captain.`,
            );
          }
        } else if (dist < e.radius * 2.5) {
          // Live coaching, throttled, only when the mode changes or repeats
          // after a while — silence when compliant.
          const v = this.song.lastViolation();
          if (v !== 'none' && (v !== this.lastSongViolation || this.time - this.songToastAt > 8)) {
            const line = SONG_COACHING[v];
            if (line) {
              this.lastSongViolation = v;
              this.songToastAt = this.time;
              this.d.hud.showToast('The Drowned Light', line);
            }
          }
        }
      }
    }

    // Beat 21: hold in the light and listen — submerged, close, patient. The
    // clock pauses when you drift out; the midpoint line is the only feedback
    // (the heart waits; it never fails you).
    if (beat.encounter.kind === 'listen' && this.hold && !this.requiresBoatUnmet(beat)) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      if (this.presenceProp) {
        const breathe = 1.35 * (1 + Math.sin(this.time * 0.35) * 0.05);
        this.presenceProp.scale.setScalar(breathe);
      }
      const inside =
        inBand(b.y, e.band) && Math.hypot(b.x - e.spawn.x, b.z - e.spawn.z) < e.radius;
      this.hold.step(dt, inside);
      if (inside && !this.holdEntered) {
        this.holdEntered = true;
        this.d.hud.showToast(beat.title, 'Warm light, all around. Hold here — and listen.');
      }
      if (inside && !this.holdMidpointToasted && this.hold.progress() >= 0.5) {
        this.holdMidpointToasted = true;
        this.d.hud.showToast(beat.title, 'It is not singing at you. It is singing to you.');
      }
    }

    // Beat 20: turn the maelstrom and drive the gates — the same machine and
    // the same coaching as the finale, band by band into the deep era.
    if (beat.encounter.kind === 'descent-gates' && this.song && !this.requiresBoatUnmet(beat)) {
      const e = beat.encounter;
      const b = this.d.getBoatPos();
      if (this.moteRing) this.moteRing.rotation.y += dt * 0.12;
      const idx = this.song.currentPoint();
      if (idx !== null) {
        const gate = e.gates[idx];
        const dist = Math.hypot(b.x - gate.x, b.z - gate.z);
        const banked = this.song.step(dt, dist, b.y, this.d.getBoatSpeed());
        if (banked) {
          if (!this.song.complete()) {
            const n = this.song.passesBanked();
            this.d.hud.showToast(
              beat.title,
              `${n} of ${e.gates.length} — the water lets you pass. Deeper.`,
            );
          }
        } else if (dist < e.radius * 2.5) {
          const v = this.song.lastViolation();
          if (v !== 'none' && (v !== this.lastSongViolation || this.time - this.songToastAt > 8)) {
            const line = SONG_COACHING[v];
            if (line) {
              this.lastSongViolation = v;
              this.songToastAt = this.time;
              this.d.hud.showToast(beat.title, line);
            }
          }
        }
      }
    }

    if (this.complete(beat)) this.finish(beat);
    else this.d.quest.setDistance(this.distanceToMarker());
  }

  private complete(beat: StoryBeat): boolean {
    // A beat that names a boat can only complete from that boat.
    if (this.requiresBoatUnmet(beat)) return false;
    const e = beat.encounter;
    const boat = this.d.getBoatPos();

    switch (e.kind) {
      case 'tow-derelict': {
        const vessel = this.instance?.ref as WildlifeEntity | undefined;
        if (!vessel || this.d.towing.getTowedEntity() !== vessel) return false;
        const d = Math.hypot(
          vessel.mesh.position.x - this.d.greyharbor.dock.x,
          vessel.mesh.position.z - this.d.greyharbor.dock.z,
        );
        return d < e.radius;
      }
      case 'pickup': {
        if (!this.prop) return false;
        return Math.hypot(boat.x - this.prop.position.x, boat.z - this.prop.position.z) < e.radius;
      }
      case 'rescue': {
        const vessel = this.d.distress.getScriptedVessel();
        if (!vessel) return false;
        // Require the player to actually hook it, then tow it clear of the spot.
        if (this.d.towing.getTowedEntity() === vessel) this.rescueHooked = true;
        if (!this.rescueHooked || this.d.towing.getTowedEntity() !== vessel) return false;
        const d = Math.hypot(vessel.mesh.position.x - e.spawn.x, vessel.mesh.position.z - e.spawn.z);
        return d > e.safeRadius;
      }
      case 'sonar-contact': {
        // Must be in the loaned sub, over the reef, and actually submerged past
        // the contact depth. (R3 keeps the marker on the dock until they swap.)
        if (!beat.requiresBoat || !this.d.isInBoat(beat.requiresBoat)) return false;
        const flat = Math.hypot(boat.x - e.spawn.x, boat.z - e.spawn.z);
        if (flat >= e.radius || boat.y >= e.depth) return false;
        if (!this.sonarPinged) {
          this.sonarPinged = true;
          this.d.sonarPing();
          this.d.hud.showToast('Sonar contact', 'A return too big for any whale — and a hull raked by something clawed.');
        }
        return true;
      }
      case 'mermaid':
        return this.d.mermaid.scriptedHeard();
      case 'leviathan-witness': {
        // The spectacle plays when the player reaches the trench, then completes
        // on its own animation end (R8). Mission grants the journal + credits.
        if (!this.spectacleTriggered) {
          const flat = Math.hypot(boat.x - e.spawn.x, boat.z - e.spawn.z);
          if (flat < e.radius) {
            this.spectacleTriggered = true;
            this.d.leviathan.beginScripted(e.spawn.x, e.spawn.z, 'spectacle');
          }
          return false;
        }
        return this.d.leviathan.scriptedSpectaclePlayed();
      }
      case 'leviathan-boss': {
        if (this.d.disarmed) {
          // No-weapons path: lure the chasing beast into the trench mouth.
          const dist = Math.hypot(boat.x - e.spawn.x, boat.z - e.spawn.z);
          const done = this.lure.step(dist, this.d.leviathan.scriptedBossActive());
          // Surface the invisible counter: each banked pass gets a beat of
          // feedback, or the player has no idea the lure is even working.
          const passes = this.lure.getPasses();
          if (!done && passes !== this.lastLurePasses) {
            this.lastLurePasses = passes;
            this.d.hud.showToast(
              'The lure holds',
              `It follows you in — pass ${passes} of 3. Pull away and come round again.`,
            );
          }
          if (done) {
            // Act 2 hinges on spared-vs-killed: record the mercy now so the
            // sequel can read it off any finished save.
            setFlag(this.d.state, 'mercy');
            this.d.leviathan.endScripted(); // it sounds and dives
          }
          return done;
        }
        // Armed path: the WeaponsSystem kill is routed to onLeviathanDefeated.
        if (this.leviathanDefeated) setFlag(this.d.state, 'slain');
        return this.leviathanDefeated;
      }
      case 'multi-pickup': {
        // All pieces aboard, then home: the dock completes the refit.
        if (!this.multi || !this.multi.allCollected()) return false;
        const d = Math.hypot(boat.x - this.d.greyharbor.dock.x, boat.z - this.d.greyharbor.dock.z);
        return d < e.dockRadius;
      }
      case 'soul-transport':
        return !!this.soulRun && this.soulRun.complete();
      case 'guardian':
      case 'listen':
        // The clock is stepped in update(); completion is just its verdict.
        return !!this.hold && this.hold.complete();
      case 'rescue-sequence':
        return !!this.rescueSeq && this.rescueSeq.complete();
      case 'song-answer':
      case 'descent-gates':
        return !!this.song && this.song.complete();
      default:
        return false;
    }
  }

  private finish(beat: StoryBeat): void {
    const r = beat.reward;
    // The finale's canon must match how it was won: the lure path spares the
    // beast, so it neither journals a slaying nor reads like one. (Codex gate:
    // Act 2's ally branch contradicts a journal that says it was slain.)
    const spared = beat.encounter.kind === 'leviathan-boss' && !!this.d.state.flags['mercy'];
    const journalKey = spared ? undefined : r.journalKey;
    let successLine = spared
      ? 'Lured into the trench, it sounds and dives — spared, not slain. The tide is yours, Captain. (To be continued.)'
      : r.successLine;
    // Branch-flavored closings (beat 14's guardian vs its absence).
    if (r.slainLine && this.d.state.flags['slain']) successLine = r.slainLine;
    // The epilogue names the fates: {saved} and {kept} from the choir.
    if (successLine.includes('{saved}') || successLine.includes('{kept}')) {
      const saved = Object.entries(this.d.state.fates)
        .filter(([, f]) => f === 'saved')
        .map(([id]) => SOUL_NAMES[id] ?? id);
      const kept = Object.entries(this.d.state.fates)
        .filter(([, f]) => f === 'kept')
        .map(([id]) => SOUL_NAMES[id] ?? id);
      successLine = successLine
        .replace('{saved}', saved.length ? saved.join(' and ') : 'The rescued')
        .replace('{kept}', kept.length ? kept.join(' and ') : 'one voice');
    }
    // Beat 13: the soul the sea keeps is chosen by omission — commit her fate
    // and name her in the closing line.
    if (beat.encounter.kind === 'soul-transport' && this.soulRun) {
      const keptId = this.soulRun.keptSouls()[0];
      if (keptId) {
        this.d.state.fates[keptId as SoulId] = 'kept';
        const keptName =
          beat.encounter.souls.find((s) => s.id === keptId)?.name ?? 'One of them';
        successLine = successLine.replace('{kept}', keptName);
      }
    }
    if (r.credits) addCredits(r.credits);
    if (r.karma) addKarma(r.karma);
    if (r.unlockBoat) unlockBoat(this.d.state, r.unlockBoat);
    if (journalKey) this.d.journal.log(journalKey);
    if (r.flag) setFlag(this.d.state, r.flag);
    // The beat's completion plate carries the success line; the toast is the
    // fallback for beats without a card (or replays where it's been seen).
    const plates = INTERLUDE_PLATES[beat.id];
    const cardShown = plates?.complete
      ? this.showPlate(plates.complete, beat.title, successLine)
      : false;
    if (!cardShown) this.d.hud.showToast(beat.title, successLine);
    markCompleted(this.d.state, beat.id);
    advanceBeat(this.d.state);
    saveCampaign(this.d.state);
    this.disarm();
    if (isComplete(this.d.state)) this.d.quest.complete();
    else this.armCurrent();
  }

  /** Tear down the active scripted encounter (idempotent). */
  private disarm(): void {
    setEra('act2'); // the deep era never survives a disarm
    this.armGen++; // pending async asks are now provably stale
    this.d.cancelChoice(); // and their UI is closed (no-op when none pending)
    this.marker = null;
    this.d.towing.setPreferredTowable(null);
    // Restore/clear the scripted rescue vessel (no-op if none was scripted).
    this.d.distress.endScripted();
    // Send any scripted mermaid back under (no-op if none was scripted).
    this.d.mermaid.endScripted();
    // Tear down any scripted Leviathan spectacle/boss (no-op if none).
    this.d.leviathan.endScripted();
    // Release the forced finale storm (no-op if not forced).
    this.d.weather.endScriptedStorm();
    this.leviathanDefeated = false;
    this.lure.reset();
    this.clearProp();
    // Act 2 teardown — all scene-prop dressing and machines (idempotent).
    for (const prop of this.multiProps.values()) disposeGroup(this.d.scene, prop);
    this.multiProps.clear();
    this.multi = null;
    for (const glow of this.soulProps.values()) disposeGroup(this.d.scene, glow);
    this.soulProps.clear();
    if (this.hamletProp) {
      disposeGroup(this.d.scene, this.hamletProp);
      this.hamletProp = null;
    }
    if (this.recoveryProp) {
      disposeGroup(this.d.scene, this.recoveryProp);
      this.recoveryProp = null;
    }
    if (this.carryGlow) {
      disposeGroup(this.d.scene, this.carryGlow);
      this.carryGlow = null;
    }
    this.soulRun = null;
    if (this.bellProp) {
      disposeGroup(this.d.scene, this.bellProp);
      this.bellProp = null;
    }
    for (const s of this.exodusSwimmers) disposeGroup(this.d.scene, s.group);
    this.exodusSwimmers = [];
    this.exodusStarted = false;
    this.hold = null;
    this.rescueSeq = null;
    if (this.presenceProp) {
      disposeGroup(this.d.scene, this.presenceProp);
      this.presenceProp = null;
    }
    if (this.callSerpent) {
      disposeGroup(this.d.scene, this.callSerpent);
      this.callSerpent = null;
    }
    this.song = null;
    if (this.moteRing) {
      disposeGroup(this.d.scene, this.moteRing);
      this.moteRing = null;
    }
    // A mission-owned vessel (the towed Marigold, or a rescued boat) is handed
    // off at beat's end: detach the tow line so she isn't dragged into the next
    // beat, then despawn her. (Scripted-rescue vessels are also cleared by
    // distress.endScripted above; releasing the line here is harmless either way.)
    const ref = this.instance?.ref;
    if (ref && !(ref instanceof THREE.Group)) {
      const we = ref as WildlifeEntity;
      this.d.towing.releaseEntity(we);
      this.d.wildlife.setMissionOwned(we, false);
      if (this.d.wildlife.isEntityAlive(we)) this.d.wildlife.removeEntity(we);
    }
    this.instance = null;
    this.rescueHooked = false;
  }

  private distanceToMarker(): number | null {
    // Track the live waypoint (R3 may point this at the dock, not this.marker).
    const m = this.getMarker();
    if (!m) return null;
    const b = this.d.getBoatPos();
    return Math.hypot(m.x - b.x, m.z - b.z);
  }

  private makePickupProp(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd98b3a, roughness: 0.6, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.6, 8), mat);
    body.position.y = 0.4;
    g.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 8), mat);
    top.position.y = 1.35;
    g.add(top);
    g.position.set(x, 0, z);
    return g;
  }

  private clearProp(): void {
    if (!this.prop) return;
    this.d.scene.remove(this.prop);
    this.prop.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const m = child.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
    this.prop = null;
  }

  /** Remove all scripted instances + props and clear the quest panel. */
  dispose(): void {
    this.disarm();
    this.d.quest.clear();
  }
}
