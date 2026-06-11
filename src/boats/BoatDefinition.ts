import * as THREE from 'three';

export interface BoatDefinition {
  name: string;
  meshType: 'sailboat' | 'tugboat' | 'cruiseship' | 'speedboat' | 'vikingship';
  mass: number;
  hullSamplePoints: { offset: THREE.Vector3; area: number }[];
  sailArea: number;       // 0 for motorboats
  enginePower: number;    // max thrust in Newtons (0 for pure sailboats)
  maxSpeedKnots: number;  // top speed at full throttle on calm water
  turnRadius: number;     // meters — radius of the circle carved at full rudder
  rudderSlew: number;     // how fast the rudder reaches full deflection (per second)
  propWash: number;       // rad/s of yaw authority from throttle at near-standstill
}

export const KNOTS_TO_MS = 1 / 1.94;

/** Linear (low-speed) drag coefficient shared by all hulls — gives gentle
 *  coasting decay. Top speed is set by the quadratic term below. */
export const DRAG_LINEAR = 0.03;

/**
 * Quadratic drag coefficient that makes full-throttle thrust balance drag
 * exactly at the boat's declared maxSpeedKnots. Tuning lives in player-facing
 * units (knots, meters) and the physics is derived — not the other way round.
 */
export function deriveDragQuad(def: BoatDefinition): number {
  const vMax = def.maxSpeedKnots * KNOTS_TO_MS;
  // Sailboats have no engine; assume a nominal peak sail acceleration.
  const accel = def.enginePower > 0 ? def.enginePower / def.mass : 2.0;
  return Math.max(0.0005, (accel - DRAG_LINEAR * vMax) / (vMax * vMax));
}
