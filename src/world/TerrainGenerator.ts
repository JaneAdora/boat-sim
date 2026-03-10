import * as THREE from 'three';
import { IslandData } from './IslandGenerator';

/**
 * Build a Three.js mesh from island heightmap data.
 */
export function createTerrainMesh(island: IslandData): THREE.Mesh {
  const size = island.heightmapSize;
  const scale = island.radius * 2.5 / size;

  const geometry = new THREE.PlaneGeometry(
    scale * size,
    scale * size,
    size - 1,
    size - 1
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  // Sand, grass, rock colors
  const sandColor = new THREE.Color(0.76, 0.7, 0.5);
  const grassColor = new THREE.Color(0.2, 0.5, 0.15);
  const rockColor = new THREE.Color(0.4, 0.38, 0.35);

  for (let i = 0; i < positions.count; i++) {
    const x = i % size;
    const z = Math.floor(i / size);
    const height = island.heightmap[z * size + x];

    // Set vertex height — sink near-zero verts below water to hide square edges
    positions.setY(i, height < 0.3 ? -2 : height);

    // Compute slope from neighbors for rock/grass blend
    let slope = 0;
    if (x > 0 && x < size - 1 && z > 0 && z < size - 1) {
      const hL = island.heightmap[z * size + (x - 1)];
      const hR = island.heightmap[z * size + (x + 1)];
      const hU = island.heightmap[(z - 1) * size + x];
      const hD = island.heightmap[(z + 1) * size + x];
      slope = Math.abs(hR - hL) + Math.abs(hD - hU);
    }

    // Color based on height and slope
    const color = new THREE.Color();
    if (height < 1.5) {
      // Beach
      color.copy(sandColor);
    } else if (slope > 3) {
      // Steep = rock
      color.copy(rockColor);
    } else if (height > 15) {
      // High = rock/sparse
      color.lerpColors(grassColor, rockColor, (height - 15) / 10);
    } else {
      // Grass
      color.copy(grassColor);
      // Slight variation
      const v = (height - 1.5) / 13.5;
      color.r += v * 0.05;
      color.g -= v * 0.1;
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(island.centerX, 0, island.centerZ);
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Create instanced palm trees for an island.
 */
export function createTreeInstances(island: IslandData): THREE.Group {
  const group = new THREE.Group();
  const trees = island.treePositions;
  if (trees.length === 0) return group;

  // Trunk geometry (shared)
  const trunkGeom = new THREE.CylinderGeometry(0.15, 0.25, 5, 6);
  trunkGeom.translate(0, 2.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x8B6914,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Frond geometry (shared) — simple cone
  const frondGeom = new THREE.ConeGeometry(2.5, 3, 6);
  frondGeom.translate(0, 6, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2D7A2D,
    roughness: 0.8,
    metalness: 0.0,
  });

  // Instanced meshes
  const trunkInstanced = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length);
  const frondInstanced = new THREE.InstancedMesh(frondGeom, frondMat, trees.length);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.scale.setScalar(tree.scale);
    // Slight random lean
    dummy.rotation.set(
      (Math.sin(tree.x * 0.1) * 0.1),
      tree.x * 0.3 + tree.z * 0.7,
      (Math.cos(tree.z * 0.1) * 0.1)
    );
    dummy.updateMatrix();

    trunkInstanced.setMatrixAt(i, dummy.matrix);
    frondInstanced.setMatrixAt(i, dummy.matrix);
  }

  group.add(trunkInstanced);
  group.add(frondInstanced);

  return group;
}
