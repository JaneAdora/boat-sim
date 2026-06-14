/**
 * Flight state for an aircraft-capable hull (the seaplane). Present only on
 * craft with `canFly`. The SeaplaneSystem owns it: on the water `airborne` is
 * false and normal boat physics run; once it rotates at speed, `airborne` flips,
 * the rigid body goes kinematic, and these fields drive the transform directly.
 */
export interface Flight {
  airborne: boolean;
  airspeed: number;  // m/s, horizontal
  altitude: number;  // m above sea level
  vspeed: number;    // m/s, vertical
  heading: number;   // yaw, radians
  bank: number;      // roll, radians (visual)
  pitch: number;     // pitch, radians (visual)
}

export function createFlight(): Flight {
  return { airborne: false, airspeed: 0, altitude: 0, vspeed: 0, heading: 0, bank: 0, pitch: 0 };
}
