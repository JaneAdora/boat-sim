import * as THREE from 'three';
import { Sky as ThreeSky } from 'three/examples/jsm/objects/Sky.js';

export class SkyRenderer {
  sky: ThreeSky;
  sunDirection = new THREE.Vector3();
  private sunColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.sky = new ThreeSky();
    this.sky.scale.setScalar(10000);
    scene.add(this.sky);

    this.updateSunPosition(0.35); // start near noon
  }

  /**
   * Update sky based on time of day (0-1, where 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
   */
  updateSunPosition(timeOfDay: number): void {
    // Sun elevation: peaks at noon (0.5), below horizon at night
    const elevation = Math.sin(timeOfDay * Math.PI * 2 - Math.PI / 2);
    const azimuth = timeOfDay * Math.PI * 2;

    const phi = Math.PI / 2 - Math.asin(Math.max(elevation, -0.3));
    const theta = azimuth;

    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    const uniforms = this.sky.material.uniforms;
    uniforms['sunPosition'].value.copy(this.sunDirection);

    // Adjust atmospheric parameters based on sun elevation
    if (elevation > 0.1) {
      // Day
      uniforms['turbidity'].value = 2;
      uniforms['rayleigh'].value = 1;
      uniforms['mieCoefficient'].value = 0.005;
      uniforms['mieDirectionalG'].value = 0.8;
    } else if (elevation > -0.05) {
      // Dawn/dusk
      const t = (elevation + 0.05) / 0.15;
      uniforms['turbidity'].value = THREE.MathUtils.lerp(10, 2, t);
      uniforms['rayleigh'].value = THREE.MathUtils.lerp(3, 1, t);
      uniforms['mieCoefficient'].value = THREE.MathUtils.lerp(0.02, 0.005, t);
      uniforms['mieDirectionalG'].value = THREE.MathUtils.lerp(0.95, 0.8, t);
    } else {
      // Night
      uniforms['turbidity'].value = 10;
      uniforms['rayleigh'].value = 3;
      uniforms['mieCoefficient'].value = 0.02;
      uniforms['mieDirectionalG'].value = 0.95;
    }
  }

  getSunDirection(): THREE.Vector3 {
    return this.sunDirection;
  }

  getSunColor(): THREE.Color {
    const elevation = this.sunDirection.y;
    if (elevation > 0.2) {
      this.sunColor.setRGB(1.0, 0.95, 0.85);
    } else if (elevation > 0) {
      const t = elevation / 0.2;
      this.sunColor.setRGB(1.0, THREE.MathUtils.lerp(0.5, 0.95, t), THREE.MathUtils.lerp(0.2, 0.85, t));
    } else {
      this.sunColor.setRGB(0.1, 0.1, 0.15);
    }
    return this.sunColor;
  }
}
