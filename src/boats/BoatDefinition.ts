import * as THREE from 'three';

export interface BoatDefinition {
  name: string;
  meshType: 'sailboat' | 'tugboat' | 'cruiseship' | 'speedboat';
  mass: number;
  hullSamplePoints: { offset: THREE.Vector3; area: number }[];
  sailArea: number;       // 0 for motorboats
  enginePower: number;    // 0 for pure sailboats
  rudderEffectiveness: number;
  dragForward: number;
  dragLateral: number;
  dragAngular: number;
}
