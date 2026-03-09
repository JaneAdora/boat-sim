import * as THREE from 'three';

export interface BuoyancySamplePoint {
  localOffset: THREE.Vector3;
  area: number; // effective area for this sample point
}

export interface Buoyancy {
  samplePoints: BuoyancySamplePoint[];
  waterDensity: number;
  dampingLinear: number;
  dampingAngular: number;
}

export function createBuoyancy(samplePoints: BuoyancySamplePoint[]): Buoyancy {
  return {
    samplePoints,
    waterDensity: 1025, // seawater kg/m^3
    dampingLinear: 0.8,
    dampingAngular: 1.5,
  };
}
