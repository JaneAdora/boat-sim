import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { BoatControl } from '../components/BoatControl';
import { WindSystem } from '../systems/WindSystem';
import { InputManager } from '../core/InputManager';
import { KillTracker } from '../state/KillTracker';
import { GameConfig } from '../state/GameConfig';

// Reused each frame to avoid allocating a Vector3 in the HUD update loop.
const _fwd = new THREE.Vector3();

export class HUD {
  private killDisplay: HTMLElement | null;
  private speedValue: HTMLElement | null;
  private windArrow: SVGElement | null;
  private sailValue: HTMLElement | null;
  private hudContainer: HTMLElement | null;
  private controlsHelp: HTMLElement | null;
  private hudToggle: HTMLElement | null = null;
  private helpToggle: HTMLElement | null = null;
  private onHudToggle?: () => void;
  private onHelpToggle?: () => void;
  private killTracker: KillTracker;
  private visible = true;
  private controlsVisible = false;
  private controlsTimer = 0;
  private lastKillTotal = 0;

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
    this.hudToggle = document.getElementById('hud-toggle');
    if (this.hudToggle) {
      const toggle = this.hudToggle;
      toggle.textContent = '\u25C9'; // eye-like icon
      this.onHudToggle = () => {
        this.visible = !this.visible;
        if (this.hudContainer) {
          this.hudContainer.style.display = this.visible ? 'flex' : 'none';
        }
        toggle.textContent = this.visible ? '\u25C9' : '\u25CE';
      };
      toggle.addEventListener('click', this.onHudToggle);
    }

    // Always-visible help (?) button \u2014 toggles the controls card (desktop + mobile)
    this.helpToggle = document.getElementById('help-toggle');
    if (this.helpToggle) {
      this.onHelpToggle = () => this.toggleControls();
      this.helpToggle.addEventListener('click', this.onHelpToggle);
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

    // Kill count — flash a flourish when it goes up
    if (this.killDisplay) {
      const total = this.killTracker.total;
      if (total > this.lastKillTotal) this.flashKill(total - this.lastKillTotal);
      this.lastKillTotal = total;
      this.killDisplay.textContent = `${total}`;
    }

    // Speed in knots (1 m/s ~ 1.94 knots)
    if (this.speedValue) {
      const speed = Math.abs(rb.velocity.dot(_fwd.set(0, 0, 1).applyQuaternion(transform.quaternion))) * 1.94;
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

  /** Top-center toast announcing a newly discovered island. */
  showDiscovery(name: string): void {
    this.showToast('Discovered', name);
  }

  /** Generic top-center toast: small uppercase label over a sans headline. */
  showToast(label: string, headline: string): void {
    const toast = document.createElement('div');
    toast.className = 'discovery-toast';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'discovery-label';
    labelSpan.textContent = label;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'discovery-name';
    nameSpan.textContent = headline;
    toast.append(labelSpan, nameSpan);
    document.body.appendChild(toast);
    // Timer removal (not animationend) so the toast still shows and clears
    // under prefers-reduced-motion, where the fade animation is disabled.
    setTimeout(() => toast.remove(), 4500);
  }

  /** Hull integrity pips on the HUD bar (classic mode). */
  setHull(hp: number, max: number): void {
    let pips = document.getElementById('hull-pips');
    if (!pips) {
      pips = document.createElement('div');
      pips.id = 'hull-pips';
      const label = document.createElement('span');
      label.className = 'hud-label';
      label.textContent = 'Hull';
      pips.appendChild(label);
      const dots = document.createElement('span');
      dots.id = 'hull-dots';
      pips.appendChild(dots);
      this.hudContainer?.appendChild(pips);
    }
    const dots = document.getElementById('hull-dots');
    if (dots) {
      dots.textContent = '';
      for (let i = 0; i < max; i++) {
        const dot = document.createElement('span');
        dot.className = i < hp ? 'hull-pip' : 'hull-pip lost';
        dot.textContent = '●';
        dots.appendChild(dot);
      }
    }
  }

  /** Brief red vignette when the player takes a hit. */
  flashDamage(): void {
    let flash = document.getElementById('damage-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'damage-flash';
      document.body.appendChild(flash);
    }
    flash.classList.remove('active');
    void flash.offsetWidth; // restart the animation on rapid hits
    flash.classList.add('active');
  }

  /** Live race timer, top-center; null hides it. */
  setRaceTimer(text: string | null): void {
    let timer = document.getElementById('race-timer');
    if (!text) {
      timer?.remove();
      return;
    }
    if (!timer) {
      timer = document.createElement('div');
      timer.id = 'race-timer';
      document.body.appendChild(timer);
    }
    timer.textContent = text;
  }

  /** Persistent contract banner (stacked top-left); null clears it. */
  setContract(text: string | null): void {
    this.setMissionBanner('contract-banner', text);
  }

  /** Distress-call banner, stacked alongside the contract banner. */
  setDistress(text: string | null): void {
    this.setMissionBanner('distress-banner', text);
  }

  /** Boarding prompt — shown while alongside a commandeerable vessel. */
  setBoardHint(text: string | null): void {
    this.setMissionBanner('board-hint', text);
  }

  /** Hot-cargo banner for heists. */
  setHeist(text: string | null): void {
    this.setMissionBanner('heist-banner', text);
  }

  /** Leviathan encounter banner. */
  setLeviathan(text: string | null): void {
    this.setMissionBanner('leviathan-banner', text);
  }

  /** Fishing prompt banner (cast / bite / reel feedback). */
  setFishing(text: string | null): void {
    this.setMissionBanner('fishing-banner', text);
  }

  /** The catch (progress) and tension (line) bars during a fish fight. */
  setFishingMeter(state: { catch: number; tension: number } | null): void {
    let el = document.getElementById('fishing-meter');
    if (!state) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'fishing-meter';
      el.append(
        fishingBarRow('Catch', 'fm-catch'),
        fishingBarRow('Line', 'fm-tension'),
      );
      document.body.appendChild(el);
    }
    const c = el.querySelector('.fm-catch') as HTMLElement | null;
    const t = el.querySelector('.fm-tension') as HTMLElement | null;
    if (c) c.style.width = `${Math.round(Math.min(1, state.catch) * 100)}%`;
    if (t) {
      t.style.width = `${Math.round(Math.min(1, state.tension) * 100)}%`;
      t.classList.toggle('fm-danger', state.tension > 0.75);
    }
  }

  /** Naval heat stars (piracy response level 0–3). */
  setHeat(stars: number): void {
    let el = document.getElementById('heat-stars');
    if (stars <= 0) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'heat-stars';
      const label = document.createElement('span');
      label.className = 'hud-label';
      label.textContent = 'Heat';
      el.appendChild(label);
      const marks = document.createElement('span');
      marks.id = 'heat-marks';
      el.appendChild(marks);
      this.hudContainer?.appendChild(el);
    }
    const marks = document.getElementById('heat-marks');
    if (marks) marks.textContent = '☠'.repeat(Math.min(3, stars));
  }

