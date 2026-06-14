import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { BoatDefinition, deriveDragQuad } from './BoatDefinition';
import { createTransform } from '../components/Transform';
import { createRigidBody } from '../components/RigidBody';
import { createBuoyancy, BuoyancySamplePoint } from '../components/Buoyancy';
import { createBoatControl } from '../components/BoatControl';
import { createWindReceiver } from '../components/WindReceiver';
import { createFlight } from '../components/Flight';
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
  rudderPivot: THREE.Group | null;
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

// ─── Cruise Ship mesh ────────────────────────────────────────

function createCruiseShipMesh(): BoatParts {
  const group = new THREE.Group();

  const hull = new THREE.Group();
  hull.position.y = 1.2;
  group.add(hull);

  // Hull — long, wide, tall
  const hullGeometry = createParametricHull({
    length: 20,
    segments: 24,
    radialSegments: 12,
    squareness: 0.5,
    widthProfile: (t) => {
      // Stern rounds inward slightly
      if (t < 0.08) return 2.5 + 1.0 * Math.sqrt(t / 0.08);
      if (t < 0.75) return 3.5 + 0.3 * Math.sin((t - 0.08) / 0.67 * Math.PI);
      return Math.max(0.02, 3.8 * Math.pow(Math.max(0, 1 - (t - 0.75) / 0.25), 0.5));
    },
    depthProfile: (t) => {
      if (t > 0.85) return 1.8 * (1 - (t - 0.85) / 0.15 * 0.5);
      return 1.8;
    },
  });

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1a2744, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide,
  });
  hull.add(new THREE.Mesh(hullGeometry, hullMat));

  // White superstructure — stacked decks
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xF8F8F0, roughness: 0.4, metalness: 0.05 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.2, metalness: 0.4 });

  // Deck 1 (main) — extends to hull stern
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.0, 17), deckMat);
  deck1.position.set(0, 1.0, -1.5);
  hull.add(deck1);

  // Deck 2 — slightly narrower, stepped back
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.8, 15), deckMat);
  deck2.position.set(0, 2.9, -1);
  hull.add(deck2);

  // Deck 3 (bridge deck, shorter)
  const deck3 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.5, 12), deckMat);
  deck3.position.set(0, 4.55, -0.5);
  hull.add(deck3);

  // Bridge (top)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.2, 3), deckMat);
  bridge.position.set(0, 5.9, 2);
  hull.add(bridge);

  // Bridge windows
  for (let i = -2; i <= 2; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.05), windowMat);
    win.position.set(i * 0.75, 6.0, 3.52);
    hull.add(win);
  }

  // Window rows on decks
  for (let deck = 0; deck < 3; deck++) {
    const y = 0.8 + deck * 1.85;
    const z_start = deck === 2 ? -3.5 : -7;
    const z_end = deck === 2 ? 3.5 : 5.5;
    for (let z = z_start; z <= z_end; z += 1.2) {
      // Port side
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.6), windowMat);
      winL.position.set(deck === 2 ? -2.52 : deck === 1 ? -2.92 : -3.22, y, z);
      hull.add(winL);
      // Starboard
      const winR = winL.clone();
      winR.position.x = -winL.position.x;
      hull.add(winR);
    }
  }

  // Funnel
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.4, metalness: 0.15 });
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.5, 10), funnelMat);
  funnel.position.set(0, 5.5, -2);
  hull.add(funnel);
  const funnelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.4 }));
  funnelTop.position.set(0, 6.85, -2);
  hull.add(funnelTop);

  // Railing posts along top deck edges
  const railMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.3, metalness: 0.6 });
  for (let z = -3; z <= 3; z += 1.5) {
    for (const x of [-2.6, 2.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), railMat);
      post.position.set(x, 5.55, z);
      hull.add(post);
    }
  }

  // Stern balcony ledges — tiered overhangs that break up the flat back
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0xE8E8E0, roughness: 0.45, metalness: 0.05 });
  const ledgeWidths = [6.6, 6.0, 5.2];
  const ledgeZs = [-10, -8.5, -6.5];
  const ledgeYs = [0.0, 1.95, 3.8];
  for (let i = 0; i < 3; i++) {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(ledgeWidths[i], 0.12, 0.6), ledgeMat);
    ledge.position.set(0, ledgeYs[i], ledgeZs[i] - 0.3);
    hull.add(ledge);
  }

  // Stern railing posts along each ledge
  for (let i = 0; i < 3; i++) {
    const w = ledgeWidths[i] / 2 - 0.2;
    for (let x = -w; x <= w; x += 1.2) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), railMat);
      post.position.set(x, ledgeYs[i] + 0.31, ledgeZs[i] - 0.5);
      hull.add(post);
    }
  }

  // Stern windows (dark rectangles on the back face of each deck)
  for (let deck = 0; deck < 2; deck++) {
    const y = 0.8 + deck * 1.9;
    const z = deck === 0 ? -10.0 : -8.5;
    const deckW = deck === 0 ? 6.4 : 5.8;
    for (let x = -deckW / 2 + 0.8; x <= deckW / 2 - 0.8; x += 1.2) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), windowMat);
      win.position.set(x, y, z - 0.03);
      hull.add(win);
    }
  }

  // Rudder
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, -1.0, -9.5);
  hull.add(rudderPivot);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  rudderPivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.8), rudderMat));

  return { group, sailPivot: null, rudderPivot };
}

