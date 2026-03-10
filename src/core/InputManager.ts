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

    // Mouse drag tracking (right-click or middle-click)
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.button === 1) {
        this.dragging = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 || e.button === 1) {
        this.dragging = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        this.mouseDragX += e.movementX;
        this.mouseDragY += e.movementY;
      }
    });

    // Scroll wheel for zoom
    window.addEventListener('wheel', (e) => {
      this.mouseScrollDelta += e.deltaY;
    }, { passive: true });

    // Prevent right-click context menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
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
