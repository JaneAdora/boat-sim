import * as THREE from 'three';

/**
 * Exported story-prop builders — scene dressing owned by the campaign layer.
 * Extracted from LeviathanSystem (createDoomedShip was private there; the Act 2
 * plan needs the same silhouettes for wrecks and vessels) plus the Act 2 set.
 * All builders return a THREE.Group positioned at the origin; callers place
 * and dispose them (disposeGroup below).
 */

export function createDoomedShip(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 34),
    new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.8 }),
  );
  hull.position.y = 1.5;
  g.add(hull);
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.4, 7),
      new THREE.MeshStandardMaterial({ color: [0xa64833, 0x3f6e8c, 0x7a8c3f][i], roughness: 0.7 }),
    );
    box.position.set(0, 5.2, -10 + i * 10);
    g.add(box);
  }
  return g;
}

/** An upright sunken fishing boat for the trench ledge (beat 12): a dark hull
 *  with a raked mast, standing on the bottom as if moored. */
export function createWreckHull(seed = 0): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.95 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3, 14), mat);
  hull.position.y = 1.5;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 11, 6), mat);
  mast.position.set(0, 8, -1 + (seed % 3));
  mast.rotation.z = ((seed % 5) - 2) * 0.06; // each mast leans its own way
  g.add(mast);
  const house = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3.4), mat);
  house.position.set(0, 3.6, 3.4);
  g.add(house);
  return g;
}

/** The drowned bell-buoy (beat 9): a rusted cage tilted on the flats. */
export function createBellBuoy(): THREE.Group {
  const g = new THREE.Group();
  const rust = new THREE.MeshStandardMaterial({ color: 0x6e4a33, roughness: 0.9, metalness: 0.3 });
  const float = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 1.2, 10), rust);
  float.position.y = 0.4;
  g.add(float);
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.6, 4, 1, true), rust);
  frame.position.y = 2.1;
  g.add(frame);
  const bell = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.6, metalness: 0.6 }),
  );
  bell.position.y = 2.2;
  g.add(bell);
  g.rotation.z = 0.18; // the tilt that says something is wrong
  return g;
}

/** A drowned soul (beat 13): a soft pale glow the sub can carry home. */
export function createSoulSprite(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xbfe2f2, transparent: true, opacity: 0.85 }),
  );
  g.add(core);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x9fd0e8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  g.add(halo);
  return g;
}

/** The coastguard recovery vessel (beat 13): a plain hull holding station at
 *  the surface above the hamlet. A scene prop, not wildlife — inherently
 *  untargetable and untowable. */
export function createRecoveryVessel(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.4, 22),
    new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.7 }),
  );
  hull.position.y = 1.2;
  g.add(hull);
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 2.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 }),
  );
  house.position.set(0, 4.1, -3);
  g.add(house);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(6.05, 0.7, 4),
    new THREE.MeshStandardMaterial({ color: 0xd94040, roughness: 0.6 }),
  );
  stripe.position.set(0, 2.4, 7);
  g.add(stripe);
  return g;
}

/** The drowned hamlet (beat 13): a huddle of stone shells and a leaning
 *  bell-tower on the trench floor. Silhouette dressing — the souls carry the
 *  light. */
export function createDrownedHamlet(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.95 });
  const layout: [number, number, number, number][] = [
    // [x, z, w, h]
    [-14, -6, 7, 5],
    [-4, -12, 6, 4],
    [8, -8, 8, 6],
    [14, 4, 6, 4.5],
    [-8, 8, 7, 5],
  ];
  for (const [x, z, w, h] of layout) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), stone);
    house.position.set(x, h / 2, z);
    house.rotation.y = (x * 13.37) % 0.6;
    g.add(house);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 4), stone);
  tower.position.set(2, 8, 2);
  tower.rotation.z = 0.07;
  g.add(tower);
  return g;
}

/** A departing merfolk silhouette (beat 10's exodus): a dim teal glimmer just
 *  under the surface, built to be seen leaving, not met. */
export function createMermaidSilhouette(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 2.4, 3, 8),
    new THREE.MeshBasicMaterial({ color: 0x5fe0c8, transparent: true, opacity: 0.4 }),
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 1.6, 6),
    new THREE.MeshBasicMaterial({ color: 0x4fd0c0, transparent: true, opacity: 0.3 }),
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -2;
  g.add(tail);
  return g;
}

export function disposeGroup(scene: THREE.Scene, group: THREE.Group): void {
  scene.remove(group);
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
}
