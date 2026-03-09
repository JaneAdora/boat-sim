import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Buoyancy } from '../components/Buoyancy';
import { Ocean } from '../rendering/Ocean';

const GRAVITY = 9.81;
const _worldPoint = new THREE.Vector3();
const _force = new THREE.Vector3();
const _leverArm = new THREE.Vector3();
const _torque = new THREE.Vector3();

export class BuoyancySystem extends System {
  constructor(private ocean: Ocean) {
    super(30); // priority
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

        // Get wave height at this point
        const waterHeight = this.ocean.getWaveHeight(_worldPoint.x, _worldPoint.z);
        const depth = waterHeight - _worldPoint.y;

        if (depth > 0) {
          // Buoyancy force proportional to submersion depth
          const forceMagnitude = buoyancy.waterDensity * GRAVITY * depth * point.area;

          _force.set(0, forceMagnitude, 0);
          rb.force.add(_force);

          // Compute torque from off-center force application
          _leverArm.copy(_worldPoint).sub(transform.position);
          _torque.crossVectors(_leverArm, _force);
          rb.torque.add(_torque);
        }
      }

      // Damping (resist velocity — simulates water resistance)
      const speed = rb.velocity.length();
      if (speed > 0.001) {
        // Get boat's forward direction
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(transform.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(transform.quaternion);

        // Decompose velocity into forward and lateral
        const forwardSpeed = rb.velocity.dot(forward);
        const lateralSpeed = rb.velocity.dot(right);

        // Lateral drag is much higher than forward drag (boats resist sideways motion)
        const forwardDrag = -forwardSpeed * buoyancy.dampingLinear * 0.3;
        const lateralDrag = -lateralSpeed * buoyancy.dampingLinear * 3.0;
        const verticalDrag = -rb.velocity.y * buoyancy.dampingLinear * 1.0;

        rb.force.addScaledVector(forward, forwardDrag * rb.mass);
        rb.force.addScaledVector(right, lateralDrag * rb.mass);
        rb.force.y += verticalDrag * rb.mass;
      }

      // Angular damping
      rb.torque.addScaledVector(rb.angularVelocity, -buoyancy.dampingAngular * rb.mass);
    }
  }
}
