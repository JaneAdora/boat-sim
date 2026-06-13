import * as THREE from 'three';

/**
 * Aurora ribbons on rare clear nights. Each night rolls once for an aurora
 * (~40%); it fades in only while the sky is dark and the weather clear.
 * Purely atmospheric — and a field-journal sighting.
 */
export class Aurora {
  private group = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = [];
  private active = false;
  private rolledTonight = false;
  private opacity = 0;
  private t = 0;

  constructor(private scene: THREE.Scene) {
    const colors = [0x46e8a8, 0x46c8d8, 0x8a6ae8];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1100, 130, 1, 1), mat);
      ribbon.position.set((i - 1) * 200, 170 + i * 50, 0);
      ribbon.rotation.x = 0.15;
      this.mats.push(mat);
      this.group.add(ribbon);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  isActive(): boolean {
    return this.active && this.opacity > 0.3;
  }

  update(dt: number, camPos: THREE.Vector3, sunY: number, rain: number): void {
    this.t += dt;

    // One roll per night, reset at sunrise
    if (sunY < -0.15 && !this.rolledTonight) {
      this.rolledTonight = true;
      this.active = Math.random() < 0.4;
    }
    if (sunY > 0) {
      this.rolledTonight = false;
      this.active = false;
    }

    const target = this.active && sunY < -0.15 && rain < 0.15 ? 1 : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 0.25);
    this.group.visible = this.opacity > 0.01;
    if (!this.group.visible) return;

    // Hangs in the northern sky, following the camera like the stars do
    this.group.position.set(camPos.x, 0, camPos.z - 900);
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].opacity = this.opacity * (0.16 - i * 0.03);
      const ribbon = this.group.children[i];
      ribbon.rotation.z = Math.sin(this.t * 0.08 + i * 1.7) * 0.08;
      ribbon.position.y = 170 + i * 50 + Math.sin(this.t * 0.15 + i) * 9;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const child of this.group.children) {
      (child as THREE.Mesh).geometry.dispose();
    }
    this.mats.forEach((m) => m.dispose());
  }
}
