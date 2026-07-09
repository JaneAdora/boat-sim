import * as THREE from 'three';
import { clamp } from '../utils/math';
import { floorAt, TRENCH } from '../world/TrenchProfile';

/**
 * The underwater look for the submarine. A full-screen blue tint deepens as the
 * camera sinks below the surface, and a dim seabed plane slides along under the
 * boat so the deep isn't an empty void. Created only for a sub; driven each frame
 * by the camera's depth.
 *
 * Act 2: the seabed follows the trench profile (never a ceiling — it always
 * sits below the local dive floor), and a second near-black layer closes in
 * below the old world floor so the deep zone reads as another world.
 */
export class Underwater {
  private tint: HTMLElement;
  private deepTint: HTMLElement;
  private seabed: THREE.Mesh;
  private seabedMat: THREE.MeshStandardMaterial;
  private shallowColor = new THREE.Color(0x3a4030);
  private deepColor = new THREE.Color(0x11181e);

  constructor(private scene: THREE.Scene) {
    document.getElementById('underwater')?.remove();
    this.tint = document.createElement('div');
    this.tint.id = 'underwater';
    this.tint.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 6; opacity: 0;
      background: radial-gradient(ellipse at 50% 36%, rgba(14,70,98,0.42), rgba(2,16,34,0.93));
    `;
    document.body.appendChild(this.tint);

    document.getElementById('underwater-deep')?.remove();
    this.deepTint = document.createElement('div');
    this.deepTint.id = 'underwater-deep';
    this.deepTint.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 7; opacity: 0;
      background: radial-gradient(ellipse at 50% 42%, rgba(3,12,20,0.55), rgba(1,4,8,0.96));
    `;
    document.body.appendChild(this.deepTint);

    const geo = new THREE.PlaneGeometry(700, 700);
    geo.rotateX(-Math.PI / 2);
    this.seabedMat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 1 });
    this.seabed = new THREE.Mesh(geo, this.seabedMat);
    this.seabed.visible = false;
    scene.add(this.seabed);
  }

  /** Tint follows the camera's depth (we're under when it dips below 0); the
   *  seabed tracks the sub's column at the local profile floor. */
  update(cameraY: number, subX: number, subZ: number): void {
    const submersion = clamp(-cameraY / 14, 0, 1);
    this.tint.style.opacity = (submersion * 0.9).toFixed(3);

    // The deep band: fades in below the old −35 world floor.
    const deep = clamp((-cameraY - 28) / 30, 0, 1);
    this.deepTint.style.opacity = (deep * 0.82).toFixed(3);

    this.seabed.visible = submersion > 0.02;
    const floor = floorAt(subX, subZ);
    this.seabed.position.set(subX, floor - TRENCH.seabedOffset, subZ);
    this.seabedMat.color.copy(this.shallowColor).lerp(this.deepColor, deep);
  }

  dispose(): void {
    this.tint.remove();
    this.deepTint.remove();
    this.scene.remove(this.seabed);
    this.seabed.geometry.dispose();
    (this.seabed.material as THREE.Material).dispose();
  }
}
