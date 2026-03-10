import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { BoatDefinition } from './BoatDefinition';
import { createTransform } from '../components/Transform';
import { createRigidBody } from '../components/RigidBody';
import { createBuoyancy, BuoyancySamplePoint } from '../components/Buoyancy';
import { createBoatControl } from '../components/BoatControl';
import { createWindReceiver } from '../components/WindReceiver';
import { createMeshRenderable } from '../components/MeshRenderable';

// ─── Shared materials ───────────────────────────────────────

const steelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.6 });

// ─── Hull geometry (parametric cross-section loft) ──────────

interface HullParams {
  length: number;
  segments: number;
  radialSegments: number;
  widthProfile: (t: number) => number;   // t: 0=stern, 1=bow → half-width
  depthProfile: (t: number) => number;   // t → depth below waterline
  squareness?: number;                   // 1 = round, <1 = boxy
}

function createParametricHull(params: HullParams): THREE.BufferGeometry {
  const { length, segments, radialSegments, widthProfile, depthProfile, squareness = 1 } = params;
  const halfLength = length / 2;
  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  const profiles: { z: number; halfWidth: number; depth: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = -halfLength + t * length;
    profiles.push({ z, halfWidth: Math.max(widthProfile(t), 0.01), depth: depthProfile(t) });
  }

  // Cross-section vertices: θ=0 → port gunwale, θ=π/2 → keel, θ=π → starboard gunwale
  for (let i = 0; i <= segments; i++) {
    const { z, halfWidth, depth } = profiles[i];
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const x = -Math.sign(cosA) * Math.pow(Math.abs(cosA), squareness) * halfWidth;
      const y = -Math.pow(Math.abs(sinA), squareness) * depth;
      vertices.push(x, y, z);
      // Placeholder normals — computeVertexNormals() overwrites these
      normals.push(0, 0, 0);
    }
  }

  // Deck vertices
  const deckStart = vertices.length / 3;
  for (let i = 0; i <= segments; i++) {
    const { z, halfWidth } = profiles[i];
    vertices.push(-halfWidth, 0, z);
    normals.push(0, 1, 0);
    vertices.push(halfWidth, 0, z);
    normals.push(0, 1, 0);
  }

  // Hull faces
  const stride = radialSegments + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  // Deck faces
  for (let i = 0; i < segments; i++) {
    const pA = deckStart + i * 2;
    const sA = pA + 1;
    const pB = deckStart + (i + 1) * 2;
    const sB = pB + 1;
    indices.push(pA, pB, sA);
    indices.push(sA, pB, sB);
  }

  // Stern transom cap — triangle fan closing the back of the hull
  const sternCenter = vertices.length / 3;
  const sternProfile = profiles[0];
  vertices.push(0, -sternProfile.depth * 0.4, sternProfile.z);
  normals.push(0, 0, -1);
  // Fan from center to each pair of adjacent stern ring vertices (i=0)
  for (let j = 0; j < radialSegments; j++) {
    indices.push(sternCenter, j + 1, j); // winding for -z facing normal
  }
  // Cap top of transom: connect deck corners through center
  const sternDeckP = deckStart;      // port deck vertex at i=0
  const sternDeckS = deckStart + 1;  // starboard deck vertex at i=0
  indices.push(sternCenter, 0, sternDeckP);                  // port gunwale to port deck
  indices.push(sternCenter, sternDeckS, radialSegments);     // starboard deck to starboard gunwale

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ─── Sailboat mesh ──────────────────────────────────────────

