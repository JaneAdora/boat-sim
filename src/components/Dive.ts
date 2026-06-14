/**
 * Dive state for a submersible hull (the submarine). Present only on craft with
 * `canDive`. The SubmarineSystem owns it: on the surface `submerged` is false and
 * normal boat physics run; press descend and it floods down — the rigid body goes
 * kinematic and these fields drive the transform until it surfaces again.
 */
export interface Dive {
  submerged: boolean;
  depth: number;     // metres below the surface (>= 0 when submerged)
  speed: number;     // m/s, forward (submarines reverse, so this can go negative)
  vspeed: number;    // m/s, vertical (negative = sinking)
  heading: number;   // yaw, radians
  pitch: number;     // pitch, radians (visual — nose down when diving)
}

export function createDive(): Dive {
  return { submerged: false, depth: 0, speed: 0, vspeed: 0, heading: 0, pitch: 0 };
}
