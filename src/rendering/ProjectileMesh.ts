import * as THREE from 'three';

/**
 * Procedural mesh builders for torpedo and missile projectiles.
 */

export function createTorpedoMesh(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.3 });

  // Main body — cylinder lying along Z
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 1.8, 6), mat);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 1.1;
  group.add(nose);

  // Tail fins (4 small planes)
  const finMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.25), finMat);
    fin.position.z = -0.85;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.x = Math.cos((i * Math.PI) / 2) * 0.1;
    fin.position.y = Math.sin((i * Math.PI) / 2) * 0.1;
    group.add(fin);
  }

  return group;
}

export function createMissileMesh(): THREE.Group {
  const group = new THREE.Group();
  // Inner group rotated 180 so nose faces -Z (lookAt convention)
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI;

  // Body cylinder
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 6), bodyMat);
  body.rotation.x = Math.PI / 2;
  inner.add(body);

  // Nose cone — red
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.3, metalness: 0.2 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), noseMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.65;
  inner.add(nose);

  // Tail fins (4 fins)
  const finMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.3), finMat);
    fin.position.z = -0.5;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.x = Math.cos((i * Math.PI) / 2) * 0.08;
    fin.position.y = Math.sin((i * Math.PI) / 2) * 0.08;
    inner.add(fin);
  }

  group.add(inner);
  group.scale.setScalar(3);
  return group;
}
