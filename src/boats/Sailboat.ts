import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

export const SAILBOAT: BoatDefinition = {
  name: 'Sailboat',
  mass: 2000,
  hullSamplePoints: [
    // Bow (front)
    { offset: new THREE.Vector3(0, -0.8, 3.5), area: 0.8 },
    // Forward port/starboard
    { offset: new THREE.Vector3(-1.2, -1.0, 2.0), area: 1.2 },
    { offset: new THREE.Vector3(1.2, -1.0, 2.0), area: 1.2 },
    // Midship port/starboard
    { offset: new THREE.Vector3(-1.5, -1.2, 0), area: 1.5 },
    { offset: new THREE.Vector3(1.5, -1.2, 0), area: 1.5 },
    // Center bottom
    { offset: new THREE.Vector3(0, -1.3, 0), area: 1.5 },
    // Aft port/starboard
    { offset: new THREE.Vector3(-1.2, -1.0, -2.0), area: 1.2 },
    { offset: new THREE.Vector3(1.2, -1.0, -2.0), area: 1.2 },
    // Stern (back)
    { offset: new THREE.Vector3(0, -0.8, -3.0), area: 0.8 },
  ],
  sailArea: 30,
  enginePower: 0,
  rudderEffectiveness: 2.0,
  dragForward: 0.3,
  dragLateral: 3.0,
  dragAngular: 1.5,
};
