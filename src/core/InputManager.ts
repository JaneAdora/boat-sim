export interface MouseDeltas {
  dragX: number;
  dragY: number;
  scrollDelta: number;
}

export class InputManager {
  private pressed = new Set<string>();

  // Mouse drag state
  private dragging = false;
  private mouseDragX = 0;
  private mouseDragY = 0;
  private mouseScrollDelta = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.pressed.clear();
      this.dragging = false;
    });

    // Mouse drag tracking — any button works for camera orbit
    // (left, right, or middle click all start a drag)
    window.addEventListener('mousedown', (e) => {
      // Only start drag on the canvas, not on UI elements
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'CANVAS' || tag === 'BODY') {
        this.dragging = true;
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        this.mouseDragX += e.movementX;
        this.mouseDragY += e.movementY;
      }
    });

    // Scroll wheel for zoom
    window.addEventListener('wheel', (e) => {
      // Normalize deltaY — different browsers use different scales
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.mouseScrollDelta += delta;
    }, { passive: true });

    // Prevent right-click context menu on canvas
    window.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        e.preventDefault();
      }
    });
  }

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Returns accumulated mouse deltas and resets them to zero. */
  consumeMouseDeltas(): MouseDeltas {
    const deltas: MouseDeltas = {
      dragX: this.mouseDragX,
      dragY: this.mouseDragY,
      scrollDelta: this.mouseScrollDelta,
    };
    this.mouseDragX = 0;
    this.mouseDragY = 0;
    this.mouseScrollDelta = 0;
    return deltas;
  }
}
