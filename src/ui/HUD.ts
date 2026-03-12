import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { BoatControl } from '../components/BoatControl';
import { WindSystem } from '../systems/WindSystem';
import { InputManager } from '../core/InputManager';
import { KillTracker } from '../state/KillTracker';
import { GameConfig } from '../state/GameConfig';

export class HUD {
  private killDisplay: HTMLElement | null;
  private speedValue: HTMLElement | null;
  private windArrow: SVGElement | null;
  private sailValue: HTMLElement | null;
  private hudContainer: HTMLElement | null;
  private controlsHelp: HTMLElement | null;
  private killTracker: KillTracker;
  private visible = true;
  private controlsVisible = false;
  private controlsTimer = 0;

  constructor(private input: InputManager, killTracker: KillTracker, config: GameConfig = { mode: 'classic' }) {
    this.killTracker = killTracker;
    this.killDisplay = document.getElementById('kill-count');
    this.speedValue = document.getElementById('speed-value');
    this.windArrow = document.getElementById('wind-arrow') as unknown as SVGElement;
    this.sailValue = document.getElementById('sail-value');
    this.hudContainer = document.getElementById('hud');
    this.controlsHelp = document.getElementById('controls-help');

    // Patch kill label based on game mode
    const killLabel = this.killDisplay?.previousElementSibling;
    if (killLabel) {
      killLabel.textContent = config.mode === 'magical' ? '\u{1F984}' : 'Kills';
    }

    // Mobile HUD toggle button
    const toggle = document.getElementById('hud-toggle');
    if (toggle) {
      toggle.textContent = '\u25C9'; // eye-like icon
      toggle.addEventListener('click', () => {
        this.visible = !this.visible;
        if (this.hudContainer) {
          this.hudContainer.style.display = this.visible ? 'flex' : 'none';
        }
        toggle.textContent = this.visible ? '\u25C9' : '\u25CE';
      });
    }

    // Show controls briefly at start
    this.showControls(5);
  }

  showControls(duration: number): void {
    this.controlsVisible = true;
    this.controlsTimer = duration;
    this.controlsHelp?.classList.add('visible');
  }

  toggleControls(): void {
    if (this.controlsVisible) {
      this.controlsHelp?.classList.remove('visible');
      this.controlsVisible = false;
      this.controlsTimer = 0;
    } else {
      this.showControls(5);
    }
  }

  update(world: World, boatEntity: EntityId, windSystem: WindSystem, dt: number): void {
    // Toggle HUD with H
    if (this.input.isPressed('KeyH')) {
      if (!this.visible) {
        this.visible = true;
        if (this.hudContainer) this.hudContainer.style.display = 'flex';
      }
    }

    // Controls help timer
    if (this.controlsTimer > 0) {
      this.controlsTimer -= dt;
      if (this.controlsTimer <= 0) {
        this.controlsHelp?.classList.remove('visible');
        this.controlsVisible = false;
      }
    }

    const transform = world.getComponent<Transform>(boatEntity, 'Transform');
    const rb = world.getComponent<RigidBody>(boatEntity, 'RigidBody');
    const ctrl = world.getComponent<BoatControl>(boatEntity, 'BoatControl');

    if (!transform || !rb) return;

    // Kill count
    if (this.killDisplay) {
      this.killDisplay.textContent = `${this.killTracker.total}`;
    }

    // Speed in knots (1 m/s ~ 1.94 knots)
    if (this.speedValue) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(transform.quaternion);
      const speed = Math.abs(rb.velocity.dot(forward)) * 1.94;
      this.speedValue.textContent = speed.toFixed(1);
    }

    // Wind direction relative to boat
    if (this.windArrow) {
      const windVec = windSystem.getWindVector();
      const windAngle = Math.atan2(windVec.x, windVec.y);
      const boatAngle = transform.rotation.y;
      const relAngle = THREE.MathUtils.radToDeg(windAngle - boatAngle);
      this.windArrow.setAttribute('transform', `rotate(${relAngle}, 12, 12)`);
    }

    // Throttle / Sail
    if (this.sailValue && ctrl) {
      if (ctrl.enginePower > 0) {
        const pct = Math.round(ctrl.throttle * 100);
        this.sailValue.textContent = pct >= 0 ? `${pct}%` : `R ${-pct}%`;
      } else {
        this.sailValue.textContent = `${Math.round(ctrl.sailTrim * 100)}%`;
      }
    }
  }
}
