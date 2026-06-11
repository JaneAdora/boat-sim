import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

export const TUGBOAT: BoatDefinition = {
  name: 'Tugboat',
  meshType: 'tugboat',
  mass: 2800,
  hullSamplePoints: [
    // Bow
    { offset: new THREE.Vector3(0, -0.6, 3.0), area: 1.0 },
    // Forward port/starboard
    { offset: new THREE.Vector3(-1.5, -0.9, 1.5), area: 1.4 },
    { offset: new THREE.Vector3(1.5, -0.9, 1.5), area: 1.4 },
    // Midship port/starboard
    { offset: new THREE.Vector3(-1.7, -1.0, 0), area: 1.8 },
    { offset: new THREE.Vector3(1.7, -1.0, 0), area: 1.8 },
    // Center bottom
    { offset: new THREE.Vector3(0, -1.2, 0), area: 2.0 },
    // Aft port/starboard
    { offset: new THREE.Vector3(-1.6, -0.9, -2.0), area: 1.5 },
    { offset: new THREE.Vector3(1.6, -0.9, -2.0), area: 1.5 },
    // Stern
    { offset: new THREE.Vector3(0, -0.7, -3.0), area: 1.2 },
  ],
  sailArea: 0,
  enginePower: 6000,
  maxSpeedKnots: 18,
  turnRadius: 40,
  rudderSlew: 1.5,
  propWash: 0.15,
};
