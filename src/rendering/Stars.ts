import * as THREE from 'three';

export class Stars {
  points: THREE.Points;
  private material: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, count: number = 3000) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 5000;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
    });

    this.points = new THREE.Points(geometry, this.material);
    scene.add(this.points);
  }

  /** Update star visibility based on sun elevation. Stars fade in when sun is below horizon. */
  update(sunElevation: number): void {
    if (sunElevation < 0) {
      this.material.opacity = Math.min(-sunElevation * 5, 0.8);
    } else if (sunElevation < 0.1) {
      this.material.opacity = (0.1 - sunElevation) * 8;
    } else {
      this.material.opacity = 0;
    }
    this.points.visible = this.material.opacity > 0.01;
  }
}
