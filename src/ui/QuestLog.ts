/**
 * The Story Mode objective panel — a compact top-left card showing the active
 * beat's title, objective, and distance to its waypoint. Campaign-only; Free
 * Roam never constructs it. Mirrors the HUD's translucent-dark / gold-accent
 * styling (see #quest-log in index.html).
 */
export class QuestLog {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private objEl: HTMLElement;
  private distEl: HTMLElement;

  constructor() {
    this.root = document.getElementById('quest-log') ?? this.create();
    this.titleEl = this.root.querySelector('.ql-title') as HTMLElement;
    this.objEl = this.root.querySelector('.ql-objective') as HTMLElement;
    this.distEl = this.root.querySelector('.ql-dist') as HTMLElement;
    this.root.style.display = 'none';
  }

  private create(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'quest-log';
    el.innerHTML =
      '<div class="ql-title"></div><div class="ql-objective"></div><div class="ql-dist"></div>';
    document.body.appendChild(el);
    return el;
  }

  /** Show the panel with a beat's title + objective imperative. */
  set(title: string, objective: string): void {
    this.root.style.display = '';
    this.titleEl.textContent = title;
    this.objEl.textContent = objective;
  }

  /** Distance-to-waypoint readout; null clears the line. */
  setDistance(m: number | null): void {
    this.distEl.textContent = m == null ? '' : `${Math.round(m)} m`;
  }

  clear(): void {
    this.root.style.display = 'none';
  }

  /** Campaign finished — a closing line in place of an active objective. */
  complete(): void {
    this.set('The Vanishing Tide', 'Act 1 complete — to be continued.');
    this.setDistance(null);
  }

  dispose(): void {
    this.root.remove();
  }
}
