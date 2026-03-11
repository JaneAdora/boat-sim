import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

export const VIKING_SHIP: BoatDefinition = {
  name: 'Viking Ship',
  meshType: 'vikingship',
  mass: 450,
  hullSamplePoints: [
    // Bow
    { offset: new THREE.Vector3(0, -0.3, 3.5), area: 0.4 },
    // Forward port/starboard
    { offset: new THREE.Vector3(-0.6, -0.5, 2.0), area: 0.7 },
    { offset: new THREE.Vector3(0.6, -0.5, 2.0), area: 0.7 },
    // Midship port/starboard
    { offset: new THREE.Vector3(-0.8, -0.6, 0), area: 1.0 },
    { offset: new THREE.Vector3(0.8, -0.6, 0), area: 1.0 },
    // Center bottom
    { offset: new THREE.Vector3(0, -0.7, 0), area: 1.2 },
    // Aft port/starboard
    { offset: new THREE.Vector3(-0.6, -0.5, -2.0), area: 0.7 },
    { offset: new THREE.Vector3(0.6, -0.5, -2.0), area: 0.7 },
    // Stern
    { offset: new THREE.Vector3(0, -0.3, -3.0), area: 0.4 },
  ],
  sailArea: 0,
  enginePower: 12000,
  rudderEffectiveness: 3.5,
  dragForward: 0.04,
  dragLateral: 2.0,
  dragAngular: 0.8,
};
