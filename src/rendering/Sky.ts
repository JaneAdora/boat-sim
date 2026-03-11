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
      // Day — clear blue sky
      uniforms['turbidity'].value = 2;
      uniforms['rayleigh'].value = 1;
      uniforms['mieCoefficient'].value = 0.005;
      uniforms['mieDirectionalG'].value = 0.8;
    } else if (elevation > 0) {
      // Sunset/sunrise — warm, dramatic sky
      const t = elevation / 0.1;
      uniforms['turbidity'].value = THREE.MathUtils.lerp(8, 2, t);
      uniforms['rayleigh'].value = THREE.MathUtils.lerp(2, 1, t);
      uniforms['mieCoefficient'].value = THREE.MathUtils.lerp(0.01, 0.005, t);
      uniforms['mieDirectionalG'].value = THREE.MathUtils.lerp(0.9, 0.8, t);
    } else if (elevation > -0.05) {
      // Twilight — transitioning to dark
      const t = (elevation + 0.05) / 0.05;
      uniforms['turbidity'].value = THREE.MathUtils.lerp(0.5, 8, t);
      uniforms['rayleigh'].value = THREE.MathUtils.lerp(0.1, 2, t);
      uniforms['mieCoefficient'].value = THREE.MathUtils.lerp(0.001, 0.01, t);
      uniforms['mieDirectionalG'].value = THREE.MathUtils.lerp(0.2, 0.9, t);
    } else {
      // Night — very low scattering so sky goes properly dark
      uniforms['turbidity'].value = 0.5;
      uniforms['rayleigh'].value = 0.1;
      uniforms['mieCoefficient'].value = 0.001;
      uniforms['mieDirectionalG'].value = 0.2;
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
