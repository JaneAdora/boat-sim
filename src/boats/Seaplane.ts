import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

/**
 * The seaplane — the only hull that leaves the water. On the surface it's a
 * brisk floatplane (38 kn, so the viking ship keeps the surface crown); get up
 * past takeoff speed and hold climb (Space) and it rotates off the water into an
 * arcade flight model — W/S airspeed, A/D bank, Space/Shift up/down. Set it back
 * down on the water and the floats catch it. Drives via the SeaplaneSystem.
 */
export const SEAPLANE: BoatDefinition = {
  name: 'Seaplane',
  meshType: 'seaplane',
  mass: 600,
  // Two floats' worth of contact points — a wide, planing stance for takeoff.
  hullSamplePoints: [
    { offset: new THREE.Vector3(-0.85, -0.3, 1.5), area: 0.28 },
    { offset: new THREE.Vector3(0.85, -0.3, 1.5), area: 0.28 },
    { offset: new THREE.Vector3(-0.85, -0.35, -1.3), area: 0.3 },
    { offset: new THREE.Vector3(0.85, -0.35, -1.3), area: 0.3 },
    { offset: new THREE.Vector3(0, -0.35, 0), area: 0.3 },
  ],
  sailArea: 0,
  enginePower: 3300,
  maxSpeedKnots: 38,
  turnRadius: 14,
  rudderSlew: 3.0,
  propWash: 0.4,
  canFly: true,
};
