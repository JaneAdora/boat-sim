import * as THREE from 'three';

const _v = new THREE.Vector3();
const EDGE_MARGIN = 48; // px from the screen edge when clamped

/**
 * Screen-space objective marker: a gold diamond floating over the target
 * when it's in view, or an arrow pinned to the screen edge pointing toward
 * it when it isn't — with live distance either way. Works without the
 * minimap (which is hidden by default on touch devices).
 */
export class WaypointIndicator {
  private el: HTMLDivElement;
  private arrow: HTMLSpanElement;
  private diamond: HTMLSpanElement;
  private distLabel: HTMLSpanElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'waypoint';
    this.arrow = document.createElement('span');
    this.arrow.className = 'wp-arrow';
    this.arrow.textContent = '▲'; // ▲
    this.diamond = document.createElement('span');
    this.diamond.className = 'wp-diamond';
    this.diamond.textContent = '◆'; // ◆
    this.distLabel = document.createElement('span');
    this.distLabel.className = 'wp-dist';
    this.el.append(this.arrow, this.diamond, this.distLabel);
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  update(
    camera: THREE.Camera,
    target: { x: number; z: number } | null,
    boatX: number,
    boatZ: number,
  ): void {
    if (!target) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'flex';
    this.distLabel.textContent = `${Math.round(Math.hypot(target.x - boatX, target.z - boatZ))}m`;

    const w = window.innerWidth;
    const h = window.innerHeight;
    _v.set(target.x, 4, target.z).project(camera);
    const behind = _v.z > 1;
    let sx = (_v.x * 0.5 + 0.5) * w;
    let sy = (-_v.y * 0.5 + 0.5) * h;
    if (behind) {
      // Projection flips behind the camera — mirror so the arrow points back
      sx = w - sx;
      sy = h - sy;
    }

    const onScreen = !behind &&
      sx > EDGE_MARGIN && sx < w - EDGE_MARGIN &&
      sy > EDGE_MARGIN && sy < h - EDGE_MARGIN;

    if (onScreen) {
      this.arrow.style.display = 'none';
      this.diamond.style.display = '';
      this.el.style.left = `${sx}px`;
      this.el.style.top = `${sy}px`;
      return;
    }

    // Clamp to the screen edge along the ray from center, arrow rotated to point out
    const cx = w / 2;
    const cy = h / 2;
    let dx = sx - cx;
    let dy = sy - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const scale = Math.min(
      (cx - EDGE_MARGIN) / Math.abs(dx || 1e-6),
      (cy - EDGE_MARGIN) / Math.abs(dy || 1e-6),
    );
    this.el.style.left = `${cx + dx * scale}px`;
    this.el.style.top = `${cy + dy * scale}px`;
    this.diamond.style.display = 'none';
    this.arrow.style.display = '';
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // ▲ points up at 0
    this.arrow.style.transform = `rotate(${angle}deg)`;
  }

  dispose(): void {
    this.el.remove();
  }
}
