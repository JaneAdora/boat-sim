import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

export const SPEEDBOAT: BoatDefinition = {
  name: 'Speedboat',
  meshType: 'speedboat',
  mass: 600,
  hullSamplePoints: [
    // Bow
    { offset: new THREE.Vector3(0, -0.3, 2.5), area: 0.5 },
    // Forward port/starboard
    { offset: new THREE.Vector3(-0.7, -0.5, 1.2), area: 0.8 },
    { offset: new THREE.Vector3(0.7, -0.5, 1.2), area: 0.8 },
    // Midship port/starboard
    { offset: new THREE.Vector3(-0.8, -0.6, 0), area: 1.0 },
    { offset: new THREE.Vector3(0.8, -0.6, 0), area: 1.0 },
    // Center bottom
    { offset: new THREE.Vector3(0, -0.7, 0), area: 1.2 },
    // Aft port/starboard
    { offset: new THREE.Vector3(-0.7, -0.5, -1.5), area: 0.8 },
    { offset: new THREE.Vector3(0.7, -0.5, -1.5), area: 0.8 },
    // Stern
    { offset: new THREE.Vector3(0, -0.4, -2.2), area: 0.6 },
  ],
  sailArea: 0,
  enginePower: 8000,
  rudderEffectiveness: 4.0,
  dragForward: 0.06,
  dragLateral: 2.0,
  dragAngular: 1.0,
};
