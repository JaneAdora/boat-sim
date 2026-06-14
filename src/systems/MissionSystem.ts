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
import type { WildlifeSystem } from './WildlifeSystem';
import type { TowingSystem } from './TowingSystem';
import type { DistressSystem } from './DistressSystem';

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
  private time = 0;

  constructor(private d: MissionDeps) {}

  start(): void {
    this.armCurrent();
  }

  getMarker(): { x: number; z: number } | null {
    return this.marker;
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
    this.d.quest.set(beat.title, beat.objective);
    this.d.hud.showToast(beat.title, beat.brief);
    this.arm(beat);
    saveCampaign(this.d.state);
  }

  private arm(beat: StoryBeat): void {
    const e = beat.encounter;
    if ('spawn' in e) this.marker = { x: e.spawn.x, z: e.spawn.z };
    // Encounter-specific spawns are added in Task 9 / Milestone 2.
  }

  /** Called each frame from Engine.update (campaign only). */
  update(dt: number): void {
    this.time += dt;
    const beat = currentBeat(this.d.state);
    if (!beat) return;
    if (this.complete(beat)) this.finish(beat);
    else this.d.quest.setDistance(this.distanceToMarker());
  }

  private complete(_beat: StoryBeat): boolean {
    return false; // filled in Task 9 / Milestone 2
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
    this.instance = null;
    // Per-encounter despawn is added in Task 9 / Milestone 2.
  }

  private distanceToMarker(): number | null {
    if (!this.marker) return null;
    const b = this.d.getBoatPos();
    return Math.hypot(this.marker.x - b.x, this.marker.z - b.z);
  }

  /** Remove all scripted instances + props and clear the quest panel. */
  dispose(): void {
    this.disarm();
    this.d.quest.clear();
  }
}
