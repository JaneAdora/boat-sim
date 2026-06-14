import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

/**
 * The submarine — the hull that goes the other way. On the surface it's a slow,
 * heavy boat (14 kn). Press descend (Shift / ▼) and it floods the ballast and
 * slips under: W/S throttle, A/D rudder, Space/▲ ascend, Shift/▼ dive, down to
 * the wreck graveyards. Sonar pings sweep the dark as you go. Surface again and
 * the hull pops back up. Driven by the SubmarineSystem when submerged.
 */
export const SUBMARINE: BoatDefinition = {
  name: 'Submarine',
  meshType: 'submarine',
  mass: 1200,
  // A long, low hull — sample points down its length keep it level on the surface.
  hullSamplePoints: [
    { offset: new THREE.Vector3(0, -0.4, 2.4), area: 0.3 },
    { offset: new THREE.Vector3(-0.5, -0.45, 0.6), area: 0.32 },
    { offset: new THREE.Vector3(0.5, -0.45, 0.6), area: 0.32 },
    { offset: new THREE.Vector3(-0.5, -0.45, -1.2), area: 0.32 },
    { offset: new THREE.Vector3(0.5, -0.45, -1.2), area: 0.32 },
    { offset: new THREE.Vector3(0, -0.4, -2.6), area: 0.3 },
  ],
  sailArea: 0,
  enginePower: 2200,
  maxSpeedKnots: 14,
  turnRadius: 18,
  rudderSlew: 2.0,
  propWash: 0.3,
  canDive: true,
};
