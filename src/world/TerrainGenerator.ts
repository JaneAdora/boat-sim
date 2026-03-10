import * as THREE from 'three';
import { IslandData, Biome } from './IslandGenerator';

interface BiomeColorPalette {
  sand: THREE.Color;
  grass: THREE.Color;
  rock: THREE.Color;
  snow?: THREE.Color;
}

function getBiomeColors(biome: Biome): BiomeColorPalette {
  switch (biome) {
    case 'rocky':
      return {
        sand: new THREE.Color(0.55, 0.52, 0.48),
        grass: new THREE.Color(0.15, 0.3, 0.12),
        rock: new THREE.Color(0.3, 0.28, 0.25),
        snow: new THREE.Color(0.9, 0.92, 0.95),
      };
    case 'autumn':
      return {
        sand: new THREE.Color(0.7, 0.6, 0.4),
        grass: new THREE.Color(0.65, 0.4, 0.15),
        rock: new THREE.Color(0.45, 0.35, 0.25),
      };
    case 'desert':
      return {
        sand: new THREE.Color(0.85, 0.78, 0.6),
        grass: new THREE.Color(0.75, 0.65, 0.45),
        rock: new THREE.Color(0.6, 0.4, 0.3),
      };
    case 'tropical':
    default:
      return {
        sand: new THREE.Color(0.76, 0.7, 0.5),
        grass: new THREE.Color(0.2, 0.5, 0.15),
        rock: new THREE.Color(0.4, 0.38, 0.35),
      };
  }
}

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

  // Biome-dependent color palettes
  const biomeColors = getBiomeColors(island.biome);

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

    // Color based on height, slope, and biome
    const color = new THREE.Color();
    if (height < 1.5) {
      // Beach/shore
      color.copy(biomeColors.sand);
    } else if (slope > 3) {
      // Steep = rock
      color.copy(biomeColors.rock);
    } else if (island.biome === 'rocky' && height > 12) {
      // Snow-capped peaks for rocky biome
      const snowBlend = Math.min(1, (height - 12) / 3);
      color.lerpColors(biomeColors.rock, biomeColors.snow!, snowBlend);
    } else if (height > 15) {
      // High = rock/sparse
      color.lerpColors(biomeColors.grass, biomeColors.rock, (height - 15) / 10);
    } else {
      // Grass/vegetation
      color.copy(biomeColors.grass);
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
 * Create shore rocks (boulders along the coastline where land meets water).
 */
export function createShoreRocks(island: IslandData): THREE.Group {
  const group = new THREE.Group();
  const size = island.heightmapSize;
  const scale = island.radius * 2.5 / size;
  const rockPositions: { x: number; y: number; z: number; s: number }[] = [];

  // Find coastline vertices (where height transitions near water level)
  for (let z = 1; z < size - 1; z += 2) {
    for (let x = 1; x < size - 1; x += 2) {
      const h = island.heightmap[z * size + x];
      if (h < 0.5 || h > 3.0) continue; // only along shoreline

      // Random probability — don't place too many
      const prob = Math.sin(x * 7.3 + z * 13.1 + island.centerX * 0.1) * 0.5 + 0.5;
      if (prob < 0.7) continue;

      const worldX = island.centerX + (x - size / 2) * scale;
      const worldZ = island.centerZ + (z - size / 2) * scale;
      const rockScale = 0.5 + prob * 1.5;

      rockPositions.push({ x: worldX, y: h * 0.5, z: worldZ, s: rockScale });
    }
  }

  if (rockPositions.length === 0) return group;

  // Rock geometry — distorted icosahedron for organic look
  const rockGeom = new THREE.IcosahedronGeometry(1, 1);
  const posAttr = rockGeom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const noise = Math.sin(i * 3.7) * 0.2 + Math.cos(i * 5.1) * 0.15;
    posAttr.setX(i, posAttr.getX(i) * (1 + noise));
    posAttr.setY(i, posAttr.getY(i) * (0.6 + Math.abs(noise)));
    posAttr.setZ(i, posAttr.getZ(i) * (1 + noise * 0.5));
  }
  rockGeom.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x707065,
    roughness: 0.95,
    metalness: 0.0,
  });

  const instanced = new THREE.InstancedMesh(rockGeom, rockMat, rockPositions.length);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < rockPositions.length; i++) {
    const r = rockPositions[i];
    dummy.position.set(r.x, r.y, r.z);
    dummy.scale.set(r.s, r.s * 0.6, r.s);
    dummy.rotation.set(0, r.x * 0.5 + r.z * 0.3, 0);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }

  group.add(instanced);
  return group;
}

/**
 * Create a lighthouse on an island (only on some islands, placed at highest point).
 */
