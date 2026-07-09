import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Dive } from '../components/Dive';
import { MeshRenderable } from '../components/MeshRenderable';
import { InputManager } from '../core/InputManager';
import { ChunkManager } from '../world/ChunkManager';
import { TouchControls } from '../ui/TouchControls';
import { SoundEffects } from '../audio/SoundEffects';
import { clamp } from '../utils/math';

const SUB_MAX_SPEED = 6.5;   // m/s submerged
const SPEED_EASE = 1.4;
const TURN_RATE = 0.6;       // rad/s — subs turn lazily
const VS_ACCEL = 5;
const MAX_VS = 6;
const MAX_DEPTH = -35;       // y floor
const DIVE_PITCH_K = 0.06;
const PROP_SPIN = 30;
const SONAR_INTERVAL = 4.5;
const SONAR_RANGE = 230;
const RING_LIFE = 2.6;

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fwd = new THREE.Vector3();

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function cardinal(dx: number, dz: number): string {
  const idx = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS[idx];
}

export interface SubmarineCallbacks {
  /** A wreck field came into sonar range — surface a toast. */
  onSonarContact: (text: string) => void;
}

interface Ring { mesh: THREE.Mesh; age: number; }

/**
 * Submarine dive controller — the mirror of the seaplane, pointing down. On the
 * surface it's a slow boat; hold descend and it floods the ballast, goes
 * kinematic, and slips under: W/S throttle (it reverses, unlike the plane), A/D
 * rudder, Space/▲ ascend, Shift/▼ dive, down to the wreck graveyards. Sonar pings
 * sweep on a timer, ring out, and announce nearby wrecks. Surface again and the
 * hull pops back up. Only ever touches a hull with a Dive component.
 */
export class SubmarineSystem extends System {
  private touch: TouchControls | null = null;
  private rings: Ring[] = [];
  private sonarTimer = SONAR_INTERVAL;
  private contacted = new Set<string>();
  // Act 2: the dive floor is a live provider, not a constant — the deep refit
  // (beat 11) extends it mid-session, and the trench profile varies it by
  // position. Default = Act 1's flat −35 everywhere.
  private maxDepthAt: (x: number, z: number) => number = () => MAX_DEPTH;
  // Below the old world floor the water is lightless; a headlight rides along.
  private headlight: THREE.PointLight | null = null;

  constructor(
    private scene: THREE.Scene,
    private input: InputManager,
    private chunkManager: ChunkManager,
    private soundEffects: SoundEffects,
    private callbacks: SubmarineCallbacks,
  ) {
    super(46); // after physics (40) / seaplane (45), before camera (80)
  }

  setTouchControls(tc: TouchControls): void {
    this.touch = tc;
  }

  /** Act 2: install a position-aware dive floor (deep refit / trench). */
  setMaxDepthProvider(fn: (x: number, z: number) => number): void {
    this.maxDepthAt = fn;
  }

