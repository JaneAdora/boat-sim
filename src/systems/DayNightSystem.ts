import * as THREE from 'three';
import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { SkyRenderer } from '../rendering/Sky';
import { Stars } from '../rendering/Stars';
import { Ocean } from '../rendering/Ocean';

export class DayNightSystem extends System {
  timeOfDay = 0.72; // start near sunset
  cycleDuration = 360; // seconds per full day (6 minutes)

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
    // Non-linear time: nearly freeze near horizon, blast through noon/midnight.
    // This makes sunset and sunrise the dominant experience.
    const elevation = Math.sin(this.timeOfDay * Math.PI * 2 - Math.PI / 2);
    const absElev = Math.abs(elevation);
    // Near horizon (absElev~0): 0.06x speed (~100 min to cross).
    // At peak (absElev~1): 5x speed (~72s to cross noon/midnight).
    const speedMultiplier = 0.06 + absElev * absElev * 5.0;
    this.timeOfDay = (this.timeOfDay + dt / this.cycleDuration * speedMultiplier) % 1;

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
    if (sunElevation > 0.15) {
      // Full day
      this.ambientLight.color.setRGB(0.4, 0.5, 0.7);
      this.ambientLight.groundColor.setRGB(0.15, 0.12, 0.1);
      this.ambientLight.intensity = 0.6;
    } else if (sunElevation > 0.05) {
      // Late afternoon warm light
      const t = (sunElevation - 0.05) / 0.1;
      this.ambientLight.color.setRGB(
        THREE.MathUtils.lerp(0.5, 0.4, t),
        THREE.MathUtils.lerp(0.35, 0.5, t),
        THREE.MathUtils.lerp(0.4, 0.7, t)
      );
      this.ambientLight.groundColor.setRGB(
        THREE.MathUtils.lerp(0.2, 0.15, t),
        THREE.MathUtils.lerp(0.1, 0.12, t),
        THREE.MathUtils.lerp(0.06, 0.1, t)
      );
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.55, 0.6, t);
    } else if (sunElevation > -0.1) {
      // Golden hour → twilight → night
      const t = (sunElevation + 0.1) / 0.15;
      this.ambientLight.color.setRGB(
        THREE.MathUtils.lerp(0.05, 0.5, t),
        THREE.MathUtils.lerp(0.05, 0.35, t),
        THREE.MathUtils.lerp(0.15, 0.4, t)
      );
      this.ambientLight.groundColor.setRGB(
        THREE.MathUtils.lerp(0.03, 0.2, t),
        THREE.MathUtils.lerp(0.02, 0.1, t),
        THREE.MathUtils.lerp(0.02, 0.06, t)
      );
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.15, 0.55, t);
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

    if (sunElevation > 0.15) {
      // Full day — rich blue ocean
      this.ocean.setDeepColor(new THREE.Color(0.005, 0.03, 0.14));
      this.ocean.setShallowColor(new THREE.Color(0.02, 0.18, 0.35));
    } else if (sunElevation > 0.05) {
      // Late afternoon / early morning — warm golden tones creep in
      const t = (sunElevation - 0.05) / 0.1;
      this.ocean.setDeepColor(new THREE.Color(
        THREE.MathUtils.lerp(0.06, 0.005, t),
        THREE.MathUtils.lerp(0.025, 0.03, t),
        THREE.MathUtils.lerp(0.1, 0.14, t)
      ));
      this.ocean.setShallowColor(new THREE.Color(
        THREE.MathUtils.lerp(0.12, 0.02, t),
        THREE.MathUtils.lerp(0.1, 0.18, t),
        THREE.MathUtils.lerp(0.22, 0.35, t)
      ));
    } else if (sunElevation > 0) {
      // Golden hour / sunset — dramatic warm ocean
      const t = sunElevation / 0.05;
      this.ocean.setDeepColor(new THREE.Color(
        THREE.MathUtils.lerp(0.1, 0.06, t),
        THREE.MathUtils.lerp(0.02, 0.025, t),
        THREE.MathUtils.lerp(0.08, 0.1, t)
      ));
      this.ocean.setShallowColor(new THREE.Color(
        THREE.MathUtils.lerp(0.2, 0.12, t),
        THREE.MathUtils.lerp(0.08, 0.1, t),
        THREE.MathUtils.lerp(0.15, 0.22, t)
      ));
    } else if (sunElevation > -0.1) {
      // Twilight — cooling to night
      const t = (sunElevation + 0.1) / 0.1;
      this.ocean.setDeepColor(new THREE.Color(
        THREE.MathUtils.lerp(0.005, 0.1, t),
        THREE.MathUtils.lerp(0.01, 0.02, t),
        THREE.MathUtils.lerp(0.04, 0.08, t)
      ));
      this.ocean.setShallowColor(new THREE.Color(
        THREE.MathUtils.lerp(0.01, 0.2, t),
        THREE.MathUtils.lerp(0.03, 0.08, t),
        THREE.MathUtils.lerp(0.08, 0.15, t)
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
