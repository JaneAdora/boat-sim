import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Buoyancy } from '../components/Buoyancy';
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
      const buoyancy = world.getComponent<Buoyancy>(entity, 'Buoyancy');

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

      // Engine thrust — running with the wind is up to ~10% faster, beating
      // into it ~10% slower, so heading and weather become navigation choices.
      if (ctrl && ctrl.enginePower > 0 && Math.abs(ctrl.throttle) > 0.01) {
        const wind = this.windSystem.getWindVector();
        const align = (wind.x * _forward.x + wind.y * _forward.z) / 8; // strength tops out ~8 m/s
        const windFactor = 1 + Math.max(-1, Math.min(1, align)) * 0.1;
        rb.force.addScaledVector(_forward, ctrl.throttle * ctrl.enginePower * windFactor);
      }

      // Steering — carve toward a target yaw rate instead of applying raw
      // rudder torque. Target = rudder × (signed speed / turn radius), so the
      // boat holds a consistent turning circle at any speed (and steering
      // naturally flips in reverse). Prop wash adds helm authority at
      // near-standstill so docking turns still answer.
      if (ctrl && Math.abs(ctrl.rudderAngle) > 0.01) {
        const speed = rb.velocity.dot(_forward);
        // Wash only matters near standstill — fade it out by ~6 m/s so it
        // doesn't tighten the carve radius at cruising speed.
        const washFade = Math.max(0, 1 - Math.abs(speed) / 6);
        const wash = ctrl.enginePower > 0 ? ctrl.throttle * ctrl.propWash * washFade : 0;
        const targetYaw = -ctrl.rudderAngle * (speed / ctrl.turnRadius + wash);
        rb.angularVelocity.y += (targetYaw - rb.angularVelocity.y) * Math.min(1, 3.0 * dt);

        // Hard turns scrub a little speed — rewards smooth lines
        rb.force.addScaledVector(
          _forward,
          -speed * Math.abs(rb.angularVelocity.y) * Math.abs(ctrl.rudderAngle) * 0.4 * rb.mass,
        );
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

      // Island ground collision — push boat off land. Amphibious craft (the
      // hovercraft) are exempt: they ride up onto the beach instead.
      if (this.chunkManager && !(buoyancy && buoyancy.amphibious)) {
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
