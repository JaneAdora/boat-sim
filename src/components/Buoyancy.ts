import * as THREE from 'three';
import { DRAG_LINEAR } from '../boats/BoatDefinition';

export interface BuoyancySamplePoint {
  localOffset: THREE.Vector3;
  area: number; // effective area for this sample point
}

export interface Buoyancy {
  samplePoints: BuoyancySamplePoint[];
  waterDensity: number;
  dampingLinear: number; // lateral/vertical water resistance
  dragLinear: number;    // forward low-speed drag
  dragQuad: number;      // forward speed² drag — sets the top-speed plateau
}

export function createBuoyancy(samplePoints: BuoyancySamplePoint[], dragQuad: number = 0.02): Buoyancy {
  return {
    samplePoints,
    waterDensity: 1025, // seawater kg/m^3
    dampingLinear: 0.8,
    dragLinear: DRAG_LINEAR,
    dragQuad,
  };
}
