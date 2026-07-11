import * as THREE from 'three';
import { clamp } from '../utils/math';
import { floorAt, fadeParams, TRENCH } from '../world/TrenchProfile';

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
  private warmTint: HTMLElement;
  private seabed: THREE.Mesh;
  private seabedMat: THREE.MeshStandardMaterial;
  private shallowColor = new THREE.Color(0x3a4030);
  private deepColor = new THREE.Color(0x11181e);
  /** 0 = the cold deep (always, outside Act 3's heart beats); 1 = bathed in
   *  the heart's gold. Driven by MissionSystem; reset to 0 on every disarm. */
  private warmth = 0;

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

    // Act 3: the heart of the deep glows WARM through the cold layers — a
    // candle-gold cast that rises as the sub nears it. Opacity 0 unless the
    // campaign drives setWarmth, so every other dive renders exactly as before.
    document.getElementById('underwater-warm')?.remove();
    this.warmTint = document.createElement('div');
    this.warmTint.id = 'underwater-warm';
    this.warmTint.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 8; opacity: 0;
      background: radial-gradient(ellipse at 50% 58%, rgba(232,186,92,0.5), rgba(46,28,6,0.88));
    `;
    document.body.appendChild(this.warmTint);

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

    // The deep band: fades in below the old −35 world floor (curve is
    // era-aware — act2's numbers are the shipped literals, frozen).
    const fade = fadeParams();
    const deep = clamp((-cameraY - fade.start) / fade.range, 0, 1);
    // The heart's warmth displaces the cold: gold rises over the near-black,
    // which thins in step, so full warmth reads candle-lit, not muddy.
    this.deepTint.style.opacity = (deep * 0.82 * (1 - this.warmth * 0.75)).toFixed(3);
    this.warmTint.style.opacity = (deep * this.warmth * 0.66).toFixed(3);

    this.seabed.visible = submersion > 0.02;
    const floor = floorAt(subX, subZ);
    this.seabed.position.set(subX, floor - TRENCH.seabedOffset, subZ);
    this.seabedMat.color.copy(this.shallowColor).lerp(this.deepColor, deep);
  }

  /** Act 3 (beats 21-22): how deep into the heart's gold the water is. */
  setWarmth(w: number): void {
    this.warmth = clamp(w, 0, 1);
  }

  dispose(): void {
    this.tint.remove();
    this.deepTint.remove();
    this.warmTint.remove();
    this.scene.remove(this.seabed);
    this.seabed.geometry.dispose();
    (this.seabed.material as THREE.Material).dispose();
  }
}
