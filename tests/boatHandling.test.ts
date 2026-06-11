import { describe, expect, it } from 'vitest';
import { deriveDragQuad, DRAG_LINEAR, KNOTS_TO_MS, BoatDefinition } from '../src/boats/BoatDefinition';
import { TUGBOAT } from '../src/boats/Tugboat';
import { SPEEDBOAT } from '../src/boats/Speedboat';
import { CRUISE_SHIP } from '../src/boats/CruiseShip';
import { VIKING_SHIP } from '../src/boats/VikingShip';
import { SAILBOAT } from '../src/boats/Sailboat';

const MOTOR_BOATS = [TUGBOAT, SPEEDBOAT, CRUISE_SHIP, VIKING_SHIP];

/** Integrate dv/dt = thrust/m − (c1·v + c2·v²) to terminal velocity. */
function simulateTerminalSpeed(def: BoatDefinition): number {
  const c2 = deriveDragQuad(def);
  const accel = def.enginePower / def.mass;
  let v = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 120; t += dt) {
    v += (accel - (DRAG_LINEAR * v + c2 * v * v)) * dt;
  }
  return v;
}

describe('boat handling model', () => {
  it('full throttle settles at each boat\'s declared maxSpeedKnots', () => {
    for (const def of MOTOR_BOATS) {
      const terminalKnots = simulateTerminalSpeed(def) / KNOTS_TO_MS;
      // Within 2% — the drag coefficient is derived to balance exactly there
      expect(terminalKnots, def.name).toBeGreaterThan(def.maxSpeedKnots * 0.98);
      expect(terminalKnots, def.name).toBeLessThan(def.maxSpeedKnots * 1.02);
    }
  });

  it('keeps the viking ship the fastest boat (the sleeper)', () => {
    for (const def of MOTOR_BOATS) {
      if (def !== VIKING_SHIP) {
        expect(VIKING_SHIP.maxSpeedKnots).toBeGreaterThan(def.maxSpeedKnots);
      }
    }
    // ...but the speedboat still launches hardest off the line
    expect(SPEEDBOAT.enginePower / SPEEDBOAT.mass).toBeGreaterThan(
      VIKING_SHIP.enginePower / VIKING_SHIP.mass,
    );
  });

  it('derives a positive drag coefficient for every hull, sailboat included', () => {
    for (const def of [...MOTOR_BOATS, SAILBOAT]) {
      expect(deriveDragQuad(def), def.name).toBeGreaterThan(0);
    }
  });

  it('keeps every boat\'s full-rudder yaw rate under the physics clamp', () => {
    // BuoyancySystem hard-clamps angular velocity at 0.8 rad/s; the steering
    // target v_max/turnRadius must stay below it or turn radii widen at speed.
    for (const def of MOTOR_BOATS) {
      const maxYaw = (def.maxSpeedKnots * KNOTS_TO_MS) / def.turnRadius + def.propWash;
      expect(maxYaw, def.name).toBeLessThan(0.8);
    }
  });
});