// ─── Speedboat mesh ─────────────────────────────────────────

function createSpeedboatMesh(): BoatParts {
  const group = new THREE.Group();

  const hull = new THREE.Group();
  hull.position.y = 0.35;
  group.add(hull);

  // Hull — narrow, sleek, shallow
  const hullGeometry = createParametricHull({
    length: 5.5,
    segments: 16,
    radialSegments: 10,
    squareness: 0.7,
    widthProfile: (t) => {
      if (t < 0.1) return 0.9;
      if (t < 0.6) return 0.9 + 0.15 * Math.sin((t - 0.1) / 0.5 * Math.PI);
      return Math.max(0.02, 1.05 * Math.pow(Math.max(0, 1 - (t - 0.6) / 0.4), 0.4));
    },
    depthProfile: (t) => {
      if (t > 0.8) return 0.5 * (1 - (t - 0.8) / 0.2 * 0.4);
      return 0.5;
    },
  });

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xE8E8E8, roughness: 0.3, metalness: 0.15, side: THREE.DoubleSide,
  });
  hull.add(new THREE.Mesh(hullGeometry, hullMat));

  // Racing stripe (dark accent along hull sides)
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xCC2200, roughness: 0.4, metalness: 0.1 });
  const stripeGeom = new THREE.BoxGeometry(0.02, 0.15, 4.0);
  const stripeL = new THREE.Mesh(stripeGeom, stripeMat);
  stripeL.position.set(-0.92, -0.05, 0.2);
  hull.add(stripeL);
  const stripeR = stripeL.clone();
  stripeR.position.x = 0.92;
  hull.add(stripeR);

  // Cockpit floor
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.05 });
  const cockpitFloor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 2.0), deckMat);
  cockpitFloor.position.set(0, 0.02, -0.3);
  hull.add(cockpitFloor);

  // Windshield
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88bbdd, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6,
  });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.05), glassMat);
  windshield.position.set(0, 0.45, 0.8);
  windshield.rotation.x = -0.3;
  hull.add(windshield);

  // Windshield frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.5 });
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.04), frameMat);
  frameTop.position.set(0, 0.78, 0.72);
  frameTop.rotation.x = -0.3;
  hull.add(frameTop);

  // Console/dashboard
  const consoleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.1 });
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.3), consoleMat);
  console_.position.set(0, 0.2, 0.65);
  hull.add(console_);

  // Seats (two bucket seats)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F0, roughness: 0.8, metalness: 0.0 });
  for (const x of [-0.35, 0.35]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.4), seatMat);
    base.position.set(x, 0.17, 0);
    hull.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.08), seatMat);
    back.position.set(x, 0.42, -0.18);
    back.rotation.x = 0.15;
    hull.add(back);
  }

  // Outboard motor housing at stern
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.3 });
  const motorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.6), motorMat);
  motorHousing.position.set(0, -0.1, -2.5);
  hull.add(motorHousing);

  // Propeller shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), steelMat);
  shaft.position.set(0, -0.45, -2.5);
  hull.add(shaft);

  // Rudder
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, -0.35, -2.7);
  hull.add(rudderPivot);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  rudderPivot.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.3), rudderMat));

  return { group, sailPivot: null, rudderPivot };
}

