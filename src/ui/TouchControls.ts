import { clamp } from '../utils/math';

/**
 * Mobile touch controls: tiller (bottom-left) + throttle (bottom-right).
 * Camera gestures (two-finger drag/pinch) tracked on the canvas.
 * Only instantiated when touch is detected.
 */
export class TouchControls {
  // Public state consumed by BoatControlSystem / CameraSystem
  rudder = 0;
  throttle = 0;
  cameraOrbitDelta = 0;
  cameraZoomDelta = 0;

  private container: HTMLElement;
  private tillerTrack: HTMLElement;
  private tillerKnob: HTMLElement;
  private throttleTrack: HTMLElement;
  private throttleKnob: HTMLElement;
  private rendererCanvas: HTMLCanvasElement | null = null;

  // Active touch IDs
  private tillerTouchId: number | null = null;
  private throttleTouchId: number | null = null;
  private cameraTouches: Map<number, { x: number; y: number }> = new Map();

  // Track bounds (set on first touch)
  private tillerRect: DOMRect | null = null;
  private throttleRect: DOMRect | null = null;

  constructor(rendererCanvas?: HTMLCanvasElement) {
    if (rendererCanvas) this.rendererCanvas = rendererCanvas;
    this.container = document.createElement('div');
    this.container.id = 'touch-controls';
    this.container.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 50;
      display: flex; justify-content: space-between; align-items: flex-end;
      padding: 20px 20px 30px;
    `;

    // --- Tiller (bottom-left): horizontal slider ---
    const tillerWrap = document.createElement('div');
    tillerWrap.style.cssText = `pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 6px;`;

    const tillerLabel = document.createElement('div');
    tillerLabel.textContent = 'TILLER';
    tillerLabel.style.cssText = `
      color: rgba(255,255,255,0.5); font-size: 10px; font-family: monospace;
      letter-spacing: 2px; text-transform: uppercase;
    `;

    this.tillerTrack = document.createElement('div');
    this.tillerTrack.style.cssText = `
      width: 200px; height: 44px; border-radius: 22px;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      position: relative; touch-action: none;
    `;

    // Center tick mark
    const tillerTick = document.createElement('div');
    tillerTick.style.cssText = `
      position: absolute; left: 50%; top: 8px; bottom: 8px; width: 1px;
      background: rgba(255,255,255,0.2); transform: translateX(-0.5px);
    `;
    this.tillerTrack.appendChild(tillerTick);

    this.tillerKnob = document.createElement('div');
    this.tillerKnob.style.cssText = `
      position: absolute; top: 4px; width: 36px; height: 36px; border-radius: 18px;
      background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.4);
      left: 50%; transform: translateX(-50%);
      transition: left 0.2s ease-out, background 0.15s;
    `;
    this.tillerTrack.appendChild(this.tillerKnob);

    tillerWrap.appendChild(tillerLabel);
    tillerWrap.appendChild(this.tillerTrack);

    // --- Throttle (bottom-right): vertical slider ---
    const throttleWrap = document.createElement('div');
    throttleWrap.style.cssText = `pointer-events: auto; display: flex; align-items: center; gap: 6px;`;

    const throttleLabel = document.createElement('div');
    throttleLabel.textContent = 'THROTTLE';
    throttleLabel.style.cssText = `
      color: rgba(255,255,255,0.5); font-size: 10px; font-family: monospace;
      letter-spacing: 2px; writing-mode: vertical-rl; text-orientation: mixed;
    `;

    this.throttleTrack = document.createElement('div');
    this.throttleTrack.style.cssText = `
      width: 44px; height: 180px; border-radius: 22px;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      position: relative; touch-action: none;
    `;

    // Center tick mark (neutral)
    const throttleTick = document.createElement('div');
    throttleTick.style.cssText = `
      position: absolute; top: 50%; left: 8px; right: 8px; height: 1px;
      background: rgba(255,255,255,0.2); transform: translateY(-0.5px);
    `;
    this.throttleTrack.appendChild(throttleTick);

    this.throttleKnob = document.createElement('div');
    this.throttleKnob.style.cssText = `
      position: absolute; left: 4px; width: 36px; height: 36px; border-radius: 18px;
      background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.4);
      top: 50%; transform: translateY(-50%);
      transition: background 0.15s;
    `;
    this.throttleTrack.appendChild(this.throttleKnob);

    throttleWrap.appendChild(throttleLabel);
    throttleWrap.appendChild(this.throttleTrack);

    this.container.appendChild(tillerWrap);
    this.container.appendChild(throttleWrap);
    document.body.appendChild(this.container);

    // --- Touch event listeners ---
    this.tillerTrack.addEventListener('touchstart', this.onTillerStart, { passive: false });
    this.tillerTrack.addEventListener('touchmove', this.onTillerMove, { passive: false });
    this.tillerTrack.addEventListener('touchend', this.onTillerEnd);
    this.tillerTrack.addEventListener('touchcancel', this.onTillerEnd);

    this.throttleTrack.addEventListener('touchstart', this.onThrottleStart, { passive: false });
    this.throttleTrack.addEventListener('touchmove', this.onThrottleMove, { passive: false });
    this.throttleTrack.addEventListener('touchend', this.onThrottleEnd);
    this.throttleTrack.addEventListener('touchcancel', this.onThrottleEnd);

    // Camera gestures on the renderer canvas
    const canvas = this.rendererCanvas;
    if (canvas) {
      canvas.addEventListener('touchstart', this.onCanvasTouchStart, { passive: false });
      canvas.addEventListener('touchmove', this.onCanvasTouchMove, { passive: false });
      canvas.addEventListener('touchend', this.onCanvasTouchEnd);
      canvas.addEventListener('touchcancel', this.onCanvasTouchEnd);
    }
  }

  // ──── Tiller handlers ────

  private onTillerStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.tillerTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.tillerTouchId = touch.identifier;
    this.tillerRect = this.tillerTrack.getBoundingClientRect();
    this.tillerKnob.style.transition = 'background 0.15s';
    this.tillerKnob.style.background = 'rgba(255,255,255,0.45)';
    this.updateTillerPosition(touch.clientX);
  };

  private onTillerMove = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.tillerTouchId) {
        this.updateTillerPosition(touch.clientX);
      }
    }
  };

  private onTillerEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.tillerTouchId) {
        this.tillerTouchId = null;
        this.rudder = 0;
        this.tillerKnob.style.transition = 'left 0.2s ease-out, background 0.15s';
        this.tillerKnob.style.left = '50%';
        this.tillerKnob.style.background = 'rgba(255,255,255,0.25)';
      }
    }
  };

  private updateTillerPosition(clientX: number): void {
    if (!this.tillerRect) return;
    const knobRadius = 18;
    const minX = this.tillerRect.left + knobRadius;
    const maxX = this.tillerRect.right - knobRadius;
    const center = (minX + maxX) / 2;
    const halfRange = (maxX - minX) / 2;
    const offset = clamp(clientX - center, -halfRange, halfRange);
    const value = offset / halfRange;

    // Dead zone
    this.rudder = Math.abs(value) < 0.05 ? 0 : value;

    const pct = ((offset / halfRange) * 0.5 + 0.5) * 100;
    this.tillerKnob.style.transition = 'background 0.15s';
    this.tillerKnob.style.left = `${pct}%`;
  }

  // ──── Throttle handlers ────

  private onThrottleStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.throttleTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.throttleTouchId = touch.identifier;
    this.throttleRect = this.throttleTrack.getBoundingClientRect();
    this.throttleKnob.style.background = 'rgba(255,255,255,0.45)';
    this.updateThrottlePosition(touch.clientY);
  };

  private onThrottleMove = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.throttleTouchId) {
        this.updateThrottlePosition(touch.clientY);
      }
    }
  };

  private onThrottleEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.throttleTouchId) {
        this.throttleTouchId = null;
        this.throttleKnob.style.background = 'rgba(255,255,255,0.25)';
        // Snap to zero if close
        if (Math.abs(this.throttle) < 0.08) {
          this.throttle = 0;
          this.throttleKnob.style.top = '50%';
        }
        // Otherwise stays where released
      }
    }
  };

  private updateThrottlePosition(clientY: number): void {
    if (!this.throttleRect) return;
    const knobRadius = 18;
    const minY = this.throttleRect.top + knobRadius;
    const maxY = this.throttleRect.bottom - knobRadius;
    const center = (minY + maxY) / 2;
    const halfRange = (maxY - minY) / 2;
    const offset = clamp(clientY - center, -halfRange, halfRange);
    // Invert: top = positive throttle
    const value = -offset / halfRange;

    this.throttle = Math.abs(value) < 0.08 ? 0 : value;

    const pct = ((offset / halfRange) * 0.5 + 0.5) * 100;
    this.throttleKnob.style.top = `${pct}%`;
  }

  // ──── Camera gesture handlers (canvas) ────
  // Single finger: orbit camera. Two fingers: pinch to zoom.

  private onCanvasTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      this.cameraTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  };

  private onCanvasTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    if (this.cameraTouches.size === 1) {
      // Single finger: orbit
      const t = e.changedTouches[0];
      const prev = this.cameraTouches.get(t.identifier);
      if (prev) {
        this.cameraOrbitDelta += (t.clientX - prev.x) * 0.005;
        this.cameraTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    } else if (this.cameraTouches.size >= 2) {
      // Two fingers: pinch to zoom + orbit from midpoint
      const ids = Array.from(this.cameraTouches.keys()).slice(0, 2);
      const prev0 = this.cameraTouches.get(ids[0])!;
      const prev1 = this.cameraTouches.get(ids[1])!;
      const prevMidX = (prev0.x + prev1.x) / 2;
      const prevDist = Math.hypot(prev1.x - prev0.x, prev1.y - prev0.y);

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.cameraTouches.has(t.identifier)) {
          this.cameraTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }

      const cur0 = this.cameraTouches.get(ids[0])!;
      const cur1 = this.cameraTouches.get(ids[1])!;
      const curMidX = (cur0.x + cur1.x) / 2;
      const curDist = Math.hypot(cur1.x - cur0.x, cur1.y - cur0.y);

      this.cameraOrbitDelta += (curMidX - prevMidX) * 0.005;
      this.cameraZoomDelta += (prevDist - curDist) * 0.05;
    }
  };

  private onCanvasTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.cameraTouches.delete(e.changedTouches[i].identifier);
    }
  };

  /** Call once per frame after CameraSystem reads the deltas */
  consumeCameraDeltas(): void {
    this.cameraOrbitDelta = 0;
    this.cameraZoomDelta = 0;
  }
}