function createSailGeometry(width: number, height: number, segments: number = 8): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let iy = 0; iy <= segments; iy++) {
    const v = iy / segments;
    const rowWidth = width * (1 - v * 0.85);
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.4;
      vertices.push(u * rowWidth, v * height, billow);
    }
  }
  const stride = segments + 1;
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * stride + ix;
      indices.push(a, a + stride, a + 1);
      indices.push(a + 1, a + stride, a + stride + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export interface BoatParts {
  group: THREE.Group;
  sailPivot: THREE.Group | null;
  rudderPivot: THREE.Group;
}

function createSailboatMesh(): BoatParts {
  const group = new THREE.Group();
  const hullGeometry = createParametricHull({
    length: 8, segments: 20, radialSegments: 12,
    widthProfile: (t) => {
      let hw = t < 0.4 ? 1.4 * Math.sqrt(t / 0.4) : 1.4 * Math.pow(1 - (t - 0.4) / 0.6, 0.7);
      return Math.max(hw, 0.02);
    },
    depthProfile: (t) => 1.2 * Math.sin(t * Math.PI) * 0.8 + 0.3,
  });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6B3A2A, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(hullGeometry, hullMat));

  // Keel
  const keelShape = new THREE.Shape();
  keelShape.moveTo(0, 0); keelShape.lineTo(0.1, -1.8); keelShape.lineTo(-0.1, -1.8); keelShape.closePath();
  const keelGeom = new THREE.ExtrudeGeometry(keelShape, { depth: 1.5, bevelEnabled: false });
  keelGeom.translate(0, 0, -0.75); keelGeom.rotateY(Math.PI / 2);
  const keelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  const keel = new THREE.Mesh(keelGeom, keelMat);
  keel.position.set(0, -0.8, 0);
  group.add(keel);

  // Mast
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.5, metalness: 0.15 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 10, 8), mastMat);
  mast.position.set(0, 5, 1.2);
  group.add(mast);

  // Sail pivot
  const sailPivot = new THREE.Group();
  sailPivot.position.set(0, 0, 1.2);
  group.add(sailPivot);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xFAF0E6, roughness: 0.85, side: THREE.DoubleSide });
  const sail = new THREE.Mesh(createSailGeometry(3, 7.5), sailMat);
  sail.position.set(0, 1.5, 0);
  sailPivot.add(sail);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6), mastMat);
  boom.position.set(1.3, 1.5, 0);
  boom.rotation.z = Math.PI / 2 + 0.05;
  sailPivot.add(boom);

  // Rudder pivot
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, -0.5, -3.5);
  group.add(rudderPivot);
  rudderPivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.4), keelMat));

  // Cabin
  const cabinGeom = new THREE.BoxGeometry(1.6, 0.6, 1.8);
  cabinGeom.translate(0, 0.3, 0);
  const cabin = new THREE.Mesh(cabinGeom, new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.7, metalness: 0.05 }));
  cabin.position.set(0, 0, -1.5);
  group.add(cabin);

  return { group, sailPivot, rudderPivot };
}

// ─── Tugboat mesh ───────────────────────────────────────────

