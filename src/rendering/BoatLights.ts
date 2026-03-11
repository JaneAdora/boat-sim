import * as THREE from 'three';

/**
 * Navigation lights for the player boat.
 * Red (port/left), green (starboard/right), white (stern), warm cabin glow.
 * Visible at night, fade with sun elevation.
 */
export class BoatLights {
  private group: THREE.Group;
  private lights: THREE.PointLight[] = [];
  private currentIntensity = 0;

  constructor(private boatGroup: THREE.Group, meshType: string) {
    this.group = new THREE.Group();
    boatGroup.add(this.group);

    // Scale offsets based on boat type
    const offsets = this.getOffsets(meshType);

    // Port (red) navigation light — extended range for camera visibility
    const portLight = new THREE.PointLight(0xff2020, 0, 50, 1.5);
    portLight.position.copy(offsets.port);
    this.group.add(portLight);
    this.lights.push(portLight);

    // Starboard (green) navigation light
    const stbdLight = new THREE.PointLight(0x20ff40, 0, 50, 1.5);
    stbdLight.position.copy(offsets.starboard);
    this.group.add(stbdLight);
    this.lights.push(stbdLight);

    // Stern white light
    const sternLight = new THREE.PointLight(0xffeedd, 0, 60, 1.5);
    sternLight.position.copy(offsets.stern);
    this.group.add(sternLight);
    this.lights.push(sternLight);

    // Cabin warm glow (interior light effect)
    const cabinLight = new THREE.PointLight(0xffcc66, 0, 40, 1.5);
    cabinLight.position.copy(offsets.cabin);
    this.group.add(cabinLight);
    this.lights.push(cabinLight);

    // Small light meshes (visible glowing dots) for nav lights
    const glowGeom = new THREE.SphereGeometry(0.06, 4, 3);
    const portGlow = new THREE.Mesh(glowGeom, new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    portGlow.position.copy(offsets.port);
    this.group.add(portGlow);

    const stbdGlow = new THREE.Mesh(glowGeom, new THREE.MeshBasicMaterial({ color: 0x30ff50 }));
    stbdGlow.position.copy(offsets.starboard);
    this.group.add(stbdGlow);

    const sternGlow = new THREE.Mesh(glowGeom, new THREE.MeshBasicMaterial({ color: 0xffeedd }));
    sternGlow.position.copy(offsets.stern);
    this.group.add(sternGlow);
  }

  private getOffsets(meshType: string): {
    port: THREE.Vector3;
    starboard: THREE.Vector3;
    stern: THREE.Vector3;
    cabin: THREE.Vector3;
  } {
    switch (meshType) {
      case 'cruiseship':
        return {
          port: new THREE.Vector3(-3.5, 2.5, 8),
          starboard: new THREE.Vector3(3.5, 2.5, 8),
          stern: new THREE.Vector3(0, 3, -10),
          cabin: new THREE.Vector3(0, 7, 2),
        };
      case 'speedboat':
        return {
          port: new THREE.Vector3(-0.9, 0.7, 2),
          starboard: new THREE.Vector3(0.9, 0.7, 2),
          stern: new THREE.Vector3(0, 0.5, -2.5),
          cabin: new THREE.Vector3(0, 0.6, 0.3),
        };
      case 'tugboat':
      default:
        return {
          port: new THREE.Vector3(-1.7, 1.1, 2.5),
          starboard: new THREE.Vector3(1.7, 1.1, 2.5),
          stern: new THREE.Vector3(0, 1.0, -3),
          cabin: new THREE.Vector3(0, 1.5, -0.3),
        };
    }
  }

  update(sunElevation: number): void {
    // Fade in as sun sets
    let target = 0;
    if (sunElevation < -0.05) {
      target = 1;
    } else if (sunElevation < 0.05) {
      target = 1 - (sunElevation + 0.05) / 0.1;
    }

    // Smooth interpolation
    this.currentIntensity += (target - this.currentIntensity) * 0.05;

    for (const light of this.lights) {
      light.intensity = this.currentIntensity * 3.0;
    }

    this.group.visible = this.currentIntensity > 0.01;
  }
}
