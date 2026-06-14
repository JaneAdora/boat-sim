import * as THREE from 'three';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';
import { AmbientSoundscape } from '../audio/AmbientSoundscape';
import { clamp } from '../utils/math';

export interface AircraftCallbacks {
  /** Active mayday location for the rescue helicopter (null = none). */
  activeDistress: () => { x: number; z: number } | null;
  /** Player collected an air-dropped salvage crate — award credits + toast. */
  onCrateCollected: (credits: number) => void;
}

type Spin = { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number };

interface Aircraft {
  kind: 'helicopter' | 'seaplane';
  group: THREE.Group;
  spin: Spin[];
  pos: THREE.Vector3;
  heading: number;
  state: 'arriving' | 'station' | 'leaving';
  station: THREE.Vector3; // where it works (hover point / cove)
  timer: number;          // time in the current job
  winch: THREE.Object3D | null;
  dropped: boolean;
}

interface Crate {
  group: THREE.Group;
  x: number;
  z: number;
  age: number;
  credits: number;
}

const HELI_CRUISE_Y = 50;
const HELI_HOVER_Y = 26;
const PLANE_CRUISE_Y = 62;
const PLANE_SKIM_Y = 5;
const SPAWN_DIST = 320;     // aircraft fly in from this far
const DESPAWN_DIST = 520;   // culled this far from the boat
const HELI_TRIGGER_DIST = 320; // only scramble for maydays this near the player
const HELI_MAX_STATION = 75;   // seconds on station before it gives up and leaves
const SEAPLANE_MIN_GAP = 75;   // seconds between seaplane visits
const SEAPLANE_MAX_GAP = 150;
const CRATE_COLLECT_RANGE = 9;
const CRATE_MAX_AGE = 150;
const HELI_HEAR = 440;  // helicopter audible out to here
const PLANE_HEAR = 400; // seaplane audible out to here

