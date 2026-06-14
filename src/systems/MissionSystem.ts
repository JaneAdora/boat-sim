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
import type { StoryBeat } from '../state/StoryBeats';
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
  /** No-weapons mode (tb-disarmed): the finale is won by luring, not sinking. */
  disarmed: boolean;
  getBoatPos(): { x: number; z: number; y: number };
  isInBoat(name: string): boolean;
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
  private time = 0;

  constructor(private d: MissionDeps) {}

  start(): void {
    this.armCurrent();
  }

  getMarker(): { x: number; z: number } | null {
    // R3: while the sub leg is armed but the player is in the wrong boat, steer
    // them back to the Greyharbor dock to swap — not out to the unreachable reef.
    const beat = currentBeat(this.d.state);
    if (
      beat?.encounter.kind === 'sonar-contact' &&
      beat.requiresBoat &&
      !this.d.isInBoat(beat.requiresBoat)
    ) {
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
    const wrongBoat = beat.requiresBoat && !this.d.isInBoat(beat.requiresBoat);
    this.d.quest.set(beat.title, wrongBoat ? `Take the ${beat.requiresBoat} out.` : beat.objective);
    this.d.hud.showToast(beat.title, beat.brief);
    this.arm(beat);
    saveCampaign(this.d.state);
  }

  private arm(beat: StoryBeat): void {
    const e = beat.encounter;
    if ('spawn' in e) this.marker = { x: e.spawn.x, z: e.spawn.z };
    this.rescueHooked = false;
    this.sonarPinged = false;
    this.spectacleTriggered = false;
    this.towHintShown = false;

    switch (e.kind) {
      case 'tow-derelict': {
        // Mission-owned derelict (spawnDistressedVessel sets maxAge:Infinity, so
        // it won't ambient-despawn). Tow it home to the Greyharbor dock.
        const vessel = this.d.wildlife.spawnDistressedVessel(e.spawn.x, e.spawn.z);
        this.d.wildlife.setMissionOwned(vessel, true);
        this.instance = { beatId: beat.id, ref: vessel };
        this.d.towing.setPreferredTowable(vessel);
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
        // heli scrambles via the marker.
        const vessel = this.d.distress.beginScriptedRescue(e.spawn.x, e.spawn.z);
        this.d.wildlife.setMissionOwned(vessel, true);
        this.instance = { beatId: beat.id, ref: vessel };
        this.d.towing.setPreferredTowable(vessel);
        break;
      }
      case 'mermaid': {
        // Scripted mermaid: clears any ambient one, holds her spot, ignores
        // night/calm/karma/lifetime; MissionSystem grants the beat on contact.
        this.d.mermaid.beginScripted(e.spawn.x, e.spawn.z);
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
      default:
        // sonar-contact is marker-only (R3 handles the dock swap in getMarker).
        break;
    }
  }

  /** Called each frame from Engine.update (campaign only). */
  update(dt: number): void {
    this.time += dt;
    const beat = currentBeat(this.d.state);
    if (!beat) return;

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

    if (this.complete(beat)) this.finish(beat);
    else this.d.quest.setDistance(this.distanceToMarker());
  }

  private complete(beat: StoryBeat): boolean {
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
          if (done) this.d.leviathan.endScripted(); // it sounds and dives
          return done;
        }
        // Armed path: the WeaponsSystem kill is routed to onLeviathanDefeated.
        return this.leviathanDefeated;
      }
      default:
        return false;
    }
  }

  private finish(beat: StoryBeat): void {
    const r = beat.reward;
    if (r.credits) addCredits(r.credits);
    if (r.karma) addKarma(r.karma);
    if (r.unlockBoat) unlockBoat(this.d.state, r.unlockBoat);
    if (r.journalKey) this.d.journal.log(r.journalKey);
    if (r.flag) setFlag(this.d.state, r.flag);
    this.d.hud.showToast(beat.title, r.successLine);
    markCompleted(this.d.state, beat.id);
    advanceBeat(this.d.state);
    saveCampaign(this.d.state);
    this.disarm();
    if (isComplete(this.d.state)) this.d.quest.complete();
    else this.armCurrent();
  }

  /** Tear down the active scripted encounter (idempotent). */
  private disarm(): void {
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