function createTugboatMesh(): BoatParts {
  const group = new THREE.Group();

  // Visual hull container — offset upward so boat appears to sit higher in water
  // Physics sample points are separate, this is purely visual
  const hull = new THREE.Group();
  hull.position.y = 0.55;
  group.add(hull);

  // Hull — short, wide, flat stern, boxy cross-section
  const hullGeometry = createParametricHull({
    length: 7,
    segments: 16,
    radialSegments: 10,
    squareness: 0.6, // boxy hull
    widthProfile: (t) => {
      // Wide flat stern, stays wide, narrows at bow
      if (t < 0.15) return 1.7; // flat transom stern
      if (t < 0.7) return 1.7 + 0.1 * Math.sin((t - 0.15) / 0.55 * Math.PI); // slight swell midships
      // Bow narrows — Math.max(0,...) prevents NaN from float precision
      return Math.max(0.02, 1.8 * Math.pow(Math.max(0, 1 - (t - 0.7) / 0.3), 0.6));
    },
    depthProfile: (t) => {
      // Fairly uniform depth, slightly shallower at bow
      if (t > 0.85) return 1.0 * (1 - (t - 0.85) / 0.15 * 0.4);
      return 1.0;
    },
  });

  // Two-tone hull: red above waterline, dark below
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xCC3333,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  hull.add(new THREE.Mesh(hullGeometry, hullMat));

  // Gunwale / bulwark (raised edge around deck)
  const bulwarkMat = new THREE.MeshStandardMaterial({ color: 0xAA2222, roughness: 0.5, metalness: 0.1 });
  const bulwarkGeom = new THREE.BoxGeometry(0.08, 0.4, 5.5);
  const bulwarkL = new THREE.Mesh(bulwarkGeom, bulwarkMat);
  bulwarkL.position.set(-1.65, 0.2, 0.2);
  hull.add(bulwarkL);
  const bulwarkR = bulwarkL.clone();
  bulwarkR.position.x = 1.65;
  hull.add(bulwarkR);

  // Deck surface (flat plane slightly above hull)
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8, metalness: 0.0 });
  const deckGeom = new THREE.BoxGeometry(3.2, 0.06, 2.5);
  const foredeck = new THREE.Mesh(deckGeom, deckMat);
  foredeck.position.set(0, 0.03, 1.8);
  hull.add(foredeck);

  // Wheelhouse — cream colored boxy cabin
  const whMat = new THREE.MeshStandardMaterial({ color: 0xF5F0DC, roughness: 0.5, metalness: 0.05 });
  const whGeom = new THREE.BoxGeometry(2.6, 1.8, 2.4);
  const wheelhouse = new THREE.Mesh(whGeom, whMat);
  wheelhouse.position.set(0, 0.96, -0.3);
  hull.add(wheelhouse);

  // Wheelhouse roof (slightly larger, darker)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xDDD8C0, roughness: 0.6, metalness: 0.1 });
  const roofGeom = new THREE.BoxGeometry(2.8, 0.12, 2.6);
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.set(0, 1.92, -0.3);
  hull.add(roof);

  // Windows (dark blue rectangles on front of wheelhouse)
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.2, metalness: 0.4 });
  for (let i = -1; i <= 1; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), windowMat);
    win.position.set(i * 0.75, 1.2, 0.93);
    hull.add(win);
  }
  // Side windows
  for (let i = 0; i < 2; i++) {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.5), windowMat);
    sideWin.position.set(-1.32, 1.2, -0.3 + i * 0.8);
    hull.add(sideWin);
    const sideWinR = sideWin.clone();
    sideWinR.position.x = 1.32;
    hull.add(sideWinR);
  }

  // Smokestack (black cylinder with red band)
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.3 });
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8), stackMat);
  stack.position.set(0, 2.6, -0.8);
  hull.add(stack);

  // Stack top cap
  const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.4 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.15, 8), capMat);
  cap.position.set(0, 3.26, -0.8);
  hull.add(cap);

  // Red band on stack
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.5, metalness: 0.1 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.2, 8), bandMat);
  band.position.set(0, 2.85, -0.8);
  hull.add(band);

  // Tire fenders (torus shapes on the sides)
  const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9, metalness: 0.0 });
  const fenderGeom = new THREE.TorusGeometry(0.25, 0.1, 8, 12);
  for (let i = 0; i < 3; i++) {
    const z = 0.5 + i * 1.2;
    const fenderL = new THREE.Mesh(fenderGeom, fenderMat);
    fenderL.position.set(-1.75, -0.1, z);
    fenderL.rotation.y = Math.PI / 2;
    hull.add(fenderL);
    const fenderR = fenderL.clone();
    fenderR.position.x = 1.75;
    hull.add(fenderR);
  }

  // Bollards on foredeck
  const bollardGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6);
  for (let i = 0; i < 2; i++) {
    const bollard = new THREE.Mesh(bollardGeom, steelMat);
    bollard.position.set(i === 0 ? -0.8 : 0.8, 0.18, 2.5);
    hull.add(bollard);
  }

  // Towing bitt (stern)
  const bitt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6), steelMat);
  bitt.position.set(0, 0.2, -2.8);
  hull.add(bitt);

  // Mast/antenna (short pole on roof for navigation light)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), poleMat);
  pole.position.set(0, 2.55, 0.4);
  hull.add(pole);

  // Rudder pivot at stern (on hull container so it gets the visual offset too)
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, -0.5, -3.2);
  hull.add(rudderPivot);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  rudderPivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.5), rudderMat));

  return { group, sailPivot: null, rudderPivot };
}

// ─── Entity spawner ─────────────────────────────────────────

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

  world.addComponent(entity, 'BoatControl', createBoatControl(definition.enginePower));

  if (definition.sailArea > 0) {
    world.addComponent(entity, 'WindReceiver', createWindReceiver(definition.sailArea));
  }

  // Choose mesh based on boat type
  const parts = definition.enginePower > 0 ? createTugboatMesh() : createSailboatMesh();
  scene.add(parts.group);
  world.addComponent(entity, 'MeshRenderable', createMeshRenderable(parts.group));
  world.addComponent(entity, 'BoatVisuals', {
    sailPivot: parts.sailPivot,
    rudderPivot: parts.rudderPivot,
  });

  return entity;
}