function easeAngle(cur: number, target: number, maxStep: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

/**
 * NPC aircraft — the world has a rescue service and a freight run. A coastguard
 * helicopter scrambles to active maydays near you (you can feel the race), flies
 * in, hovers with its winch down, and peels off when the call is resolved. A
 * cargo seaplane drifts in every so often, descends into a cove beside an
 * island, drops a salvage crate you can collect, then climbs out. Both fly well
 * above the boats; this drives their state machines, rotors, and the crates.
 */
export class AircraftSystem {
  private heli: Aircraft | null = null;
  private heliCooldown = 0; // pause before re-scrambling, so it doesn't loop on an ignored mayday
  private plane: Aircraft | null = null;
  private crates: Crate[] = [];
  private seaplaneTimer = 20 + Math.random() * 30; // first run comes fairly soon
  private soundscape: AmbientSoundscape | null = null;

  constructor(
    private scene: THREE.Scene,
    private ocean: Ocean,
    private chunkManager: ChunkManager,
    private callbacks: AircraftCallbacks,
  ) {}

  setSoundscape(s: AmbientSoundscape): void {
    this.soundscape = s;
  }

  update(dt: number, boatX: number, boatZ: number, boatHeading: number): void {
    this.updateHelicopter(dt, boatX, boatZ);
    this.updateSeaplane(dt, boatX, boatZ);
    this.updateCrates(dt, boatX, boatZ);

    // Fade + pan the looping rotor/drone by distance and bearing.
    if (this.soundscape) {
      const h = this.voice(this.heli, boatX, boatZ, boatHeading, HELI_HEAR);
      this.soundscape.setHelicopter(h.level, h.pan);
      const p = this.voice(this.plane, boatX, boatZ, boatHeading, PLANE_HEAR);
      this.soundscape.setSeaplane(p.level, p.pan);
    }
  }

  /** Loudness (quadratic falloff) + stereo pan of an aircraft relative to the
   *  player's heading. Silent when there's no aircraft. */
  private voice(a: Aircraft | null, bx: number, bz: number, bh: number, hear: number): { level: number; pan: number } {
    if (!a) return { level: 0, pan: 0 };
    const dx = a.pos.x - bx;
    const dz = a.pos.z - bz;
    let level = clamp(1 - Math.hypot(dx, dz) / hear, 0, 1);
    level *= level;
    return { level, pan: clamp(Math.sin(Math.atan2(dx, dz) - bh), -1, 1) };
  }

  // ── Helicopter: scrambles to nearby maydays ──────────────────

  private updateHelicopter(dt: number, boatX: number, boatZ: number): void {
    const mayday = this.callbacks.activeDistress();

    if (!this.heli) {
      if (this.heliCooldown > 0) { this.heliCooldown -= dt; return; }
      // Scramble only for a mayday the player is near enough to witness.
      if (mayday && Math.hypot(mayday.x - boatX, mayday.z - boatZ) < HELI_TRIGGER_DIST) {
        this.heli = this.spawnHelicopter(mayday);
      }
      return;
    }

    const h = this.heli;
    this.animate(h, dt);
    h.timer += dt;

    if (h.state === 'arriving') {
      const arrived = this.flyToward(h, h.station.x, HELI_HOVER_Y, h.station.z, 24, dt);
      if (arrived) { h.state = 'station'; h.timer = 0; }
    } else if (h.state === 'station') {
      // Hover with a gentle drift; lower the winch.
      const t = h.timer;
      h.pos.x = h.station.x + Math.sin(t * 0.5) * 2.5;
      h.pos.z = h.station.z + Math.cos(t * 0.5) * 2.5;
      h.pos.y += (HELI_HOVER_Y - h.pos.y) * Math.min(1, 1.5 * dt);
      h.heading = easeAngle(h.heading, h.heading + 0.3, 0.4 * dt); // slow scan
      h.group.position.copy(h.pos);
      h.group.rotation.y = h.heading;
      if (h.winch) h.winch.visible = true;
      // Done when the call clears, we time out, or the player wanders off.
      const stillCalling = !!mayday;
      if (!stillCalling || h.timer > HELI_MAX_STATION ||
          Math.hypot(h.pos.x - boatX, h.pos.z - boatZ) > DESPAWN_DIST) {
        if (h.winch) h.winch.visible = false;
        h.state = 'leaving';
      }
    } else {
      // Climb out and fly off, away from the boat.
      const awayHeading = Math.atan2(h.pos.x - boatX, h.pos.z - boatZ);
      h.heading = easeAngle(h.heading, awayHeading, 1.5 * dt);
      h.pos.x += Math.sin(h.heading) * 30 * dt;
      h.pos.z += Math.cos(h.heading) * 30 * dt;
      h.pos.y += (HELI_CRUISE_Y - h.pos.y) * Math.min(1, 0.8 * dt);
      h.group.position.copy(h.pos);
      h.group.rotation.y = h.heading;
      if (Math.hypot(h.pos.x - boatX, h.pos.z - boatZ) > DESPAWN_DIST) {
        this.disposeAircraft(h);
        this.heli = null;
        this.heliCooldown = 90;
      }
    }
  }

  private spawnHelicopter(mayday: { x: number; z: number }): Aircraft {
    const { group, spin, winch } = createHelicopterMesh();
    // Fly in from a random bearing off the mayday, at cruise height.
    const a = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(mayday.x + Math.cos(a) * SPAWN_DIST, HELI_CRUISE_Y, mayday.z + Math.sin(a) * SPAWN_DIST);
    group.position.copy(pos);
    this.scene.add(group);
    return {
      kind: 'helicopter', group, spin, pos, heading: Math.atan2(mayday.x - pos.x, mayday.z - pos.z),
      state: 'arriving', station: new THREE.Vector3(mayday.x, HELI_HOVER_Y, mayday.z), timer: 0, winch, dropped: false,
    };
  }

  // ── Cargo seaplane: drops salvage in a cove ──────────────────

  private updateSeaplane(dt: number, boatX: number, boatZ: number): void {
    if (!this.plane) {
      this.seaplaneTimer -= dt;
      if (this.seaplaneTimer <= 0) {
        const cove = this.findCove(boatX, boatZ);
        if (cove) {
          this.plane = this.spawnSeaplane(cove);
          this.seaplaneTimer = SEAPLANE_MIN_GAP + Math.random() * (SEAPLANE_MAX_GAP - SEAPLANE_MIN_GAP);
        } else {
          this.seaplaneTimer = 12; // no cove in range — try again shortly
        }
      }
      return;
    }

    const p = this.plane;
    this.animate(p, dt);

    if (p.state === 'arriving') {
      const near = this.flyToward(p, p.station.x, PLANE_SKIM_Y, p.station.z, 30, dt);
      if (near && p.pos.y < PLANE_SKIM_Y + 4 && !p.dropped) {
        this.dropCrate(p.pos.x, p.pos.z);
        p.dropped = true;
        p.state = 'leaving';
      }
    } else {
      // Climb out along the current heading and fly off.
      p.pos.x += Math.sin(p.heading) * 34 * dt;
      p.pos.z += Math.cos(p.heading) * 34 * dt;
      p.pos.y += (PLANE_CRUISE_Y - p.pos.y) * Math.min(1, 0.6 * dt);
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.heading;
      if (Math.hypot(p.pos.x - boatX, p.pos.z - boatZ) > DESPAWN_DIST) {
        this.disposeAircraft(p);
        this.plane = null;
      }
    }
  }

  private spawnSeaplane(cove: { x: number; z: number }): Aircraft {
    const { group, spin } = createSeaplaneMesh();
    const a = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(cove.x + Math.cos(a) * SPAWN_DIST, PLANE_CRUISE_Y, cove.z + Math.sin(a) * SPAWN_DIST);
    group.position.copy(pos);
    this.scene.add(group);
    return {
      kind: 'seaplane', group, spin, pos, heading: Math.atan2(cove.x - pos.x, cove.z - pos.z),
      state: 'arriving', station: new THREE.Vector3(cove.x, PLANE_SKIM_Y, cove.z), timer: 0, winch: null, dropped: false,
    };
  }

  /** A patch of open water just off a loaded island, within sight of the boat. */
  private findCove(boatX: number, boatZ: number): { x: number; z: number } | null {
    const islands = this.chunkManager.getIslandPositions();
    for (const isl of islands) {
      if (Math.hypot(isl.x - boatX, isl.z - boatZ) > 260) continue;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = isl.radius + 25 + Math.random() * 20;
        const x = isl.x + Math.cos(a) * r;
        const z = isl.z + Math.sin(a) * r;
        if (this.chunkManager.getTerrainHeight(x, z) <= 0 && Math.hypot(x - boatX, z - boatZ) < 240) {
          return { x, z };
        }
      }
    }
    return null;
  }

  // ── Salvage crates ───────────────────────────────────────────

  private dropCrate(x: number, z: number): void {
    const group = createCrateMesh();
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.crates.push({ group, x, z, age: 0, credits: 20 + Math.floor(Math.random() * 21) });
  }

  private updateCrates(dt: number, boatX: number, boatZ: number): void {
    const time = performance.now() / 1000;
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      c.age += dt;
      c.group.position.y = this.ocean.getWaveHeight(c.x, c.z) + 0.25;
      c.group.rotation.y += 0.4 * dt;
      c.group.rotation.z = Math.sin(time * 1.3 + c.x) * 0.12;
      if (Math.hypot(c.x - boatX, c.z - boatZ) < CRATE_COLLECT_RANGE) {
        this.callbacks.onCrateCollected(c.credits);
        this.removeCrate(i);
      } else if (c.age > CRATE_MAX_AGE) {
        this.removeCrate(i);
      }
    }
  }

  private removeCrate(i: number): void {
    disposeGroup(this.scene, this.crates[i].group);
    this.crates.splice(i, 1);
  }

  // ── Shared movement + housekeeping ───────────────────────────

  private animate(a: Aircraft, dt: number): void {
    for (const s of a.spin) s.obj.rotation[s.axis] += s.speed * dt;
  }

  /** Bank toward a target and ease altitude; returns true once horizontally near. */
  private flyToward(a: Aircraft, tx: number, ty: number, tz: number, speed: number, dt: number): boolean {
    const dx = tx - a.pos.x;
    const dz = tz - a.pos.z;
    const horiz = Math.hypot(dx, dz);
    a.heading = easeAngle(a.heading, Math.atan2(dx, dz), 1.4 * dt);
    a.pos.x += Math.sin(a.heading) * speed * dt;
    a.pos.z += Math.cos(a.heading) * speed * dt;
    a.pos.y += (ty - a.pos.y) * Math.min(1, 0.9 * dt);
    a.group.position.copy(a.pos);
    a.group.rotation.y = a.heading;
    return horiz < 16;
  }

  private disposeAircraft(a: Aircraft): void {
    disposeGroup(this.scene, a.group);
  }

  dispose(): void {
    if (this.heli) this.disposeAircraft(this.heli);
    if (this.plane) this.disposeAircraft(this.plane);
    for (const c of this.crates) disposeGroup(this.scene, c.group);
    this.heli = null;
    this.plane = null;
    this.crates = [];
  }
}