// ─── Viking Ship ────────────────────────────────────────────

function createVikingShipMesh(): BoatParts {
  const group = new THREE.Group();

  const hull = new THREE.Group();
  hull.position.y = 0.3;
  group.add(hull);

  // Dark oak wood materials
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8, metalness: 0.0 });
  const lightWood = new THREE.MeshStandardMaterial({ color: 0x6b4c2a, roughness: 0.7, metalness: 0.0 });
  const goldMetal = new THREE.MeshStandardMaterial({ color: 0xc8a832, roughness: 0.3, metalness: 0.7 });

  // Hull — long, narrow, shallow-draft longship
  const hullGeometry = createParametricHull({
    length: 8,
    segments: 20,
    radialSegments: 10,
    squareness: 0.6,
    widthProfile: (t) => {
      if (t < 0.1) return 0.5 + t * 3;        // stern tapers
      if (t < 0.85) return 0.8;                // long narrow midship
      return Math.max(0.02, 0.8 * Math.pow((1 - t) / 0.15, 0.5)); // bow tapers sharply
    },
    depthProfile: (t) => {
      if (t > 0.85) return 0.4 * (1 - (t - 0.85) / 0.15 * 0.5);
      return 0.4; // shallow draft
    },
  });
  hull.add(new THREE.Mesh(hullGeometry, darkWood));

  // Deck planks
  const deckGeom = new THREE.BoxGeometry(1.4, 0.04, 6.5);
  const deck = new THREE.Mesh(deckGeom, lightWood);
  deck.position.set(0, 0.01, -0.2);
  hull.add(deck);

  // Rowing benches (4 pairs)
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.25), benchMat);
    bench.position.set(0, 0.08, -1.5 + i * 1.2);
    hull.add(bench);
  }

  // Shields along the sides (alternating red and yellow)
  const shieldColors = [0xAA2222, 0xCCAA22];
  for (let i = 0; i < 6; i++) {
    const shieldMat = new THREE.MeshStandardMaterial({
      color: shieldColors[i % 2], roughness: 0.5, metalness: 0.1,
    });
    const shield = new THREE.Mesh(new THREE.CircleGeometry(0.25, 8), shieldMat);
    // Port side
    shield.position.set(-0.85, 0.15, -2.0 + i * 1.0);
    shield.rotation.y = Math.PI / 2;
    hull.add(shield);
    // Starboard side
    const shieldR = shield.clone();
    shieldR.position.x = 0.85;
    shieldR.rotation.y = -Math.PI / 2;
    hull.add(shieldR);
  }

  // Shield boss (gold center dot)
  for (let i = 0; i < 6; i++) {
    const boss = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), goldMetal);
    boss.position.set(-0.86, 0.15, -2.0 + i * 1.0);
    boss.rotation.y = Math.PI / 2;
    hull.add(boss);
    const bossR = boss.clone();
    bossR.position.x = 0.86;
    bossR.rotation.y = -Math.PI / 2;
    hull.add(bossR);
  }

  // Bow — curved dragon head rising from bow
  const bowCurve = new THREE.Group();
  bowCurve.position.set(0, 0.3, 3.8);
  hull.add(bowCurve);

  // Neck — curved upward post
  const neckGeom = new THREE.BoxGeometry(0.12, 2.0, 0.12);
  const neck = new THREE.Mesh(neckGeom, darkWood);
  neck.position.set(0, 1.0, 0);
  neck.rotation.x = -0.25; // lean forward
  bowCurve.add(neck);

  // Dragon head
  const headGeom = new THREE.SphereGeometry(0.22, 6, 5);
  const head = new THREE.Mesh(headGeom, darkWood);
  head.scale.set(0.8, 0.7, 1.3);
  head.position.set(0, 2.0, 0.35);
  bowCurve.add(head);

  // Snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), darkWood);
  snout.rotation.x = -Math.PI / 2 + 0.2;
  snout.position.set(0, 1.85, 0.7);
  bowCurve.add(snout);

  // Eyes (gold)
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), goldMetal);
    eye.position.set(x, 2.05, 0.5);
    bowCurve.add(eye);
  }

  // Stern — curled tail post
  const sternPost = new THREE.Group();
  sternPost.position.set(0, 0.3, -3.6);
  hull.add(sternPost);

  const tailGeom = new THREE.BoxGeometry(0.1, 1.8, 0.1);
  const tail = new THREE.Mesh(tailGeom, darkWood);
  tail.position.set(0, 0.9, 0);
  tail.rotation.x = 0.3; // lean backward
  sternPost.add(tail);

  // Tail curl (small sphere at top)
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 8, Math.PI), darkWood);
  curl.position.set(0, 1.75, -0.25);
  curl.rotation.y = Math.PI / 2;
  sternPost.add(curl);

  // Mast
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7, metalness: 0.0 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.0, 6), mastMat);
  mast.position.set(0, 2.0, 0.3);
  hull.add(mast);

  // Yard (horizontal crossbeam)
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), mastMat);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 3.2, 0.3);
  hull.add(yard);

  // Square sail (decorative — cream colored with red stripes)
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xe8d8b8, roughness: 0.9, metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const sailGeom = new THREE.PlaneGeometry(2.5, 2.0);
  const sail = new THREE.Mesh(sailGeom, sailMat);
  sail.position.set(0, 2.2, 0.35);
  hull.add(sail);

  // Red sail stripes
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x992222, roughness: 0.9, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.25), stripeMat);
    stripe.position.set(0, 1.5 + i * 0.7, 0.36);
    hull.add(stripe);
  }

  // Rudder (steering oar at stern)
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0.5, -0.1, -3.5);
  hull.add(rudderPivot);
  const rudderMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7 });
  const rudderBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.5), rudderMat);
  rudderBlade.position.y = -0.3;
  rudderPivot.add(rudderBlade);

  return { group, sailPivot: null, rudderPivot };
}

