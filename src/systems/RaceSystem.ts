import * as THREE from 'three';
import { ChunkManager } from '../world/ChunkManager';
import { Transform } from '../components/Transform';
import { islandName } from '../world/IslandNames';

interface GhostSample {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

interface CourseRecord {
  time: number;          // seconds
  ghost: GhostSample[];  // sampled at GHOST_HZ
}

export interface RaceCallbacks {
  /** Live timer text for the HUD, or null when not racing. */
  onTimer: (text: string | null) => void;
  /** A run finished: toast content plus the credit reward (records pay more). */
  onFinish: (label: string, headline: string, reward: number) => void;
}

const STORAGE_KEY = 'tb-races';
const GHOST_DT = 0.2;       // ghost sample interval (s)
const GHOST_MAX = 900;      // 3 minutes of samples
const GATE_RADIUS = 16;     // how close counts as passing a buoy
const ABANDON_DIST = 320;   // straying this far from the next gate aborts

function loadRecords(storage: Storage): Record<string, CourseRecord> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, CourseRecord>) : {};
  } catch {
    return {};
  }
}

/**
 * Buoy time-trials. Each island's buoy ring is a course: sail through the
 * gold start buoy, round every buoy in order, and finish back at the gold.
 * Your best run is replayed as a translucent ghost of your boat.
 */
export class RaceSystem {
  private records: Record<string, CourseRecord>;

  // Active race state
  private courseKey: string | null = null;
  private buoys: { x: number; z: number }[] = [];
  private courseName = '';
  private nextGate = 0;
  private elapsed = 0;
  private ghostSamples: GhostSample[] = [];
  private ghostSampleTimer = 0;

  // Ghost replay
  private ghostMesh: THREE.Group | null = null;
  private ghostRun: GhostSample[] | null = null;

  // After a finish/abort, don't restart until the player leaves the gold buoy
  private startLockout = false;

  constructor(
    private scene: THREE.Scene,
    private chunkManager: ChunkManager,
    private playerMesh: THREE.Group,
    private callbacks: RaceCallbacks,
    private storage: Storage = localStorage,
  ) {
    this.records = loadRecords(storage);
  }

  update(dt: number, boat: Transform): void {
    if (this.courseKey) {
      this.updateRace(dt, boat);
    } else {
      this.checkStart(boat);
    }
  }

  private checkStart(boat: Transform): void {
    if (this.startLockout) {
      // Re-arm once clear of every start buoy
      for (const course of this.chunkManager.getCourses()) {
        const s = course.buoys[0];
        if (Math.hypot(boat.position.x - s.x, boat.position.z - s.z) <= GATE_RADIUS + 8) return;
      }
      this.startLockout = false;
    }
    for (const course of this.chunkManager.getCourses()) {
      const start = course.buoys[0];
      if (Math.hypot(boat.position.x - start.x, boat.position.z - start.z) > GATE_RADIUS) continue;

      this.courseKey = `${course.chunkX},${course.chunkZ}`;
      this.buoys = course.buoys;
      this.courseName = islandName(course.chunkX, course.chunkZ, course.biome);
      this.nextGate = 1;
      this.elapsed = 0;
      this.ghostSamples = [];
      this.ghostSampleTimer = 0;
      this.spawnGhost();
      return;
    }
  }

  private updateRace(dt: number, boat: Transform): void {
    this.elapsed += dt;

    // Record this run for a future ghost
    this.ghostSampleTimer -= dt;
    if (this.ghostSampleTimer <= 0 && this.ghostSamples.length < GHOST_MAX) {
      this.ghostSampleTimer = GHOST_DT;
      this.ghostSamples.push({
        x: +boat.position.x.toFixed(2),
        y: +boat.position.y.toFixed(2),
        z: +boat.position.z.toFixed(2),
        rotY: +boat.rotation.y.toFixed(3),
      });
    }
    this.replayGhost();

    // Gate progression — after the last buoy, the gold start is the finish
    const finishing = this.nextGate >= this.buoys.length;
    const gate = finishing ? this.buoys[0] : this.buoys[this.nextGate];
    const dist = Math.hypot(boat.position.x - gate.x, boat.position.z - gate.z);

    if (dist <= GATE_RADIUS) {
      if (finishing) {
        this.finish();
        return;
      }
      this.nextGate++;
    } else if (dist > ABANDON_DIST) {
      this.abort();
      return;
    }

    const total = this.buoys.length;
    const gateLabel = finishing ? 'finish' : `gate ${this.nextGate}/${total - 1}`;
    this.callbacks.onTimer(`⏱ ${formatTime(this.elapsed)} · ${gateLabel} · ${Math.round(dist)}m`);
  }

  private finish(): void {
    const key = this.courseKey!;
    const prev = this.records[key];
    const isRecord = !prev || this.elapsed < prev.time;

    if (isRecord) {
      this.records[key] = { time: +this.elapsed.toFixed(2), ghost: this.ghostSamples };
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.records));
      } catch {
        // Storage unavailable — the run still counts this session.
      }
      this.callbacks.onFinish(
        prev ? 'New record!' : 'Course complete',
        `${this.courseName} · ${formatTime(this.elapsed)}`,
        40,
      );
    } else {
      this.callbacks.onFinish(
        'Course complete',
        `${this.courseName} · ${formatTime(this.elapsed)} (best ${formatTime(prev.time)})`,
        10,
      );
    }
    this.clearRace();
  }

  private abort(): void {
    this.clearRace();
  }

  private clearRace(): void {
    this.courseKey = null;
    this.startLockout = true;
    this.callbacks.onTimer(null);
    this.removeGhost();
  }

  // ── Ghost replay ───────────────────────────────────────────

  private spawnGhost(): void {
    const record = this.records[this.courseKey!];
    if (!record || record.ghost.length < 2) return;
    this.ghostRun = record.ghost;

    // Translucent copy of the player's hull (lights stripped)
    const ghost = this.playerMesh.clone(true);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xbfe6ff, transparent: true, opacity: 0.3, depthWrite: false,
    });
    const lights: THREE.Object3D[] = [];
    ghost.traverse((obj) => {
      if (obj instanceof THREE.Light) lights.push(obj);
      else if (obj instanceof THREE.Mesh) obj.material = ghostMat;
    });
    lights.forEach((l) => l.parent?.remove(l));
    this.scene.add(ghost);
    this.ghostMesh = ghost;
  }

  private replayGhost(): void {
    if (!this.ghostMesh || !this.ghostRun) return;
    const t = this.elapsed / GHOST_DT;
    const i = Math.min(Math.floor(t), this.ghostRun.length - 2);
    const frac = Math.min(t - i, 1);
    const a = this.ghostRun[i];
    const b = this.ghostRun[i + 1];
    this.ghostMesh.position.set(
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
      a.z + (b.z - a.z) * frac,
    );
    this.ghostMesh.rotation.y = a.rotY;
  }

  private removeGhost(): void {
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    this.ghostRun = null;
  }

  dispose(): void {
    this.removeGhost();
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