export function createLighthouse(island: IslandData): THREE.Group | null {
  // Only some islands get a lighthouse — use deterministic check
  const hash = Math.sin(island.centerX * 0.01 + island.centerZ * 0.017) * 0.5 + 0.5;
  if (hash < 0.65) return null; // ~35% of islands

  // Find the highest point
  const size = island.heightmapSize;
  const scale = island.radius * 2.5 / size;
  let maxH = 0;
  let maxX = 0;
  let maxZ = 0;

  for (let z = 4; z < size - 4; z++) {
    for (let x = 4; x < size - 4; x++) {
      const h = island.heightmap[z * size + x];
      if (h > maxH) {
        maxH = h;
        maxX = x;
        maxZ = z;
      }
    }
  }

  if (maxH < 3) return null; // too flat

  const worldX = island.centerX + (maxX - size / 2) * scale;
  const worldZ = island.centerZ + (maxZ - size / 2) * scale;

  const group = new THREE.Group();
  group.position.set(worldX, maxH, worldZ);

  // Tower — white cylinder
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xF5F0E8, roughness: 0.6, metalness: 0.05 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 12, 8), towerMat);
  tower.position.y = 6;
  group.add(tower);

  // Red band near top
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.5 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 8), bandMat);
  band.position.y = 10.5;
  group.add(band);

  // Lamp room — glass look
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xFFEEAA, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.8 });
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 1.5, 8), lampMat);
  lampRoom.position.y = 12;
  group.add(lampRoom);

  // Roof — dark cone
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.2 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.5, 8), roofMat);
  roof.position.y = 13.5;
  group.add(roof);

  // Beacon light — point light that shines at night
  const beacon = new THREE.PointLight(0xFFEE88, 0, 150);
  beacon.position.y = 12;
  beacon.name = 'beacon';
  group.add(beacon);

  return group;
}

/**
 * Create instanced trees for an island, varying by biome.
 */
export function createTreeInstances(island: IslandData): THREE.Group {
  const group = new THREE.Group();
  const trees = island.treePositions;
  if (trees.length === 0) return group;

  switch (island.biome) {
    case 'desert':
      // Desert: no trees
      return group;

    case 'rocky':
      return createPineTrees(trees);

    case 'autumn':
      return createDeciduousTrees(trees);

    case 'tropical':
    default:
      return createPalmTrees(trees);
  }
}

function createPalmTrees(trees: IslandData['treePositions']): THREE.Group {
  const group = new THREE.Group();

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

function createPineTrees(trees: IslandData['treePositions']): THREE.Group {
  const group = new THREE.Group();

  // Pine trunk — taller and thinner
  const trunkGeom = new THREE.CylinderGeometry(0.12, 0.2, 6, 6);
  trunkGeom.translate(0, 3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5C4A2A,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Pine canopy — tall narrow dark green cone
  const frondGeom = new THREE.ConeGeometry(1.5, 5, 6);
  frondGeom.translate(0, 8.5, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.1, 0.25, 0.1),
    roughness: 0.8,
    metalness: 0.0,
  });

  const trunkInstanced = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length);
  const frondInstanced = new THREE.InstancedMesh(frondGeom, frondMat, trees.length);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.scale.setScalar(tree.scale);
    dummy.rotation.set(
      (Math.sin(tree.x * 0.1) * 0.05),
      tree.x * 0.3 + tree.z * 0.7,
      (Math.cos(tree.z * 0.1) * 0.05)
    );
    dummy.updateMatrix();

    trunkInstanced.setMatrixAt(i, dummy.matrix);
    frondInstanced.setMatrixAt(i, dummy.matrix);
  }

  group.add(trunkInstanced);
  group.add(frondInstanced);

  return group;
}

function createDeciduousTrees(trees: IslandData['treePositions']): THREE.Group {
  const group = new THREE.Group();

  // Deciduous trunk — shorter
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.3, 4, 6);
  trunkGeom.translate(0, 2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6B4E2A,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Round canopy — sphere
  const canopyGeom = new THREE.SphereGeometry(2, 6, 4);
  canopyGeom.translate(0, 5.5, 0);

  // Autumn color variants
  const autumnColors = [
    new THREE.Color(0.8, 0.4, 0.1),
    new THREE.Color(0.7, 0.2, 0.05),
    new THREE.Color(0.6, 0.55, 0.1),
  ];

  // We need per-instance colors, so use InstancedMesh with per-instance color
  const canopyMat = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.0,
  });

  const trunkInstanced = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length);
  const canopyInstanced = new THREE.InstancedMesh(canopyGeom, canopyMat, trees.length);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.scale.setScalar(tree.scale);
    dummy.rotation.set(
      (Math.sin(tree.x * 0.1) * 0.05),
      tree.x * 0.3 + tree.z * 0.7,
      (Math.cos(tree.z * 0.1) * 0.05)
    );
    dummy.updateMatrix();

    trunkInstanced.setMatrixAt(i, dummy.matrix);
    canopyInstanced.setMatrixAt(i, dummy.matrix);

    // Pick autumn color based on position hash
    const colorIndex = Math.abs(Math.floor(tree.x * 7.3 + tree.z * 13.1)) % autumnColors.length;
    canopyInstanced.setColorAt(i, autumnColors[colorIndex]);
  }

  group.add(trunkInstanced);
  group.add(canopyInstanced);

  return group;
}