  update(world: World, dt: number): void {
    this.updateRings(dt);

    for (const entity of world.query('Transform', 'RigidBody', 'Dive')) {
      const t = world.getComponent<Transform>(entity, 'Transform')!;
      const rb = world.getComponent<RigidBody>(entity, 'RigidBody')!;
      const d = world.getComponent<Dive>(entity, 'Dive')!;

      const up = this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp');
      const down = this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown');
      const left = this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft');
      const right = this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight');
      const ascend = this.input.isPressed('Space') || this.touch?.climb === true;
      const descend = this.input.isPressed('ShiftLeft') || this.input.isPressed('ShiftRight') || this.touch?.dive === true;

      if (!d.submerged) {
        // On the surface: a boat. Hold descend to flood the ballast and dive.
        this.spinProp(world, entity, dt, 0.35);
        if (descend) {
          d.submerged = true;
          rb.kinematic = true;
          d.speed = Math.hypot(rb.velocity.x, rb.velocity.z);
          d.vspeed = -2.5;
          _fwd.set(0, 0, 1).applyQuaternion(t.quaternion);
          d.heading = Math.atan2(_fwd.x, _fwd.z);
          d.pitch = 0;
        }
        continue;
      }

      // Submerged — kinematic dive control.
      const thr = clamp((up ? 1 : 0) - (down ? 1 : 0) + (this.touch?.throttle ?? 0), -1, 1);
      d.speed += (thr * SUB_MAX_SPEED - d.speed) * Math.min(1, SPEED_EASE * dt);

      const turnInput = clamp((right ? 1 : 0) - (left ? 1 : 0) + (this.touch?.rudder ?? 0), -1, 1);
      const speedFactor = Math.min(1, Math.abs(d.speed) / 3);
      d.heading -= turnInput * TURN_RATE * speedFactor * dt; // matches the boat rudder

      if (descend) d.vspeed -= VS_ACCEL * dt;
      else if (ascend) d.vspeed += VS_ACCEL * dt;
      else d.vspeed += (0 - d.vspeed) * Math.min(1, 3 * dt); // hands off → hold depth
      d.vspeed = clamp(d.vspeed, -MAX_VS, MAX_VS);

      t.position.x += Math.sin(d.heading) * d.speed * dt;
      t.position.z += Math.cos(d.heading) * d.speed * dt;
      const floor = this.maxDepthAt(t.position.x, t.position.z);
      t.position.y = clamp(t.position.y + d.vspeed * dt, floor, 0.5);
      d.depth = Math.max(0, -t.position.y);
      this.updateHeadlight(t, d);

      // Nose down when diving, up when climbing (positive pitch is nose-down).
      d.pitch += (clamp(-d.vspeed * DIVE_PITCH_K, -0.35, 0.35) - d.pitch) * Math.min(1, 5 * dt);
      _euler.set(d.pitch, d.heading, 0);
      t.quaternion.setFromEuler(_euler);
      t.rotation.copy(_euler);

      rb.velocity.set(Math.sin(d.heading) * d.speed, d.vspeed, Math.cos(d.heading) * d.speed);
      rb.angularVelocity.set(0, 0, 0);
      this.spinProp(world, entity, dt, 0.5 + Math.abs(d.speed) / SUB_MAX_SPEED);

      this.updateSonar(dt, t.position.x, t.position.y, t.position.z);

      // Break the surface (and not still diving) → become a boat again.
      if (t.position.y >= -0.3 && !descend) {
        d.submerged = false;
        rb.kinematic = false;
        d.depth = 0;
        rb.velocity.y = 0;
        _euler.set(0, d.heading, 0);
        t.quaternion.setFromEuler(_euler);
        t.rotation.copy(_euler);
        if (this.headlight) this.headlight.visible = false;
      }
    }
  }

  private updateSonar(dt: number, x: number, y: number, z: number): void {
    this.sonarTimer -= dt;
    if (this.sonarTimer > 0) return;
    this.sonarTimer = SONAR_INTERVAL;

    this.soundEffects.playSonarPing();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.85, 36),
      new THREE.MeshBasicMaterial({ color: 0x5fe0c0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, age: 0 });

    // Announce a wreck field the first time it pings within range.
    for (const lm of this.chunkManager.getLandmarks()) {
      if (lm.type !== 'wrecks') continue;
      const dx = lm.x - x;
      const dz = lm.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > SONAR_RANGE) continue;
      const key = `${Math.round(lm.x)},${Math.round(lm.z)}`;
      if (this.contacted.has(key)) continue;
      this.contacted.add(key);
      this.callbacks.onSonarContact(`Wreck field · ${Math.round(dist)}m ${cardinal(dx, dz)}`);
    }
  }

  private updateRings(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const k = r.age / RING_LIFE;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(1 + k * 40);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
  }

  /** A soft lamp riding the hull, fading in below the old world floor where
   *  the deep zone goes lightless. Cheap point light — no shadow, no target. */
  private updateHeadlight(t: Transform, d: Dive): void {
    if (!this.headlight) {
      this.headlight = new THREE.PointLight(0xcfe8e0, 0, 55, 1.6);
      this.scene.add(this.headlight);
    }
    const fade = clamp((-t.position.y - 30) / 15, 0, 1); // 0 above −30 → 1 by −45
    this.headlight.visible = d.submerged && fade > 0;
    this.headlight.intensity = 2.4 * fade;
    // Sit slightly ahead of the bow so the light reads as a lamp, not a glow.
    this.headlight.position.set(
      t.position.x + Math.sin(d.heading) * 6,
      t.position.y + 1,
      t.position.z + Math.cos(d.heading) * 6,
    );
  }

  private spinProp(world: World, entity: number, dt: number, rate: number): void {
    const mr = world.getComponent<MeshRenderable>(entity, 'MeshRenderable');
    const prop = mr?.object3D.getObjectByName('prop');
    if (prop) prop.rotation.z += PROP_SPIN * rate * dt;
  }

  dispose(): void {
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings = [];
    if (this.headlight) {
      this.scene.remove(this.headlight);
      this.headlight.dispose();
      this.headlight = null;
    }
  }
}
