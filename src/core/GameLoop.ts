export class GameLoop {
  private lastTime = 0;
  private running = false;
  private updateFn: (dt: number) => void;

  constructor(updateFn: (dt: number) => void) {
    this.updateFn = updateFn;
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);

    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms to prevent spiral
    this.lastTime = now;

    this.updateFn(dt);
  };
}
