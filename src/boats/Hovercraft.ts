import * as THREE from 'three';
import { BoatDefinition } from './BoatDefinition';

/**
 * The hovercraft — the only craft that doesn't care where the water ends. It
 * rides a cushion of air, so it skims the shallows and climbs straight up onto
 * the beaches every other hull bounces off. Loose, floaty steering (wide turns,
 * lazy rudder) is the trade for going anywhere. 40 knots — the viking ship (46)
 * and jet ski (44) keep their crowns.
 */
export const HOVERCRAFT: BoatDefinition = {
  name: 'Hovercraft',
  meshType: 'hovercraft',
  mass: 500,
  // A wide, flat footprint — four corners of the skirt plus the centre — so it
  // sits level on its cushion whether that's water or sand.
  hullSamplePoints: [
    { offset: new THREE.Vector3(-0.95, -0.3, 1.3), area: 0.3 },
    { offset: new THREE.Vector3(0.95, -0.3, 1.3), area: 0.3 },
    { offset: new THREE.Vector3(-0.95, -0.3, -1.3), area: 0.3 },
    { offset: new THREE.Vector3(0.95, -0.3, -1.3), area: 0.3 },
    { offset: new THREE.Vector3(0, -0.35, 0), area: 0.5 },
  ],
  sailArea: 0,
  enginePower: 2600,
  maxSpeedKnots: 40,
  turnRadius: 16,   // wide, drifting turns
  rudderSlew: 2.4,  // lazy helm — it skates
  propWash: 0.5,
  amphibious: true,
};
