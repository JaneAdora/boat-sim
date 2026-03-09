import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class PostProcessing {
  composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Subtle bloom for sun reflections and atmospheric glow
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.15,  // strength — very subtle
      0.6,   // radius
      0.9    // threshold — only the brightest areas bloom
    );
    this.composer.addPass(this.bloomPass);

    // Output pass for correct color space
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  render(): void {
    this.composer.render();
  }

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }
}
