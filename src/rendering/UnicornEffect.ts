import * as THREE from 'three';

/**
 * Unicorn fly-away effect for Magical Mode.
 * When a vessel or lighthouse is destroyed, a procedural unicorn spawns at its
 * position and flies upward into the sky, fading out over ~3 seconds.
 */

interface ActiveUnicorn {
  mesh: THREE.Group;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  materials: THREE.MeshStandardMaterial[];
}

function createUnicornMesh(): { group: THREE.Group; materials: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  const materials: THREE.MeshStandardMaterial[] = [];

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0.0, transparent: true,
    emissive: 0xffffff, emissiveIntensity: 0.35,
  });
  const pinkMat = new THREE.MeshStandardMaterial({
    color: 0xff88bb, roughness: 0.5, metalness: 0.0, transparent: true,
    emissive: 0xff88bb, emissiveIntensity: 0.35,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700, roughness: 0.3, metalness: 0.5, transparent: true,
    emissive: 0xffd700, emissiveIntensity: 0.4,
  });
  materials.push(whiteMat, pinkMat, goldMat);

  // Body — stretched sphere
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), whiteMat);
  body.scale.set(1, 0.8, 1.6);
  body.position.y = 1.2;
  group.add(body);

  // Head — smaller sphere, forward and up
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), whiteMat);
  head.position.set(0, 2.0, 1.8);
  group.add(head);

  // Neck — connect body to head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 6), whiteMat);
  neck.position.set(0, 1.7, 1.2);
  neck.rotation.x = -0.5;
  group.add(neck);

  // Horn — golden cone on top of head, tilted forward like a real unicorn
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.0, 6), goldMat);
  horn.position.set(0, 2.5, 2.15);
  horn.rotation.x = 0.8;
  group.add(horn);

  // Mane — pink segments along neck/head
  for (let i = 0; i < 5; i++) {
    const mane = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.5, 4), pinkMat);
    mane.position.set(0.15, 2.3 - i * 0.2, 1.6 - i * 0.15);
    mane.rotation.z = 0.4 + i * 0.1;
    mane.rotation.x = -0.2;
    group.add(mane);
  }

  // Legs — four thin cylinders
  const legPositions = [
    { x: -0.4, z: -0.8 }, { x: 0.4, z: -0.8 },
    { x: -0.4, z: 0.8 }, { x: 0.4, z: 0.8 },
  ];
  for (const lp of legPositions) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 1.2, 4), whiteMat);
    leg.position.set(lp.x, 0.5, lp.z);
    group.add(leg);
  }

  // Tail — pink cone, pointing backward
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 4), pinkMat);
  tail.position.set(0, 1.5, -1.8);
  tail.rotation.x = 1.2;
  group.add(tail);

  // Scale up to be visible
  group.scale.setScalar(2.5);

  return { group, materials };
}

export class UnicornEffect {
  private scene: THREE.Scene;
  private activeUnicorns: ActiveUnicorn[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(position: THREE.Vector3): void {
    const { group, materials } = createUnicornMesh();
    group.position.copy(position);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);

    this.activeUnicorns.push({
      mesh: group,
      vx: (Math.random() - 0.5) * 3,
      vy: 10 + Math.random() * 5,
      vz: (Math.random() - 0.5) * 3,
      age: 0,
      maxAge: 3.5,
      materials,
    });
  }

  update(dt: number): void {
    for (let i = this.activeUnicorns.length - 1; i >= 0; i--) {
      const u = this.activeUnicorns[i];
      u.age += dt;

      if (u.age >= u.maxAge) {
        // Remove and dispose
        this.scene.remove(u.mesh);
        u.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
        for (const mat of u.materials) mat.dispose();
        this.activeUnicorns.splice(i, 1);
        continue;
      }

      // Move upward with gentle drift
      u.mesh.position.x += u.vx * dt;
      u.mesh.position.y += u.vy * dt;
      u.mesh.position.z += u.vz * dt;

      // Gentle spin
      u.mesh.rotation.y += dt * 1.5;

      // Accelerate upward slightly (magical ascent)
      u.vy += dt * 2;

      // Fade out — cubic ease so unicorn stays solid most of its flight
      const progress = u.age / u.maxAge;
      const opacity = 1 - progress * progress * progress;
      for (const mat of u.materials) {
        mat.opacity = opacity;
      }
    }
  }

  dispose(): void {
    for (const u of this.activeUnicorns) {
      this.scene.remove(u.mesh);
      u.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
      for (const mat of u.materials) mat.dispose();
    }
    this.activeUnicorns.length = 0;
  }
}