function createJetSkiMesh(): BoatParts {
  const group = new THREE.Group();

  // Glossy gel-coat materials — vivid hull, cream deck, dark trim, blue flash
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8443a, roughness: 0.28, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4eee3, roughness: 0.4, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1d4e78, roughness: 0.35, metalness: 0.3 });

  // Smooth, curved forms only — an ellipsoid is a scaled unit sphere
  const ellipsoid = (rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat);
    m.scale.set(rx, ry, rz);
    return m;
  };

  // Lower hull — a long, low planing ellipsoid (forward is +Z)
  const hull = ellipsoid(0.5, 0.4, 1.42, bodyMat);
  hull.position.set(0, 0.16, -0.05);
  group.add(hull);

  // Upswept pointed bow — a faired cone, nose tilted up
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.5, 18), bodyMat);
  bow.scale.set(1, 0.72, 1);
  bow.rotation.x = Math.PI / 2 - 0.16;
  bow.position.set(0, 0.34, 1.12);
  group.add(bow);

  // Molded top deck / cowl — flatter cream ellipsoid riding the hull
  const deck = ellipsoid(0.44, 0.2, 1.2, trimMat);
  deck.position.set(0, 0.48, 0.04);
  group.add(deck);

  // Blue racing flash down each flank
  for (const side of [-1, 1]) {
    const flash = ellipsoid(0.1, 0.13, 0.95, accentMat);
    flash.position.set(side * 0.44, 0.26, 0.04);
    group.add(flash);
  }

  // Saddle seat — a rounded capsule running down the rear deck
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.85, 6, 12), darkMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, 0.64, -0.4);
  group.add(seat);

  // Front console swelling up to the bars
  const consolePod = ellipsoid(0.25, 0.22, 0.32, trimMat);
  consolePod.position.set(0, 0.6, 0.6);
  group.add(consolePod);

  // Raked steering column + handlebar with grips
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8), darkMat);
  column.rotation.x = -0.55;
  column.position.set(0, 0.84, 0.7);
  group.add(column);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.6, 8), darkMat);
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 0.99, 0.6);
  group.add(bars);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 8), bodyMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * 0.26, 0.99, 0.6);
    group.add(grip);
  }

  // Rear grab handle (half torus) and a jet nozzle hint at the transom
  const grab = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 14, Math.PI), darkMat);
  grab.rotation.x = Math.PI / 2;
  grab.position.set(0, 0.5, -1.12);
  group.add(grab);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.2, 12), darkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.1, -1.32);
  group.add(nozzle);

  return { group, sailPivot: null, rudderPivot: null };
}

