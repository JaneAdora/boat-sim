import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Ocean } from '../rendering/Ocean';
import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';

const _sternLocal = new THREE.Vector3(0, 0.2, -2.8);
const _backward = new THREE.Vector3();
const _sternWorld = new THREE.Vector3();

export class TowingSystem extends System {
  private scene: THREE.Scene;
  private ocean: Ocean;
  private boatEntity: number;
  private wildlifeSystem: WildlifeSystem;
  private isTugboat: boolean;

  // Tow state
  private towedEntity: WildlifeEntity | null = null;
  private nearestTowable: WildlifeEntity | null = null;
  private towLine: THREE.Line | null = null;
  private towLinePositions: Float32Array;
  private time = 0;

  // UI
  private towButton: HTMLButtonElement;

  private static readonly TOW_RANGE = 50;
  private static readonly ROPE_SEGMENTS = 8;
  private static readonly FISHING_TOW_DISTANCE = 8;
  private static readonly CARGO_TOW_DISTANCE = 18;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    boatEntity: number,
    wildlifeSystem: WildlifeSystem,
    boatMeshType: string,
  ) {
    super(67); // after WildlifeSystem (65), before SeagullSystem (70)
    this.scene = scene;
    this.ocean = ocean;
    this.boatEntity = boatEntity;
    this.wildlifeSystem = wildlifeSystem;
    this.isTugboat = boatMeshType === 'tugboat';

    // Pre-allocate rope vertex buffer
    this.towLinePositions = new Float32Array((TowingSystem.ROPE_SEGMENTS + 1) * 3);

    // Create UI button
    this.towButton = document.createElement('button');
    this.towButton.id = 'tow-button';
    this.towButton.textContent = 'Tow';
    document.body.appendChild(this.towButton);

    if (this.isTugboat) {
      // Use both touchend and click for reliable mobile support
      this.towButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.toggleTow();
      });
      this.towButton.addEventListener('click', () => {
        this.toggleTow();
      });

      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyT' && !e.repeat) {
          this.toggleTow();
        }
      });
    }
  }

  update(world: World, dt: number): void {
    if (!this.isTugboat) return;

    this.time += dt;

    const transform = world.getComponent<Transform>(this.boatEntity, 'Transform');
    if (!transform) return;

    if (this.towedEntity) {
      // Verify towed entity still exists
      if (!this.wildlifeSystem.isEntityAlive(this.towedEntity)) {
        this.releaseTow();
        return;
      }

      // Update towed position and rope
      this.updateTowedPosition(transform, dt);
      this.updateRopeLine(transform);

      // Button shows "Release Tow"
      this.towButton.textContent = 'Release Tow';
      this.towButton.classList.add('visible', 'towing');
    } else {
      // Find nearest towable vessel
      this.nearestTowable = this.wildlifeSystem.findNearestTowable(
        transform.position.x,
        transform.position.z,
        TowingSystem.TOW_RANGE,
      );

      if (this.nearestTowable) {
        const label = this.nearestTowable.type === 'cargo_ship' ? 'Cargo Ship' : 'Fishing Boat';
        this.towButton.textContent = `Tow ${label}`;
        this.towButton.classList.add('visible');
        this.towButton.classList.remove('towing');
      } else {
        this.towButton.textContent = 'No boats nearby';
        this.towButton.classList.add('visible');
        this.towButton.classList.remove('towing');
      }
    }
  }

  private toggleTow(): void {
    if (this.towedEntity) {
      this.releaseTow();
    } else if (this.nearestTowable) {
      this.startTow(this.nearestTowable);
    }
  }

  private startTow(entity: WildlifeEntity): void {
    this.towedEntity = entity;
    this.wildlifeSystem.setEntityTowed(entity, true);

    // Create tow rope
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.towLinePositions, 3),
    );
    const material = new THREE.LineBasicMaterial({ color: 0x8b7355 });
    this.towLine = new THREE.Line(geometry, material);
    this.scene.add(this.towLine);
  }

  private releaseTow(): void {
    if (this.towedEntity) {
      this.wildlifeSystem.setEntityTowed(this.towedEntity, false);
      this.towedEntity = null;
      this.nearestTowable = null;
    }

    if (this.towLine) {
      this.scene.remove(this.towLine);
      this.towLine.geometry.dispose();
      (this.towLine.material as THREE.Material).dispose();
      this.towLine = null;
    }

    this.towButton.classList.remove('visible', 'towing');
  }

  private updateTowedPosition(boatTransform: Transform, dt: number): void {
    const e = this.towedEntity!;

    // Compute stern attachment point in world space
    _sternWorld.copy(_sternLocal).applyQuaternion(boatTransform.quaternion);
    _sternWorld.add(boatTransform.position);

    // Backward direction from tug
    _backward.set(0, 0, -1).applyQuaternion(boatTransform.quaternion);

    // Distance depends on vessel type
    const towDist = e.type === 'cargo_ship'
      ? TowingSystem.CARGO_TOW_DISTANCE
      : TowingSystem.FISHING_TOW_DISTANCE;

    // Place towed vessel behind stern
    const tx = _sternWorld.x + _backward.x * towDist;
    const tz = _sternWorld.z + _backward.z * towDist;

    // Wave height so the vessel sits on water
    const waveY = this.ocean.getWaveHeight(tx, tz, this.time);
    const yOffset = e.type === 'cargo_ship' ? 0.8 : 0.3;
    e.mesh.position.set(tx, waveY + yOffset, tz);

    // Smooth heading follow
    const targetHeading = boatTransform.rotation.y;
    let headingDiff = targetHeading - e.heading;
    // Normalize to [-PI, PI]
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    e.heading += headingDiff * 2.0 * dt;
    e.mesh.rotation.y = e.heading;

    // Gentle wave rocking (same as WildlifeSystem)
    const t = this.time;
    if (e.type === 'fishing_boat') {
      e.mesh.rotation.x = Math.sin(t * 1.2 + e.phase) * 0.05;
      e.mesh.rotation.z = Math.sin(t * 0.8 + e.phase * 1.3) * 0.06;
    } else {
      e.mesh.rotation.x = Math.sin(t * 0.6 + e.phase) * 0.02;
      e.mesh.rotation.z = Math.sin(t * 0.4 + e.phase) * 0.03;
    }
  }

  private updateRopeLine(boatTransform: Transform): void {
    if (!this.towLine || !this.towedEntity) return;

    const e = this.towedEntity;
    const segs = TowingSystem.ROPE_SEGMENTS;

    // Stern bitt in world space (already computed in _sternWorld)
    const sx = _sternWorld.x;
    const sy = _sternWorld.y + boatTransform.position.y;
    const sz = _sternWorld.z;

    // Towed vessel bow point (front of vessel in local space)
    const bowOffset = e.type === 'cargo_ship' ? 8.0 : 1.75;
    const bowDir = new THREE.Vector3(0, 0, bowOffset);
    bowDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), e.heading);
    const bx = e.mesh.position.x + bowDir.x;
    const by = e.mesh.position.y + 0.3;
    const bz = e.mesh.position.z + bowDir.z;

    // Fill rope vertices with parabolic sag
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const sag = -Math.sin(t * Math.PI) * 0.5;
      this.towLinePositions[i * 3] = sx + (bx - sx) * t;
      this.towLinePositions[i * 3 + 1] = sy + (by - sy) * t + sag;
      this.towLinePositions[i * 3 + 2] = sz + (bz - sz) * t;
    }

    (this.towLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
