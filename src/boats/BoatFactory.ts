import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { BoatDefinition } from './BoatDefinition';
import { createTransform } from '../components/Transform';
import { createRigidBody } from '../components/RigidBody';
import { createBuoyancy, BuoyancySamplePoint } from '../components/Buoyancy';
import { createBoatControl } from '../components/BoatControl';
import { createWindReceiver } from '../components/WindReceiver';
import { createMeshRenderable } from '../components/MeshRenderable';

/**
 * Build a smooth hull shape using a LatheGeometry approach.
 * Creates cross-section profiles at different heights and lofts between them.
 */
function createHullGeometry(): THREE.BufferGeometry {
  const lengthSegments = 20;
  const radialSegments = 12;
  const hullLength = 8;
  const halfLength = hullLength / 2;

  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  // Generate hull cross-sections along the length (z-axis)
  const profiles: { z: number; halfWidth: number; depth: number }[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments; // 0 = stern, 1 = bow
    const z = -halfLength + t * hullLength;

    // Width profile: widest at ~40% from stern, tapering to point at bow
    let halfWidth: number;
    if (t < 0.4) {
      halfWidth = 1.4 * Math.sqrt(t / 0.4); // stern widens
    } else {
      halfWidth = 1.4 * Math.pow(1 - (t - 0.4) / 0.6, 0.7); // bow narrows smoothly
    }
    halfWidth = Math.max(halfWidth, 0.02); // prevent degenerate at bow tip

    // Depth profile: deeper amidships, shallower at bow/stern
    const depth = 1.2 * Math.sin(t * Math.PI) * 0.8 + 0.3;

    profiles.push({ z, halfWidth, depth });
  }

  // Generate vertices for each cross-section
  for (let i = 0; i <= lengthSegments; i++) {
    const { z, halfWidth, depth } = profiles[i];

    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI; // 0 to PI (half circle, port to starboard)
      const x = Math.sin(angle) * halfWidth;
      const y = -Math.cos(angle) * depth;

      vertices.push(x, y, z);

      // Approximate normal
      const nx = Math.sin(angle) * depth;
      const ny = -Math.cos(angle) * halfWidth;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      normals.push(nx / len, ny / len, 0);
    }
  }

  // Deck vertices (top edge, closing the hull)
  const deckStart = vertices.length / 3;
  for (let i = 0; i <= lengthSegments; i++) {
    const { z, halfWidth } = profiles[i];
    // Port gunwale
    vertices.push(-halfWidth, 0, z);
    normals.push(0, 1, 0);
    // Starboard gunwale
    vertices.push(halfWidth, 0, z);
    normals.push(0, 1, 0);
  }

  // Generate hull indices
  const stride = radialSegments + 1;
  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;

      indices.push(a, b, c);
      indices.push(c, b, d);
    }
  }

  // Deck faces
  for (let i = 0; i < lengthSegments; i++) {
    const pA = deckStart + i * 2;     // port current
    const sA = deckStart + i * 2 + 1; // starboard current
    const pB = deckStart + (i + 1) * 2;     // port next
    const sB = deckStart + (i + 1) * 2 + 1; // starboard next

    indices.push(pA, pB, sA);
    indices.push(sA, pB, sB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Create a curved sail shape with slight billowing.
 */
function createSailGeometry(width: number, height: number, segments: number = 8): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segments; iy++) {
    const v = iy / segments;
    const rowWidth = width * (1 - v * 0.85); // narrows toward top

    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const x = u * rowWidth;
      const y = v * height;
      // Billow: slight curve outward, more in the middle
      const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.4;
      vertices.push(x, y, billow);
    }
  }

  const stride = segments + 1;
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * stride + ix;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c);
      indices.push(c, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create a procedural sailboat mesh with smooth hull and billowing sail.
 */
function createSailboatMesh(): THREE.Group {
  const group = new THREE.Group();

  // Hull
  const hullGeometry = createHullGeometry();
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x6B3A2A,
    roughness: 0.65,
    metalness: 0.05,
  });
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  group.add(hull);

  // Keel (stabilizer fin underneath)
  const keelShape = new THREE.Shape();
  keelShape.moveTo(0, 0);
  keelShape.lineTo(0.1, -1.8);
  keelShape.lineTo(-0.1, -1.8);
  keelShape.closePath();
  const keelGeom = new THREE.ExtrudeGeometry(keelShape, { depth: 1.5, bevelEnabled: false });
  keelGeom.translate(0, 0, -0.75);
  keelGeom.rotateY(Math.PI / 2);
  const keelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  const keel = new THREE.Mesh(keelGeom, keelMat);
  keel.position.set(0, -0.8, 0);
  group.add(keel);

  // Deck trim / railing (thin torus around gunwale)
  const railGeom = new THREE.TorusGeometry(0.03, 0.015, 4, 32);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xCCBB99, roughness: 0.5, metalness: 0.3 });

  // Port rail
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.17;
    const z = -4 + t * 8;
    const stanchion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4),
      railMat
    );
    const halfWidth = 1.4 * (t < 0.4 ? Math.sqrt(t / 0.4) : Math.pow(1 - (t - 0.4) / 0.6, 0.7));
    stanchion.position.set(-halfWidth + 0.05, 0.3, z);
    group.add(stanchion);
    const stanchionR = stanchion.clone();
    stanchionR.position.x = halfWidth - 0.05;
    group.add(stanchionR);
  }

  // Mast
  const mastGeom = new THREE.CylinderGeometry(0.05, 0.07, 10, 8);
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.5,
    metalness: 0.15,
  });
  const mast = new THREE.Mesh(mastGeom, mastMat);
  mast.position.set(0, 5, 1.2);
  group.add(mast);

  // Main sail — curved, billowing
  const sailGeom = createSailGeometry(3, 7.5);
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xFAF0E6,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const sail = new THREE.Mesh(sailGeom, sailMat);
  sail.position.set(0, 1.5, 1.2);
  sail.rotation.y = -0.15;
  group.add(sail);

  // Boom
  const boomGeom = new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6);
  const boom = new THREE.Mesh(boomGeom, mastMat);
  boom.position.set(1.3, 1.5, 1.2);
  boom.rotation.z = Math.PI / 2 + 0.05;
  group.add(boom);

  // Rudder (small fin at stern)
  const rudderGeom = new THREE.BoxGeometry(0.08, 1.0, 0.4);
  const rudder = new THREE.Mesh(rudderGeom, keelMat);
  rudder.position.set(0, -0.5, -3.5);
  group.add(rudder);

  // Cabin / cockpit hint (small raised box aft)
  const cabinGeom = new THREE.BoxGeometry(1.6, 0.6, 1.8);
  cabinGeom.translate(0, 0.3, 0);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.7,
    metalness: 0.05,
  });
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  cabin.position.set(0, 0, -1.5);
  group.add(cabin);

  return group;
}

export function spawnBoat(world: World, scene: THREE.Scene, definition: BoatDefinition): EntityId {
  const entity = world.createEntity();

  const transform = createTransform();
  transform.position.set(0, 1, 0);
  world.addComponent(entity, 'Transform', transform);

  world.addComponent(entity, 'RigidBody', createRigidBody(definition.mass));

  const samplePoints: BuoyancySamplePoint[] = definition.hullSamplePoints.map((p) => ({
    localOffset: p.offset.clone(),
    area: p.area,
  }));
  world.addComponent(entity, 'Buoyancy', createBuoyancy(samplePoints));

  world.addComponent(entity, 'BoatControl', createBoatControl());

  if (definition.sailArea > 0) {
    world.addComponent(entity, 'WindReceiver', createWindReceiver(definition.sailArea));
  }

  const mesh = createSailboatMesh();
  scene.add(mesh);
  world.addComponent(entity, 'MeshRenderable', createMeshRenderable(mesh));

  return entity;
}
