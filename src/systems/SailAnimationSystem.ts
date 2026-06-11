import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { BoatControl } from '../components/BoatControl';
import { WindSystem } from './WindSystem';
import { smoothDamp } from '../utils/math';

interface BoatVisuals {
  sailPivot: THREE.Group | null;
  rudderPivot: THREE.Group | null; // commandeered NPC hulls have no rigged rudder
}

export class SailAnimationSystem extends System {
  private currentSailAngle = 0;
  private currentRudderAngle = 0;

  constructor(private windSystem: WindSystem) {
    super(85); // after physics, before render
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('Transform', 'BoatControl', 'BoatVisuals')) {
      const transform = world.getComponent<Transform>(entity, 'Transform')!;
      const ctrl = world.getComponent<BoatControl>(entity, 'BoatControl')!;
      const visuals = world.getComponent<BoatVisuals>(entity, 'BoatVisuals')!;

      // === SAIL ANGLE ===
      // The sail swings to catch the wind. Its angle depends on:
      // 1. The apparent wind direction relative to the boat
      // 2. The sail trim (how much sheet is let out)

      const windVec = this.windSystem.getWindVector();
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(transform.quaternion);

      // Wind angle relative to boat heading
      const windAngle = Math.atan2(windVec.x, windVec.y);
      const boatAngle = Math.atan2(forward.x, forward.z);
      let relWindAngle = windAngle - boatAngle;
      while (relWindAngle > Math.PI) relWindAngle -= Math.PI * 2;
      while (relWindAngle < -Math.PI) relWindAngle += Math.PI * 2;

      // Sail swings to leeward side, constrained by trim
      // More trim = sail can swing further out
      // Less trim = sail pulled tight to centerline
      const maxSailAngle = ctrl.sailTrim * 1.2; // max ~70 degrees at full trim
      let targetSailAngle: number;

      if (ctrl.sailTrim < 0.05) {
        // Sail furled — point straight back (luffing)
        targetSailAngle = 0;
      } else {
        // Sail fills on the leeward side
        targetSailAngle = Math.sign(relWindAngle) * Math.min(Math.abs(relWindAngle * 0.5), maxSailAngle);
      }

      // Smooth sail movement (sails don't snap instantly)
      this.currentSailAngle = smoothDamp(this.currentSailAngle, targetSailAngle, 3, dt);
      if (visuals.sailPivot) {
        visuals.sailPivot.rotation.y = this.currentSailAngle;
      }

      // === RUDDER ANGLE ===
      // Rudder turns opposite to steering direction (visual convention)
      const targetRudder = -ctrl.rudderAngle * 0.6; // max ~35 degrees
      this.currentRudderAngle = smoothDamp(this.currentRudderAngle, targetRudder, 8, dt);
      if (visuals.rudderPivot) {
        visuals.rudderPivot.rotation.y = this.currentRudderAngle;
      }
    }
  }
}
