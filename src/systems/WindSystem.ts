import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { SeededNoise } from '../utils/noise';

export class WindSystem extends System {
  direction = new THREE.Vector2(0.6, 0.8); // normalized wind direction
  strength = 5; // m/s
  private time = 0;
  private noise: SeededNoise;

  constructor() {
    super(20); // priority
    this.noise = new SeededNoise('wind');
  }

  update(_world: World, dt: number): void {
    this.time += dt;

    // Wind direction drifts slowly using noise
    const dirAngle = this.noise.sample2D(this.time * 0.01, 0) * Math.PI * 2;
    this.direction.set(Math.cos(dirAngle), Math.sin(dirAngle));

    // Wind strength varies gently
    const baseStrength = 5;
    const variation = this.noise.sample2D(this.time * 0.02, 10) * 3;
    this.strength = Math.max(1, baseStrength + variation);
  }

  getWindVector(): THREE.Vector2 {
    return this.direction.clone().multiplyScalar(this.strength);
  }
}
