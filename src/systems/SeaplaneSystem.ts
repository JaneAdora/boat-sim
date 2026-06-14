import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Flight } from '../components/Flight';
import { MeshRenderable } from '../components/MeshRenderable';
import { InputManager } from '../core/InputManager';
import { ChunkManager } from '../world/ChunkManager';
import { clamp } from '../utils/math';

// Tunable arcade-flight feel. Water top speed is set by the boat def; these are
// the airborne envelope.
const TAKEOFF_SPEED = 16; // m/s on the water before it'll rotate
const STALL_SPEED = 12;   // below this, lift bleeds and it sinks
const MAX_AIRSPEED = 32;
const AIR_ACCEL = 11;     // throttle response
const AIR_DRAG = 1.6;     // passive airspeed bleed
const TURN_RATE = 0.85;   // rad/s at cruise
const MAX_BANK = 0.5;     // visual roll into a turn
const VS_ACCEL = 10;      // climb/dive response
const MAX_VS = 14;
const MAX_ALT = 145;
const STALL_SINK = 13;
const PROP_SPIN = 42;
const TOUCHDOWN_ALT = 0.3;

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fwd = new THREE.Vector3();

/**
 * Seaplane flight controller. On the water the hull is a normal boat (buoyancy +
 * physics). Build past TAKEOFF_SPEED and hold climb and it rotates off: the rigid
 * body goes kinematic and this drives the transform — W/S airspeed, A/D bank-turn,
 * Space climb, Shift dive, auto-levelling roll, a stall floor, and a terrain floor
 * so you can't fly through islands. Touch back down on water and the floats catch
 * it. Only ever touches a hull that has a Flight component (the seaplane).
 */
export class SeaplaneSystem extends System {
  constructor(private input: InputManager, private chunkManager: ChunkManager) {
    super(45); // after physics (40), before camera (80)
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('Transform', 'RigidBody', 'Flight')) {
      const t = world.getComponent<Transform>(entity, 'Transform')!;
      const rb = world.getComponent<RigidBody>(entity, 'RigidBody')!;
      const f = world.getComponent<Flight>(entity, 'Flight')!;

      const up = this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp');
      const down = this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown');
      const left = this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft');
      const right = this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight');
      const climb = this.input.isPressed('Space');
      const dive = this.input.isPressed('ShiftLeft') || this.input.isPressed('ShiftRight');

      if (!f.airborne) {
        // On the water: a boat. Spin the prop slowly, and rotate off if we're
        // fast enough and the pilot is pulling up.
        this.spinProp(world, entity, dt, 0.4);
        const speed = Math.hypot(rb.velocity.x, rb.velocity.z);
        if (speed > TAKEOFF_SPEED && climb) {
          f.airborne = true;
          rb.kinematic = true;
          f.airspeed = speed;
          f.altitude = Math.max(0, t.position.y);
          f.vspeed = 3;
          _fwd.set(0, 0, 1).applyQuaternion(t.quaternion);
          f.heading = Math.atan2(_fwd.x, _fwd.z);
          f.bank = 0;
          f.pitch = 0;
        }
        continue;
      }

      // Airborne — arcade flight.
      if (up) f.airspeed += AIR_ACCEL * dt;
      if (down) f.airspeed -= AIR_ACCEL * dt;
      f.airspeed = clamp(f.airspeed - AIR_DRAG * dt, 0, MAX_AIRSPEED);

      const turn = (right ? 1 : 0) - (left ? 1 : 0); // +1 turns right, matching the boat
      const speedFactor = Math.min(1, f.airspeed / 18);
      f.heading += turn * TURN_RATE * speedFactor * dt;
      f.bank += (-turn * MAX_BANK - f.bank) * Math.min(1, 5 * dt);

      if (climb) f.vspeed += VS_ACCEL * dt;
      else if (dive) f.vspeed -= VS_ACCEL * dt;
      else f.vspeed += (0 - f.vspeed) * Math.min(1, 3 * dt); // hands off → hold altitude
      if (f.airspeed < STALL_SPEED) f.vspeed -= STALL_SINK * (1 - f.airspeed / STALL_SPEED) * dt;
      f.vspeed = clamp(f.vspeed, -MAX_VS, MAX_VS);
      f.altitude += f.vspeed * dt;

      t.position.x += Math.sin(f.heading) * f.airspeed * dt;
      t.position.z += Math.cos(f.heading) * f.airspeed * dt;

      // Terrain floor so you skim over islands instead of through them.
      const terrainH = this.chunkManager.getTerrainHeight(t.position.x, t.position.z);
      const minAlt = terrainH > 0 ? terrainH + 3 : 0;
      if (f.altitude < minAlt) { f.altitude = minAlt; if (f.vspeed < 0) f.vspeed = 0; }
      f.altitude = Math.min(f.altitude, MAX_ALT);
      t.position.y = f.altitude;

      f.pitch += (clamp(f.vspeed * 0.045, -0.4, 0.4) - f.pitch) * Math.min(1, 5 * dt);
      _euler.set(f.pitch, f.heading, f.bank);
      t.quaternion.setFromEuler(_euler);
      t.rotation.copy(_euler);

      rb.velocity.set(Math.sin(f.heading) * f.airspeed, f.vspeed, Math.cos(f.heading) * f.airspeed);
      rb.angularVelocity.set(0, 0, 0);
      this.spinProp(world, entity, dt, 1);

      // Touch down on water → become a boat again; the floats take over.
      if (f.altitude <= TOUCHDOWN_ALT && terrainH <= 0) {
        f.airborne = false;
        rb.kinematic = false;
        f.altitude = 0;
        rb.velocity.y = 0;
        _euler.set(0, f.heading, 0);
        t.quaternion.setFromEuler(_euler);
        t.rotation.copy(_euler);
      }
    }
  }

  private spinProp(world: World, entity: number, dt: number, rate: number): void {
    const mr = world.getComponent<MeshRenderable>(entity, 'MeshRenderable');
    const prop = mr?.object3D.getObjectByName('prop');
    if (prop) prop.rotation.z += PROP_SPIN * rate * dt;
  }
}
