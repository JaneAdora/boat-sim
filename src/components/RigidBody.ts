import * as THREE from 'three';

export interface RigidBody {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  mass: number;
  force: THREE.Vector3;  // accumulated this frame
  torque: THREE.Vector3; // accumulated this frame
  /** When true, buoyancy + physics integration skip this body — something else
   *  (the seaplane flight controller) is driving its transform directly. */
  kinematic: boolean;
}

export function createRigidBody(mass: number): RigidBody {
  return {
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    mass,
    force: new THREE.Vector3(),
    torque: new THREE.Vector3(),
    kinematic: false,
  };
}