// ─── Meshes ──────────────────────────────────────────────────

function disposeGroup(scene: THREE.Scene, group: THREE.Group): void {
  scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else (m as THREE.Material).dispose();
    }
  });
}

function ellipsoid(rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  m.scale.set(rx, ry, rz);
  return m;
}

/** Coastguard helicopter — red/white body, tail boom, spinning rotors, winch. */
function createHelicopterMesh(): { group: THREE.Group; spin: Spin[]; winch: THREE.Object3D } {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcf3a2c, roughness: 0.5, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2, metalness: 0.1 });

  const body = ellipsoid(1.0, 1.0, 1.9, bodyMat);
  group.add(body);
  const nose = ellipsoid(0.85, 0.8, 0.7, glassMat);
  nose.position.set(0, 0.05, 1.5);
  group.add(nose);
  const stripe = ellipsoid(1.02, 0.18, 1.5, trimMat);
  stripe.position.y = 0.15;
  group.add(stripe);

  // Tail boom + fin (rear is -Z)
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 2.8, 10), bodyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.35, -2.6);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.6), bodyMat);
  fin.position.set(0, 0.8, -3.9);
  group.add(fin);

  // Main rotor — hub + blades, spins around Y
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), darkMat);
  mast.position.y = 1.1;
  group.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.35;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 8), darkMat);
  rotor.add(hub);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.04, 0.34), darkMat);
    blade.rotation.y = i * Math.PI / 2;
    rotor.add(blade);
  }
  group.add(rotor);

  // Tail rotor — spins around X (in a vertical plane at the boom tip)
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 0.8, -3.95);
  for (let i = 0; i < 2; i++) {
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.16), darkMat);
    tb.rotation.x = i * Math.PI / 2;
    tailRotor.add(tb);
  }
  group.add(tailRotor);

  // Skids
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), darkMat);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.7, -1.0, 0.1);
    group.add(skid);
    for (const zoff of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), darkMat);
      strut.position.set(side * 0.55, -0.65, zoff);
      strut.rotation.z = side * 0.3;
      group.add(strut);
    }
  }

  // Rescue winch line + basket — hidden until on station
  const winch = new THREE.Group();
  const len = HELI_HOVER_Y - 4;
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), darkMat);
  line.position.y = -len / 2 - 0.9;
  winch.add(line);
  const basket = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 10), trimMat);
  basket.rotation.x = Math.PI / 2;
  basket.position.y = -len - 0.9;
  winch.add(basket);
  winch.visible = false;
  group.add(winch);

  return { group, spin: [{ obj: rotor, axis: 'y', speed: 22 }, { obj: tailRotor, axis: 'x', speed: 34 }], winch };
}

