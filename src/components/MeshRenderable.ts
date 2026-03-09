import * as THREE from 'three';

export interface MeshRenderable {
  object3D: THREE.Object3D;
}

export function createMeshRenderable(object3D: THREE.Object3D): MeshRenderable {
  return { object3D };
}
