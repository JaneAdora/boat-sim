import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Buoyancy } from '../components/Buoyancy';
import { Ocean } from '../rendering/Ocean';
import { ChunkManager } from '../world/ChunkManager';

const GRAVITY = 9.81;
const HOVER_GAP = 0.45;     // cushion height an amphibious hull floats above land
const MAX_LAND_LIFT = 1.0;  // cap on over-land lift depth — climb steep shores, don't launch
const _worldPoint = new THREE.Vector3();
const _force = new THREE.Vector3();
const _leverArm = new THREE.Vector3();
const _torque = new THREE.Vector3();

export class BuoyancySystem extends System {
  private chunkManager: ChunkManager | null = null;

  constructor(private ocean: Ocean) {
    super(30); // priority
  }

  setChunkManager(cm: ChunkManager): void {
    this.chunkManager = cm;
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('Transform', 'RigidBody', 'Buoyancy')) {
      const transform = world.getComponent<Transform>(entity, 'Transform')!;
      const rb = world.getComponent<RigidBody>(entity, 'RigidBody')!;
      const buoyancy = world.getComponent<Buoyancy>(entity, 'Buoyancy')!;

      // Reset forces
      rb.force.set(0, 0, 0);
      rb.torque.set(0, 0, 0);

      // Gravity
      rb.force.y -= rb.mass * GRAVITY;

      // Buoyancy at each sample point
      for (const point of buoyancy.samplePoints) {
        // Transform sample point to world space
        _worldPoint.copy(point.localOffset);
        _worldPoint.applyQuaternion(transform.quaternion);
        _worldPoint.add(transform.position);

        // Support height under this point. A hovercraft rides a cushion above
        // whatever is higher — the wave or the land — so it climbs onto beaches.
        let supportHeight = this.ocean.getWaveHeight(_worldPoint.x, _worldPoint.z);
        let onLand = false;
        if (buoyancy.amphibious && this.chunkManager) {
          const terrainH = this.chunkManager.getTerrainHeight(_worldPoint.x, _worldPoint.z);
          if (terrainH > 0 && terrainH + HOVER_GAP > supportHeight) {
            supportHeight = terrainH + HOVER_GAP;
            onLand = true;
          }
        }
        // Cap the cushion's lift over land so a steep shore is climbed, not
        // launched off of. Water buoyancy is left untouched.
        let depth = supportHeight - _worldPoint.y;
        if (onLand) depth = Math.min(depth, MAX_LAND_LIFT);

        if (depth > 0) {
          // Buoyancy force proportional to submersion depth
          const forceMagnitude = buoyancy.waterDensity * GRAVITY * depth * point.area;

          _force.set(0, forceMagnitude, 0);
          rb.force.add(_force);

          // Torque = r × F (standard physics formula)
          // r = vector from center of mass to force application point
          _leverArm.copy(_worldPoint).sub(transform.position);
          _torque.crossVectors(_leverArm, _force);
          rb.torque.add(_torque);
        }
      }

      // Damping (resist velocity — simulates water resistance)
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(transform.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(transform.quaternion);

      const forwardSpeed = rb.velocity.dot(forward);
      const lateralSpeed = rb.velocity.dot(right);

      // Forward drag: linear term for coasting feel + quadratic term that
      // balances full thrust exactly at the boat's declared top speed.
      const forwardDrag = buoyancy.dragLinear * forwardSpeed
        + buoyancy.dragQuad * forwardSpeed * Math.abs(forwardSpeed);
      rb.force.addScaledVector(forward, -forwardDrag * rb.mass);
      rb.force.addScaledVector(right, -lateralSpeed * buoyancy.dampingLinear * 3.0 * rb.mass);
      // Heavier vessels get stronger vertical damping to prevent bobbing
      const verticalDampScale = rb.mass > 10000 ? 5.0 : 2.0;
      rb.force.y += -rb.velocity.y * buoyancy.dampingLinear * verticalDampScale * rb.mass;

      // === STABILITY SYSTEM ===
      // Boats self-right due to keel weight and hull shape (metacentric height).
      // We model this as a strong restoring torque that pushes the boat upright.

      const boatUp = new THREE.Vector3(0, 1, 0).applyQuaternion(transform.quaternion);
      const worldUp = new THREE.Vector3(0, 1, 0);

      // Restoring axis: cross product of boat-up with world-up
      // gives the axis to rotate around to get back upright
      const restoreAxis = new THREE.Vector3().crossVectors(boatUp, worldUp);
      const tiltAmount = restoreAxis.length(); // sin(tilt angle)

      if (tiltAmount > 0.001) {
        restoreAxis.normalize();
        // Very strong righting force — this is what keeps a keelboat from capsizing
        const rightingStrength = tiltAmount * rb.mass * 25.0;
        rb.torque.addScaledVector(restoreAxis, rightingStrength);
      }

      // Strong angular damping to prevent oscillation
      rb.torque.addScaledVector(rb.angularVelocity, -rb.mass * 8.0);

      // Hard clamp angular velocity — boats don't spin fast
      const maxAngVel = 0.8; // rad/s
      const angSpeed = rb.angularVelocity.length();
      if (angSpeed > maxAngVel) {
        rb.angularVelocity.multiplyScalar(maxAngVel / angSpeed);
      }
    }
  }
}
