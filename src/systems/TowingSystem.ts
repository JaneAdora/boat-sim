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
  // Tow state
  private towedEntity: WildlifeEntity | null = null;
  private nearestTowable: WildlifeEntity | null = null;
  private towLine: THREE.Line | null = null;
  private towLinePositions: Float32Array;
  private time = 0;

  // UI
  private towButton: HTMLButtonElement;
  private keydownHandler: (e: KeyboardEvent) => void;

  private towRange: number;
  private static readonly ROPE_SEGMENTS = 8;
  private static readonly FISHING_TOW_DISTANCE = 8;
  private static readonly CARGO_TOW_DISTANCE = 18;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    boatEntity: number,
    wildlifeSystem: WildlifeSystem,
    towRange = 80, // tow-winch upgrade extends this
  ) {
    super(67); // after WildlifeSystem (65), before SeagullSystem (70)
    this.towRange = towRange;
    this.scene = scene;
    this.ocean = ocean;
    this.boatEntity = boatEntity;
    this.wildlifeSystem = wildlifeSystem;

    // Pre-allocate rope vertex buffer
    this.towLinePositions = new Float32Array((TowingSystem.ROPE_SEGMENTS + 1) * 3);

    // Create UI button
    this.towButton = document.createElement('button');
    this.towButton.id = 'tow-button';
    this.towButton.textContent = 'Tow';
    document.body.appendChild(this.towButton);

    // Use both touchend and click for reliable mobile support
    this.towButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.toggleTow();
    });
    this.towButton.addEventListener('click', () => {
      this.toggleTow();
    });

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && !e.repeat) {
        this.toggleTow();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  update(world: World, dt: number): void {

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
        this.towRange,
      );

      if (this.nearestTowable) {
        const labels: Record<string, string> = {
          cargo_ship: 'Cargo Ship', fishing_boat: 'Fishing Boat',
          dolphin: 'Dolphin', whale: 'Whale',
        };
        const label = labels[this.nearestTowable.type] || this.nearestTowable.type;
        this.towButton.textContent = `Tow ${label}`;
        this.towButton.classList.add('visible');
        this.towButton.classList.remove('towing');
      } else {
        this.towButton.classList.remove('visible', 'towing');
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

    // Distance and Y offset depend on entity type
    const towDists: Record<string, number> = {
      cargo_ship: 18, fishing_boat: 8, whale: 6, dolphin: 4, barge: 14,
    };
    const yOffsets: Record<string, number> = {
      cargo_ship: 0.8, fishing_boat: 0.3, whale: 0.0, dolphin: 0.0, barge: 0.3,
    };
    const towDist = towDists[e.type] ?? 6;

    // Place towed entity behind stern
    const tx = _sternWorld.x + _backward.x * towDist;
    const tz = _sternWorld.z + _backward.z * towDist;

    // Wave height so the entity sits on water
    const waveY = this.ocean.getWaveHeight(tx, tz, this.time);
    e.mesh.position.set(tx, waveY + (yOffsets[e.type] ?? 0), tz);

    // Keep visible (dolphins/whales can hide underwater normally)
    e.mesh.visible = true;

    // Smooth heading follow
    const targetHeading = boatTransform.rotation.y;
    let headingDiff = targetHeading - e.heading;
    // Normalize to [-PI, PI]
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    e.heading += headingDiff * 2.0 * dt;
    e.mesh.rotation.y = e.heading;

    // Gentle rocking
    const t = this.time;
    e.mesh.rotation.x = Math.sin(t * 1.2 + e.phase) * 0.05;
    e.mesh.rotation.z = Math.sin(t * 0.8 + e.phase * 1.3) * 0.04;
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
    const bowOffsets: Record<string, number> = {
      cargo_ship: 8.0, fishing_boat: 1.75, whale: 3.2, dolphin: 1.0,
    };
    const bowOffset = bowOffsets[e.type] ?? 1.0;
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

  dispose(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    this.releaseTow();
    this.towButton.remove();
  }
}
