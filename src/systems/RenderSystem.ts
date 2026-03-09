import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { MeshRenderable } from '../components/MeshRenderable';

export class RenderSystem extends System {
  constructor() {
    super(90); // priority — near the end
  }

  update(world: World, _dt: number): void {
    for (const entity of world.query('Transform', 'MeshRenderable')) {
      const transform = world.getComponent<Transform>(entity, 'Transform')!;
      const renderable = world.getComponent<MeshRenderable>(entity, 'MeshRenderable')!;

      renderable.object3D.position.copy(transform.position);
      renderable.object3D.quaternion.copy(transform.quaternion);
    }
  }
}
