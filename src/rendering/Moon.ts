import * as THREE from 'three';

/**
 * A simple moon visible at night, positioned opposite the sun.
 * Uses a procedurally generated texture (bright circle with soft edge falloff)
 * and a larger glow sprite behind it for atmosphere.
 */
export class Moon {
  private moonSprite: THREE.Sprite;
  private glowSprite: THREE.Sprite;
  private moonMaterial: THREE.SpriteMaterial;
  private glowMaterial: THREE.SpriteMaterial;

  constructor(scene: THREE.Scene) {
    // Generate moon disc texture
    const moonTexture = this.generateMoonTexture(128);

    // Generate glow texture (larger, softer)
    const glowTexture = this.generateGlowTexture(128);

    // Moon disc sprite
    this.moonMaterial = new THREE.SpriteMaterial({
      map: moonTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      color: new THREE.Color(0.95, 0.93, 0.88), // pale silver-white with slight warm tint
    });
    this.moonSprite = new THREE.Sprite(this.moonMaterial);
    this.moonSprite.scale.set(60, 60, 1);
    this.moonSprite.visible = false;
    scene.add(this.moonSprite);

    // Glow sprite (larger, behind the moon)
    this.glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      color: new THREE.Color(0.7, 0.75, 0.9), // cool blue-ish glow
    });
    this.glowSprite = new THREE.Sprite(this.glowMaterial);
    this.glowSprite.scale.set(200, 200, 1);
    this.glowSprite.visible = false;
    scene.add(this.glowSprite);
  }

  update(sunDirection: THREE.Vector3, sunElevation: number): void {
    // Moon is opposite the sun
    const moonDir = sunDirection.clone().negate();

    // Ensure the moon is above the horizon (only show when sun is below)
    // Moon elevation is roughly -sunElevation
    const moonElevation = -sunElevation;

    // Compute visibility: fade in during twilight, hidden during day
    let opacity = 0;
    if (sunElevation < -0.1) {
      // Full night
      opacity = 1;
    } else if (sunElevation < 0) {
      // Twilight fade-in
      opacity = (-sunElevation) / 0.1;
    } else if (sunElevation < 0.05) {
      // Just past horizon, moon still faintly visible
      opacity = 1.0 - sunElevation / 0.05;
    }

    // If moon would be below horizon, fade it out
    if (moonElevation < 0) {
      opacity *= Math.max(0, 1 + moonElevation * 5); // fade near horizon
    }

    const visible = opacity > 0.01;
    this.moonSprite.visible = visible;
    this.glowSprite.visible = visible;

    if (!visible) return;

    // Position moon on the sky sphere (same distance as stars)
    const distance = 4500;
    // Clamp moon direction so it doesn't go too far below horizon
    const clampedDir = moonDir.clone();
    clampedDir.y = Math.max(clampedDir.y, 0.02);
    clampedDir.normalize();

    const moonPos = clampedDir.multiplyScalar(distance);
    this.moonSprite.position.copy(moonPos);
    this.glowSprite.position.copy(moonPos);

    // Set opacity
    this.moonMaterial.opacity = opacity * 0.9;
    this.glowMaterial.opacity = opacity * 0.2;
  }

  /**
   * Generate a moon disc texture: bright center with smooth edge falloff.
   */
  private generateMoonTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const radius = size * 0.4;

    // Radial gradient for the moon disc
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, 'rgba(255, 252, 245, 1.0)');  // bright warm center
    gradient.addColorStop(0.6, 'rgba(240, 238, 230, 0.95)'); // slightly dimmer
    gradient.addColorStop(0.85, 'rgba(220, 218, 210, 0.6)'); // edge falloff
    gradient.addColorStop(1.0, 'rgba(200, 198, 190, 0.0)');  // transparent edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add subtle surface detail (very faint darker splotches for craters)
    ctx.globalCompositeOperation = 'multiply';
    for (let j = 0; j < 5; j++) {
      const cx = center + (Math.random() - 0.5) * radius * 1.0;
      const cy = center + (Math.random() - 0.5) * radius * 1.0;
      const cr = radius * (0.1 + Math.random() * 0.15);
      const craterGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      craterGrad.addColorStop(0, 'rgba(200, 200, 210, 0.85)');
      craterGrad.addColorStop(1, 'rgba(255, 255, 255, 1.0)');
      ctx.fillStyle = craterGrad;
      ctx.fillRect(0, 0, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generate a soft glow texture for the halo around the moon.
   */
  private generateGlowTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const center = size / 2;
    const radius = size / 2;

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, 'rgba(220, 225, 255, 0.4)');
    gradient.addColorStop(0.3, 'rgba(180, 190, 230, 0.15)');
    gradient.addColorStop(0.6, 'rgba(150, 160, 200, 0.05)');
    gradient.addColorStop(1.0, 'rgba(100, 110, 160, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
}
