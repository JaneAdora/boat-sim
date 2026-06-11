import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

/**
 * The jet ski — agility incarnate. 44 knots (the viking ship keeps its
 * crown at 46), a 10 m turn circle, one hull pip, and light enough to
 * catch air off a storm swell. Style pays: hangtime and spins bank credits.
 */
export const JETSKI: BoatDefinition = {
  name: 'Jet Ski',
  meshType: 'jetski',
  mass: 250,
  hullSamplePoints: [
    { offset: new THREE.Vector3(0, -0.3, 1.2), area: 0.25 },
    { offset: new THREE.Vector3(-0.45, -0.35, 0), area: 0.3 },
    { offset: new THREE.Vector3(0.45, -0.35, 0), area: 0.3 },
    { offset: new THREE.Vector3(0, -0.4, 0), area: 0.3 },
    { offset: new THREE.Vector3(0, -0.3, -1.2), area: 0.25 },
  ],
  sailArea: 0,
  enginePower: 3000, // 12 m/s² launch — hold on
  maxSpeedKnots: 44,
  turnRadius: 10,
  rudderSlew: 4.0,
  propWash: 0.4,
};
