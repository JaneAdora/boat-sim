import { System } from './System';

export type EntityId = number;

export class World {
  private nextId = 1;
  private entities = new Set<EntityId>();
  private components = new Map<string, Map<EntityId, any>>();
  private systems: System[] = [];

  createEntity(): EntityId {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: EntityId): void {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }

  addComponent<T>(entity: EntityId, name: string, component: T): void {
    if (!this.components.has(name)) {
      this.components.set(name, new Map());
    }
    this.components.get(name)!.set(entity, component);
  }

  getComponent<T>(entity: EntityId, name: string): T | undefined {
    return this.components.get(name)?.get(entity) as T | undefined;
  }

  /** Return all entities that have every listed component. */
  query(...componentNames: string[]): EntityId[] {
    const result: EntityId[] = [];
    for (const entity of this.entities) {
      let hasAll = true;
      for (const name of componentNames) {
        if (!this.components.get(name)?.has(entity)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) result.push(entity);
    }
    return result;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  update(dt: number): void {
    for (const system of this.systems) {
      system.update(this, dt);
    }
  }
}
