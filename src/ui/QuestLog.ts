const HIDE_KEY = 'tb-quest-hidden';

/**
 * The Story Mode objective panel — a compact card (top-left, beside the help
 * button) showing the active beat's title, objective, and distance to its
 * waypoint. **Tap it** (or press **J**) to collapse it to a small ◆ chip; tap
 * the chip to bring it back. The choice persists. Campaign-only; Free Roam never
 * constructs it. Styling: see #quest-log in index.html.
 */
export class QuestLog {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private objEl: HTMLElement;
  private distEl: HTMLElement;
  private collapsed: boolean;
  private hasContent = false;
  private keyHandler: (e: KeyboardEvent) => void;
  private tapHandler: (e: Event) => void;

  constructor() {
    this.root = document.getElementById('quest-log') ?? this.create();
    this.titleEl = this.root.querySelector('.ql-title') as HTMLElement;
    this.objEl = this.root.querySelector('.ql-objective') as HTMLElement;
    this.distEl = this.root.querySelector('.ql-dist') as HTMLElement;
    this.collapsed = readHidden();
    this.applyVisibility();

    // Press J (desktop) or tap the panel/chip (mobile has no keyboard) to
    // collapse/expand. The beat toasts still announce each objective either way.
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyJ' && !e.repeat) this.toggle();
    };
    window.addEventListener('keydown', this.keyHandler);
    this.tapHandler = () => this.toggle();
    this.root.addEventListener('click', this.tapHandler);
  }

  private create(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'quest-log';
    el.innerHTML =
      '<div class="ql-chip">◆</div>' +
      '<div class="ql-title"></div><div class="ql-objective"></div>' +
      '<div class="ql-dist"></div><div class="ql-hint">tap or [ J ] to hide</div>';
    document.body.appendChild(el);
    return el;
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    try {
      localStorage.setItem(HIDE_KEY, this.collapsed ? '1' : '0');
    } catch {
      // preference just won't persist
    }
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.root.style.display = this.hasContent ? '' : 'none';
    this.root.classList.toggle('collapsed', this.collapsed);
  }

  /** Show the panel with a beat's title + objective imperative. */
  set(title: string, objective: string): void {
    this.hasContent = true;
    this.titleEl.textContent = title;
    this.objEl.textContent = objective;
    this.applyVisibility();
  }

  /** Distance-to-waypoint readout; null clears the line. */
  setDistance(m: number | null): void {
    this.distEl.textContent = m == null ? '' : `${Math.round(m)} m`;
  }

  clear(): void {
    this.hasContent = false;
    this.applyVisibility();
  }

  /** Campaign finished — a closing line in place of an active objective. */
  complete(): void {
    this.set('The Vanishing Tide', 'Act 1 complete — to be continued.');
    this.setDistance(null);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.root.removeEventListener('click', this.tapHandler);
    this.root.remove();
  }
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