function createHovercraftMesh(): BoatParts {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xef7d2a, roughness: 0.45, metalness: 0.15 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.5 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.6 });
  const ductMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.4, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2, metalness: 0.1 });

  const ellipsoid = (rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat);
    m.scale.set(rx, ry, rz);
    return m;
  };

  // The skirt — a wide, low rubber cushion the whole craft rides on (forward +Z)
  const skirt = ellipsoid(1.18, 0.34, 1.7, skirtMat);
  skirt.position.y = 0.2;
  group.add(skirt);
  const skirtRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.2, 10, 24), skirtMat);
  skirtRing.rotation.x = Math.PI / 2;
  skirtRing.scale.set(1, 1.5, 1); // oval — longer fore-and-aft
  skirtRing.position.y = 0.12;
  group.add(skirtRing);

  // Orange body sitting on the cushion, with a cream deck stripe
  const body = ellipsoid(0.86, 0.42, 1.36, bodyMat);
  body.position.y = 0.64;
  group.add(body);
  const deck = ellipsoid(0.6, 0.18, 1.05, trimMat);
  deck.position.set(0, 0.94, -0.06);
  group.add(deck);

  // Cockpit bubble + a seat
  const cockpit = ellipsoid(0.42, 0.36, 0.52, glassMat);
  cockpit.position.set(0, 1.02, 0.52);
  group.add(cockpit);
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 6, 10), darkMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, 0.98, 0.02);
  group.add(seat);

  // Twin ducted lift/thrust fans at the stern — the hovercraft signature.
  // A TorusGeometry lies in the XY plane (axis along Z), so the rings face aft.
  for (const side of [-1, 1]) {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.075, 10, 20), ductMat);
    duct.position.set(side * 0.48, 0.98, -1.45);
    group.add(duct);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), darkMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(side * 0.48, 0.98, -1.45);
    group.add(hub);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.11, 0.02), darkMat);
      blade.position.set(side * 0.48, 0.98, -1.46);
      blade.rotation.z = (b * Math.PI) / 4;
      group.add(blade);
    }
    // Vertical rudder vane behind each fan
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.42), trimMat);
    vane.position.set(side * 0.48, 1.0, -1.78);
    group.add(vane);
  }

  return { group, sailPivot: null, rudderPivot: null };
}

