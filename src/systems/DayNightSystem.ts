import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { SkyRenderer } from '../rendering/Sky';
import { Stars } from '../rendering/Stars';
import { Ocean } from '../rendering/Ocean';

export class DayNightSystem extends System {
  timeOfDay = 0.35; // start mid-morning
  cycleDuration = 600; // seconds per full day (10 minutes)

  private sky: SkyRenderer;
  private stars: Stars;
  private ocean: Ocean;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.HemisphereLight;

  constructor(
    sky: SkyRenderer,
    stars: Stars,
    ocean: Ocean,
    sunLight: THREE.DirectionalLight,
    ambientLight: THREE.HemisphereLight
  ) {
    super(70); // priority
    this.sky = sky;
    this.stars = stars;
    this.ocean = ocean;
    this.sunLight = sunLight;
    this.ambientLight = ambientLight;
  }

  update(_world: World, dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt / this.cycleDuration) % 1;

    // Update sky
    this.sky.updateSunPosition(this.timeOfDay);
    const sunDir = this.sky.getSunDirection();
    const sunColor = this.sky.getSunColor();
    const sunElevation = sunDir.y;

    // Update sun light
    this.sunLight.position.copy(sunDir).multiplyScalar(100);
    this.sunLight.color.copy(sunColor);
    this.sunLight.intensity = Math.max(0, sunElevation * 2);

    // Update ambient light
    if (sunElevation > 0.1) {
      // Day
      this.ambientLight.color.setRGB(0.4, 0.5, 0.7);    // sky
      this.ambientLight.groundColor.setRGB(0.15, 0.12, 0.1); // ground
      this.ambientLight.intensity = 0.6;
    } else if (sunElevation > -0.1) {
      // Twilight
      const t = (sunElevation + 0.1) / 0.2;
      this.ambientLight.color.setRGB(
        THREE.MathUtils.lerp(0.05, 0.4, t),
        THREE.MathUtils.lerp(0.05, 0.5, t),
        THREE.MathUtils.lerp(0.15, 0.7, t)
      );
      this.ambientLight.groundColor.setRGB(0.05, 0.04, 0.03);
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.15, 0.6, t);
    } else {
      // Night
      this.ambientLight.color.setRGB(0.05, 0.05, 0.15);
      this.ambientLight.groundColor.setRGB(0.02, 0.02, 0.03);
      this.ambientLight.intensity = 0.15;
    }

    // Update stars
    this.stars.update(sunElevation);

    // Update ocean colors based on time of day
    this.ocean.setSunColor(sunColor);

    if (sunElevation > 0.1) {
      this.ocean.setDeepColor(new THREE.Color(0.005, 0.03, 0.14));
      this.ocean.setShallowColor(new THREE.Color(0.02, 0.18, 0.35));
    } else if (sunElevation > 0) {
      // Sunset/sunrise warm tones
      const t = sunElevation / 0.1;
      this.ocean.setDeepColor(new THREE.Color(
        THREE.MathUtils.lerp(0.08, 0.01, t),
        THREE.MathUtils.lerp(0.02, 0.04, t),
        THREE.MathUtils.lerp(0.12, 0.18, t)
      ));
      this.ocean.setShallowColor(new THREE.Color(
        THREE.MathUtils.lerp(0.15, 0.0, t),
        THREE.MathUtils.lerp(0.06, 0.15, t),
        THREE.MathUtils.lerp(0.18, 0.3, t)
      ));
    } else {
      // Night — dark ocean
      this.ocean.setDeepColor(new THREE.Color(0.005, 0.01, 0.04));
      this.ocean.setShallowColor(new THREE.Color(0.01, 0.03, 0.08));
    }
  }

  getSunDirection(): THREE.Vector3 {
    return this.sky.getSunDirection();
  }
}
