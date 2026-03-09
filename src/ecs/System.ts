import type { World } from './World';

export abstract class System {
  constructor(public readonly priority: number) {}
  abstract update(world: World, dt: number): void;
}