/** Cargo floatplane — high wing, twin floats, nose prop. */
function createSeaplaneMesh(): { group: THREE.Group; spin: Spin[] } {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe7b23c, roughness: 0.5, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2, metalness: 0.1 });

  const body = ellipsoid(0.7, 0.78, 2.2, bodyMat);
  group.add(body);
  const cockpit = ellipsoid(0.6, 0.55, 0.8, glassMat);
  cockpit.position.set(0, 0.32, 1.0);
  group.add(cockpit);

  // High wing across the top
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.16, 1.5), trimMat);
  wing.position.set(0, 1.0, 0.2);
  group.add(wing);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), darkMat);
    strut.position.set(side * 1.3, 0.6, 0.2);
    group.add(strut);
  }

  // Twin floats below
  for (const side of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 2.6, 5, 10), trimMat);
    float.rotation.x = Math.PI / 2;
    float.position.set(side * 0.85, -1.15, 0.2);
    group.add(float);
    for (const zoff of [-0.8, 0.8]) {
      const fstrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), darkMat);
      fstrut.position.set(side * 0.7, -0.6, zoff + 0.2);
      fstrut.rotation.z = side * 0.18;
      group.add(fstrut);
    }
  }

  // Nose cowl + spinning prop (around Z)
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 12), darkMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0, 2.2);
  group.add(cowl);
  const prop = new THREE.Group();
  prop.position.set(0, 0, 2.45);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.04), darkMat);
    blade.rotation.z = i * Math.PI / 2;
    prop.add(blade);
  }
  group.add(prop);

  // Tail
  const vfin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.7), bodyMat);
  vfin.position.set(0, 0.6, -2.2);
  group.add(vfin);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.6), bodyMat);
  hstab.position.set(0, 0.2, -2.3);
  group.add(hstab);

  return { group, spin: [{ obj: prop, axis: 'z', speed: 46 }] };
}

/** Floating salvage crate with a buoy collar. */
function createCrateMesh(): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
  const slatMat = new THREE.MeshStandardMaterial({ color: 0xb07a3c, roughness: 0.8 });
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xe5562f, roughness: 0.6 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), woodMat);
  box.position.y = 0.5;
  group.add(box);
  for (const ax of [-1, 1]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.14, 0.16), slatMat);
    slat.position.set(0, 0.5 + ax * 0.28, 0.61);
    group.add(slat);
    const slat2 = slat.clone();
    slat2.position.z = -0.61;
    group.add(slat2);
  }
  // A buoy ring so it reads as floating salvage
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 8, 16), buoyMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.2;
  group.add(collar);

  return group;
}
