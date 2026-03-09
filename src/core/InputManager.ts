export class InputManager {
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.pressed.clear();
    });
  }

  isPressed(code: string): boolean {
    return this.pressed.has(code);
  }
}
