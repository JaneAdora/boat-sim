import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

export const CRUISE_SHIP: BoatDefinition = {
  name: 'Cruise Ship',
  meshType: 'cruiseship',
  mass: 18000,
  hullSamplePoints: [
    // Bow
    { offset: new THREE.Vector3(0, -1.0, 8.0), area: 6.0 },
    // Forward port/starboard
    { offset: new THREE.Vector3(-3.0, -1.5, 5.0), area: 8.0 },
    { offset: new THREE.Vector3(3.0, -1.5, 5.0), area: 8.0 },
    // Midship port/starboard
    { offset: new THREE.Vector3(-3.5, -1.8, 0), area: 10.0 },
    { offset: new THREE.Vector3(3.5, -1.8, 0), area: 10.0 },
    // Center bottom
    { offset: new THREE.Vector3(0, -2.2, 0), area: 12.0 },
    // Aft port/starboard
    { offset: new THREE.Vector3(-3.2, -1.5, -5.0), area: 8.0 },
    { offset: new THREE.Vector3(3.2, -1.5, -5.0), area: 8.0 },
    // Stern
    { offset: new THREE.Vector3(0, -1.2, -8.0), area: 6.0 },
  ],
  sailArea: 0,
  enginePower: 22000,
  maxSpeedKnots: 22,
  turnRadius: 90,
  rudderSlew: 2.5,
  propWash: 0.3,
};
