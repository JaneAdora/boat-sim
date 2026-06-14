import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { InputManager } from '../core/InputManager';
import { BoatControl } from '../components/BoatControl';
import { Flight } from '../components/Flight';
import { TouchControls } from '../ui/TouchControls';
import { clamp } from '../utils/math';

export class BoatControlSystem extends System {
  private touchControls: TouchControls | null = null;

  constructor(private input: InputManager) {
    super(10); // priority
  }

  setTouchControls(tc: TouchControls): void {
    this.touchControls = tc;
  }

  update(world: World, dt: number): void {
    for (const entity of world.query('BoatControl')) {
      const ctrl = world.getComponent<BoatControl>(entity, 'BoatControl')!;

      const tc = this.touchControls;
      const hasTouch = tc && (tc.rudder !== 0 || tc.throttle !== 0);

      const wPressed = this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp');
      const sPressed = this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown');

      // Engine throttle
      if (ctrl.enginePower > 0) {
        if (hasTouch) {
          // Touch: direct mapping (throttle slider stays where released)
          const diff = tc!.throttle - ctrl.throttle;
          ctrl.throttle += Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt);
        } else {
          let throttleTarget = 0;
          if (wPressed) throttleTarget = 1;
          if (sPressed) throttleTarget = -1;
          const diff = throttleTarget - ctrl.throttle;
          ctrl.throttle += Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt);
        }
      }

      // The seaplane's prop only pulls forward — no reverse on the water.
      if (ctrl.throttle < 0 && world.getComponent<Flight>(entity, 'Flight')) {
        ctrl.throttle = 0;
      }

      // Sail trim (for sailboats)
      if (wPressed) {
        ctrl.sailTrim = clamp(ctrl.sailTrim + ctrl.sailTrimSpeed * dt, 0, 1);
      }
      if (sPressed) {
        ctrl.sailTrim = clamp(ctrl.sailTrim - ctrl.sailTrimSpeed * dt, 0, 1);
      }

      // Rudder
      let rudderTarget = 0;
      if (hasTouch) {
        rudderTarget = tc!.rudder;
      } else {
        if (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) {
          rudderTarget = -1;
        }
        if (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) {
          rudderTarget = 1;
        }
      }

      const rudderDiff = rudderTarget - ctrl.rudderAngle;
      if (Math.abs(rudderDiff) > 0.01) {
        ctrl.rudderAngle += Math.sign(rudderDiff) * Math.min(Math.abs(rudderDiff), ctrl.rudderSpeed * dt);
      } else {
        ctrl.rudderAngle = rudderTarget;
      }

      if (rudderTarget === 0) {
        ctrl.rudderAngle *= Math.max(0, 1 - 3 * dt);
      }
    }
  }
}
