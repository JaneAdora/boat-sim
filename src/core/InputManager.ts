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

  // Handlers stored as fields so dispose() can remove them (prevents one
  // leaked InputManager — and the whole Engine graph it closes over — per replay).
  private onKeyDown = (e: KeyboardEvent): void => {
    this.pressed.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };
  private onBlur = (): void => {
    this.pressed.clear();
    this.dragging = false;
  };
  // Any button starts a camera-orbit drag, but only on the canvas/body (not UI).
  private onMouseDown = (e: MouseEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'CANVAS' || tag === 'BODY') {
      this.dragging = true;
      e.preventDefault();
    }
  };
  private onMouseUp = (): void => {
    this.dragging = false;
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (this.dragging) {
      this.mouseDragX += e.movementX;
      this.mouseDragY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent): void => {
    // Normalize deltaY — different browsers use different scales
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.mouseScrollDelta += delta;
  };
  private onContextMenu = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).tagName === 'CANVAS') {
      e.preventDefault();
    }
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onContextMenu);
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
