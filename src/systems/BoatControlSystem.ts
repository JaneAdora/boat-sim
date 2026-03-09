import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { InputManager } from '../core/InputManager';
import { BoatControl } from '../components/BoatControl';
import { clamp } from '../utils/math';

export class BoatControlSystem extends System {
  constructor(private input: InputManager) {
    super(10); // priority
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('BoatControl')) {
      const ctrl = world.getComponent<BoatControl>(entity, 'BoatControl')!;

      // Sail trim
      if (this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp')) {
        ctrl.sailTrim = clamp(ctrl.sailTrim + ctrl.sailTrimSpeed * dt, 0, 1);
      }
      if (this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown')) {
        ctrl.sailTrim = clamp(ctrl.sailTrim - ctrl.sailTrimSpeed * dt, 0, 1);
      }

      // Rudder
      let rudderTarget = 0;
      if (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) {
        rudderTarget = -1;
      }
      if (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) {
        rudderTarget = 1;
      }

      // Smoothly move rudder toward target
      const diff = rudderTarget - ctrl.rudderAngle;
      if (Math.abs(diff) > 0.01) {
        ctrl.rudderAngle += Math.sign(diff) * Math.min(Math.abs(diff), ctrl.rudderSpeed * dt);
      } else {
        ctrl.rudderAngle = rudderTarget;
      }

      // Center rudder when no input
      if (rudderTarget === 0) {
        ctrl.rudderAngle *= Math.max(0, 1 - 3 * dt); // decay to zero
      }
    }
  }
}
