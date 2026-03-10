import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { BoatControl } from '../components/BoatControl';
import { WindReceiver } from '../components/WindReceiver';
import { WindSystem } from './WindSystem';
import { ChunkManager } from '../world/ChunkManager';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _sailForce = new THREE.Vector3();
const _angularDelta = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class PhysicsSystem extends System {
  private chunkManager: ChunkManager | null = null;

  constructor(private windSystem: WindSystem) {
    super(40); // priority — after buoyancy
  }

  setChunkManager(cm: ChunkManager): void {
    this.chunkManager = cm;
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('Transform', 'RigidBody')) {
      const transform = world.getComponent<Transform>(entity, 'Transform')!;
      const rb = world.getComponent<RigidBody>(entity, 'RigidBody')!;
      const ctrl = world.getComponent<BoatControl>(entity, 'BoatControl');
      const wind = world.getComponent<WindReceiver>(entity, 'WindReceiver');

      // Boat-local directions
      _forward.set(0, 0, 1).applyQuaternion(transform.quaternion);
      _right.set(1, 0, 0).applyQuaternion(transform.quaternion);

      // Sail force
      if (ctrl && wind && ctrl.sailTrim > 0.01) {
        const windVec = this.windSystem.getWindVector();
        // Apparent wind = true wind - boat velocity (in 2D)
        const apparentX = windVec.x - rb.velocity.x;
        const apparentZ = windVec.y - rb.velocity.z;

        // Angle between apparent wind and boat forward
        const windAngle = Math.atan2(apparentX, apparentZ);
        const boatAngle = Math.atan2(_forward.x, _forward.z);
        let relAngle = windAngle - boatAngle;
        // Normalize to [-PI, PI]
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        // Sail efficiency: best near 45-135 degrees, zero head-to-wind
        const absAngle = Math.abs(relAngle);
        let efficiency = 0;
        if (absAngle > 0.5 && absAngle < 2.8) {
          // Bell curve peaking around PI/2 (beam reach)
          efficiency = Math.sin(absAngle) * 0.9;
        }

        const apparentSpeed = Math.sqrt(apparentX * apparentX + apparentZ * apparentZ);
        const forceAmount = efficiency * ctrl.sailTrim * wind.sailArea * wind.liftCoefficient * apparentSpeed * 4.0;

        _sailForce.copy(_forward).multiplyScalar(forceAmount);
        rb.force.add(_sailForce);
      }

      // Engine thrust
      if (ctrl && ctrl.enginePower > 0 && Math.abs(ctrl.throttle) > 0.01) {
        rb.force.addScaledVector(_forward, ctrl.throttle * ctrl.enginePower);
      }

      // Rudder torque
      if (ctrl && Math.abs(ctrl.rudderAngle) > 0.01) {
        const speed = rb.velocity.dot(_forward);
        // Rudder effectiveness proportional to speed^2
        let rudderForce = ctrl.rudderAngle * speed * Math.abs(speed) * 2.0;
        // Propeller wash gives rudder authority even at low speed
        if (ctrl.enginePower > 0 && Math.abs(ctrl.throttle) > 0.1) {
          rudderForce += ctrl.rudderAngle * ctrl.throttle * 5.0;
        }
        rb.torque.y += -rudderForce * rb.mass * 0.1;
      }

      // Semi-implicit Euler integration
      // Update velocity
      const invMass = 1 / rb.mass;
      rb.velocity.addScaledVector(rb.force, invMass * dt);
      rb.angularVelocity.addScaledVector(rb.torque, invMass * dt * 0.01); // moment of inertia approximation

      // Update position
      transform.position.addScaledVector(rb.velocity, dt);

      // Update rotation from angular velocity
      const angSpeed = rb.angularVelocity.length();
      if (angSpeed > 0.0001) {
        _axis.copy(rb.angularVelocity).normalize();
        _angularDelta.setFromAxisAngle(_axis, angSpeed * dt);
        transform.quaternion.premultiply(_angularDelta);
        transform.quaternion.normalize();
      }

      // Island ground collision — push boat off land
      if (this.chunkManager) {
        const terrainH = this.chunkManager.getTerrainHeight(
          transform.position.x, transform.position.z
        );
        if (terrainH > 0.5) {
          // Find nearest island center to push away from
          const islands = this.chunkManager.getIslandPositions();
          let nearestDist = Infinity;
          let pushX = 0, pushZ = 0;
          for (const isl of islands) {
            const dx = transform.position.x - isl.x;
            const dz = transform.position.z - isl.z;
            const d = dx * dx + dz * dz;
            if (d < nearestDist) {
              nearestDist = d;
              const len = Math.sqrt(d) || 1;
              pushX = dx / len;
              pushZ = dz / len;
            }
          }
          // Gentle repulsion — kill inward velocity, set outward drift
          const outwardSpeed = rb.velocity.x * pushX + rb.velocity.z * pushZ;
          // If moving inward (outwardSpeed < 0) or too slow, set to gentle outward
          const desiredPush = Math.min(4, 1 + terrainH * 0.2);
          if (outwardSpeed < desiredPush) {
            rb.velocity.x = pushX * desiredPush;
            rb.velocity.z = pushZ * desiredPush;
          }
          // Nudge position outward so it doesn't stick
          transform.position.x += pushX * 2 * dt;
          transform.position.z += pushZ * 2 * dt;
        }
      }

      // Sync euler from quaternion
      transform.rotation.setFromQuaternion(transform.quaternion);
    }
  }
}
