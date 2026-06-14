import * as THREE from 'three';
import { clamp } from '../utils/math';

const SEABED_Y = -42;

/**
 * The underwater look for the submarine. A full-screen blue tint deepens as the
 * camera sinks below the surface, and a dim seabed plane slides along under the
 * boat so the deep isn't an empty void. Created only for a sub; driven each frame
 * by the camera's depth.
 */
export class Underwater {
  private tint: HTMLElement;
  private seabed: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    document.getElementById('underwater')?.remove();
    this.tint = document.createElement('div');
    this.tint.id = 'underwater';
    this.tint.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 6; opacity: 0;
      background: radial-gradient(ellipse at 50% 36%, rgba(14,70,98,0.42), rgba(2,16,34,0.93));
    `;
    document.body.appendChild(this.tint);

    const geo = new THREE.PlaneGeometry(700, 700);
    geo.rotateX(-Math.PI / 2);
    this.seabed = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 1 }));
    this.seabed.position.y = SEABED_Y;
    this.seabed.visible = false;
    scene.add(this.seabed);
  }

  /** Tint follows the camera's depth (we're under when it dips below 0); the
   *  seabed tracks the sub's column. */
  update(cameraY: number, subX: number, subZ: number): void {
    const submersion = clamp(-cameraY / 14, 0, 1);
    this.tint.style.opacity = (submersion * 0.9).toFixed(3);
    this.seabed.visible = submersion > 0.02;
    this.seabed.position.set(subX, SEABED_Y, subZ);
  }

  dispose(): void {
    this.tint.remove();
    this.scene.remove(this.seabed);
    this.seabed.geometry.dispose();
    (this.seabed.material as THREE.Material).dispose();
  }
}
