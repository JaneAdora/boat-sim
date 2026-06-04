import type { World } from './World';

export abstract class System {
  constructor(public readonly priority: number) {}
  abstract update(world: World, dt: number): void;
  /** Optional teardown — remove listeners, dispose GPU resources, etc. Called by World.dispose(). */
  dispose?(): void;
}
