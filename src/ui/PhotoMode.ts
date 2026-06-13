export interface PhotoHooks {
  /** Render one frame and return the canvas as a PNG data URL. Must render
   *  and read back in the same synchronous task (no preserveDrawingBuffer). */
  capture: () => string;
  /** Postcard caption: nearest named island or 'Open Ocean'. */
  getPlaceName: () => string;
  getCoords: () => { x: number; z: number };
}

/**
 * Photo mode: P hides the UI and shows a capture bar; capturing composes a
 * postcard — the shot plus a caption strip with the place name and world
 * coordinates. Every player sails the same seed, so the coordinates on a
 * postcard are a real place a friend can sail to.
 */
export class PhotoMode {
  private bar: HTMLDivElement | null = null;
  active = false;

  constructor(private hooks: PhotoHooks) {}

  toggle(): void {
    this.active = !this.active;
    document.body.classList.toggle('photo-mode', this.active);
    if (this.active) {
      this.buildBar();
    } else {
      this.bar?.remove();
      this.bar = null;
    }
  }

  private buildBar(): void {
    this.bar = document.createElement('div');
    this.bar.id = 'photo-bar';

    const capture = document.createElement('button');
    capture.textContent = '📷 Capture postcard';
    capture.addEventListener('click', () => this.capture());

    const exit = document.createElement('button');
    exit.textContent = 'Exit (P)';
    exit.addEventListener('click', () => this.toggle());

    this.bar.append(capture, exit);
    document.body.appendChild(this.bar);
  }

  private capture(): void {
    const dataUrl = this.hooks.capture();
    const place = this.hooks.getPlaceName();
    const { x, z } = this.hooks.getCoords();

    const img = new Image();
    img.onload = () => {
      const strip = Math.max(72, Math.round(img.height * 0.09));
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height + strip;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      // Caption strip — postcard footer in the game's palette
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, img.height, canvas.width, strip);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(0, img.height, canvas.width, 2);

      const pad = Math.round(strip * 0.3);
      ctx.fillStyle = '#ffd479';
      ctx.font = `600 ${Math.round(strip * 0.24)}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('TUGBOAT BLISS', pad, img.height + strip / 2 - strip * 0.14);
      ctx.fillStyle = '#e0e8f0';
      ctx.font = `400 ${Math.round(strip * 0.26)}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`${place}  ·  ${Math.round(x)}, ${Math.round(z)}`, pad, img.height + strip / 2 + strip * 0.2);

      const a = document.createElement('a');
      a.download = `tugboat-postcard-${Math.round(x)}-${Math.round(z)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = dataUrl;
  }

  dispose(): void {
    this.bar?.remove();
    document.body.classList.remove('photo-mode');
  }
}