function createSeaplaneMesh(): BoatParts {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8402f, roughness: 0.45, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
  const floatMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.5, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2, metalness: 0.1 });

  const ellipsoid = (rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat);
    m.scale.set(rx, ry, rz);
    return m;
  };

  // Fuselage (forward is +Z) + cockpit glass + a cream spine stripe
  const body = ellipsoid(0.72, 0.8, 2.3, bodyMat);
  body.position.y = 0.9;
  group.add(body);
  const spine = ellipsoid(0.3, 0.2, 1.7, trimMat);
  spine.position.set(0, 1.5, -0.1);
  group.add(spine);
  const cockpit = ellipsoid(0.6, 0.55, 0.85, glassMat);
  cockpit.position.set(0, 1.25, 1.0);
  group.add(cockpit);

  // High wing on a pylon
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), bodyMat);
  pylon.position.set(0, 1.7, 0.1);
  group.add(pylon);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.18, 1.5), trimMat);
  wing.position.set(0, 2.0, 0.1);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 1.2), bodyMat);
    tip.position.set(side * 3.8, 2.0, 0.1);
    group.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), darkMat);
    strut.position.set(side * 1.6, 1.35, 0.1);
    strut.rotation.z = side * 0.5;
    group.add(strut);
  }

  // Twin floats on struts
  for (const side of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 3.0, 6, 12), floatMat);
    float.rotation.x = Math.PI / 2;
    float.position.set(side * 0.85, -0.35, 0.2);
    group.add(float);
    for (const zoff of [-1.0, 1.0]) {
      const fstrut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), darkMat);
      fstrut.position.set(side * 0.7, 0.25, zoff + 0.2);
      fstrut.rotation.z = side * 0.2;
      group.add(fstrut);
    }
  }

  // Nose cowl + spinning propeller (named so the flight system can spin it)
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 14), darkMat);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0.9, 2.4);
  group.add(cowl);
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(0, 0.9, 2.7);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 10), trimMat);
  spinner.rotation.x = Math.PI / 2;
  prop.add(spinner);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 0.05), darkMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    prop.add(blade);
  }
  group.add(prop);

  // Tail
  const vfin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.9), bodyMat);
  vfin.position.set(0, 1.6, -2.4);
  group.add(vfin);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 0.7), trimMat);
  hstab.position.set(0, 1.0, -2.5);
  group.add(hstab);

  return { group, sailPivot: null, rudderPivot: null };
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
  world.addComponent(entity, 'Buoyancy', createBuoyancy(samplePoints, deriveDragQuad(definition), definition.amphibious ?? false));

  world.addComponent(entity, 'BoatControl', createBoatControl(
    definition.enginePower,
    definition.rudderSlew,
    definition.turnRadius,
    definition.propWash,
  ));

  if (definition.sailArea > 0) {
    world.addComponent(entity, 'WindReceiver', createWindReceiver(definition.sailArea));
  }

  if (definition.canFly) {
    world.addComponent(entity, 'Flight', createFlight());
  }

  // Choose mesh based on boat type
  const meshCreators: Record<string, () => BoatParts> = {
    sailboat: createSailboatMesh,
    tugboat: createTugboatMesh,
    cruiseship: createCruiseShipMesh,
    speedboat: createSpeedboatMesh,
    vikingship: createVikingShipMesh,
    jetski: createJetSkiMesh,
    hovercraft: createHovercraftMesh,
    seaplane: createSeaplaneMesh,
  };
  const parts = (meshCreators[definition.meshType] || createTugboatMesh)();
  scene.add(parts.group);
  world.addComponent(entity, 'MeshRenderable', createMeshRenderable(parts.group));
  world.addComponent(entity, 'BoatVisuals', {
    sailPivot: parts.sailPivot,
    rudderPivot: parts.rudderPivot,
  });

  return entity;
}
