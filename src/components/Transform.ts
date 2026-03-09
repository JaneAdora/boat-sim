import * as THREE from 'three';

export interface Transform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  quaternion: THREE.Quaternion;
}

export function createTransform(): Transform {
  return {
    position: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    quaternion: new THREE.Quaternion(),
  };
}