  private setMissionBanner(id: string, text: string | null): void {
    let container = document.getElementById('mission-banners');
    const existing = document.getElementById(id);
    if (!text) {
      existing?.remove();
      if (container && container.childElementCount === 0) container.remove();
      return;
    }
    if (!container) {
      container = document.createElement('div');
      container.id = 'mission-banners';
      document.body.appendChild(container);
    }
    let banner = existing;
    if (!banner) {
      banner = document.createElement('div');
      banner.id = id;
      banner.className = 'mission-banner';
      container.appendChild(banner);
    }
    banner.textContent = text;
  }

  /** Pulse the kill counter and float a "+N" when a kill registers. */
  private flashKill(delta: number): void {
    const el = this.killDisplay;
    if (!el) return;

    el.classList.remove('kill-bump');
    void el.offsetWidth; // force reflow so rapid kills restart the animation
    el.classList.add('kill-bump');
    el.addEventListener('animationend', () => el.classList.remove('kill-bump'), { once: true });

    const rect = el.getBoundingClientRect();
    const float = document.createElement('div');
    float.className = 'kill-float';
    float.textContent = `+${delta}`;
    float.style.left = `${rect.left + rect.width / 2}px`;
    float.style.top = `${rect.top}px`;
    document.body.appendChild(float);
    float.addEventListener('animationend', () => float.remove(), { once: true });
  }

  dispose(): void {
    if (this.hudToggle && this.onHudToggle) this.hudToggle.removeEventListener('click', this.onHudToggle);
    if (this.helpToggle && this.onHelpToggle) this.helpToggle.removeEventListener('click', this.onHelpToggle);
    document.getElementById('mission-banners')?.remove();
    document.getElementById('hull-pips')?.remove();
    document.getElementById('heat-stars')?.remove();
    document.getElementById('damage-flash')?.remove();
    document.getElementById('race-timer')?.remove();
    document.getElementById('fishing-meter')?.remove();
  }
}

/** One labelled bar (track + fill) for the fishing meter. */
function fishingBarRow(label: string, fillClass: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'fm-row';
  const lbl = document.createElement('span');
  lbl.className = 'fm-label';
  lbl.textContent = label;
  const track = document.createElement('div');
  track.className = 'fm-track';
  const fill = document.createElement('div');
  fill.className = `fm-fill ${fillClass}`;
  track.appendChild(fill);
  row.append(lbl, track);
  return row;
}
