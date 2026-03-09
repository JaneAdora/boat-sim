import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { InputManager } from '../core/InputManager';

const _desiredPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class CameraSystem extends System {
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private orbitAngle = 0; // horizontal orbit offset
  private distance = 25;
  private height = 10;
  private smoothing = 4;
  private targetEntity: number | null = null;

  // Smoothed camera state
  private currentPos = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private initialized = false;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager) {
    super(80); // priority — after physics
    this.camera = camera;
    this.input = input;
  }

  setTarget(entity: number): void {
    this.targetEntity = entity;
  }

  update(world: World, dt: number): void {
    if (this.targetEntity === null) return;

    const transform = world.getComponent<Transform>(this.targetEntity, 'Transform');
    if (!transform) return;

    // Orbit controls
    if (this.input.isPressed('KeyQ')) {
      this.orbitAngle -= 1.5 * dt;
    }
    if (this.input.isPressed('KeyE')) {
      this.orbitAngle += 1.5 * dt;
    }
    if (this.input.isPressed('KeyR')) {
      this.distance = Math.max(10, this.distance - 15 * dt);
    }
    if (this.input.isPressed('KeyF')) {
      this.distance = Math.min(60, this.distance + 15 * dt);
    }

    // Slowly return orbit to center when not pressing Q/E
    if (!this.input.isPressed('KeyQ') && !this.input.isPressed('KeyE')) {
      this.orbitAngle *= Math.max(0, 1 - 1.5 * dt);
    }

    // Compute desired camera position behind and above the boat
    const boatHeading = Math.atan2(
      Math.sin(transform.rotation.y),
      Math.cos(transform.rotation.y)
    );
    const totalAngle = boatHeading + this.orbitAngle + Math.PI; // PI to be behind

    _desiredPos.set(
      transform.position.x + Math.sin(totalAngle) * this.distance,
      transform.position.y + this.height,
      transform.position.z + Math.cos(totalAngle) * this.distance
    );

    // Look-at point slightly ahead of the boat
    _lookTarget.copy(transform.position);
    _lookTarget.y += 2;

    if (!this.initialized) {
      this.currentPos.copy(_desiredPos);
      this.currentLookAt.copy(_lookTarget);
      this.initialized = true;
    }

    // Frame-rate independent exponential smoothing
    const factor = 1 - Math.exp(-this.smoothing * dt);
    this.currentPos.lerp(_desiredPos, factor);
    this.currentLookAt.lerp(_lookTarget, factor);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
