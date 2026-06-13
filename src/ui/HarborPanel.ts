export interface HarborPanelData {
  /** Island name shown as the heading. */
  title: string;
  /** Harbour-master's spoken greeting. */
  greeting: string;
  /** Catch-log summary, e.g. "4 / 10 species". */
  catchText: string;
  /** Deterministic tavern rumour. */
  rumor: string;
  /** Whether the Angler's Rod is already owned. */
  rodOwned: boolean;
  /** Current credit balance. */
  credits: number;
  /** Rod price. */
  rodCost: number;
}

export interface HarborPanelHandlers {
  onBuy: () => void;
  onClose: () => void;
}

/**
 * The dockside notice board — a small DOM card the player opens at a harbour.
 * No pointer lock is in play, so its buttons take clicks directly. The system
 * drives it: open() (re)renders from a data snapshot, close() tears it down.
 */
export class HarborPanel {
  private el: HTMLElement | null = null;

  isOpen(): boolean {
    return this.el !== null;
  }

  open(data: HarborPanelData, handlers: HarborPanelHandlers): void {
    this.close();
    const panel = document.createElement('div');
    panel.id = 'harbor-panel';

    panel.appendChild(div('hp-title', data.title));
    panel.appendChild(div('hp-sub', 'Harbour'));
    panel.appendChild(div('hp-greeting', data.greeting));

    panel.appendChild(row('Catch log', span('hp-val', data.catchText)));

    let rodControl: HTMLElement;
    if (data.rodOwned) {
      rodControl = span('hp-owned', "✓ In your kit");
    } else {
      const buy = document.createElement('button');
      buy.className = 'hp-buy';
      buy.textContent = `Buy · ${data.rodCost} cr`;
      const affordable = data.credits >= data.rodCost;
      buy.disabled = !affordable;
      if (!affordable) buy.title = `Need ${data.rodCost} cr — you have ${data.credits}`;
      buy.addEventListener('click', handlers.onBuy);
      rodControl = buy;
    }
    panel.appendChild(row("Angler's Rod", rodControl));

    if (!data.rodOwned) {
      panel.appendChild(div('hp-bal', `Balance: ${data.credits} cr`));
    }

    const rumor = document.createElement('div');
    rumor.className = 'hp-rumor';
    const tag = document.createElement('b');
    tag.textContent = 'Tavern talk. ';
    rumor.append('🍺 ', tag, data.rumor);
    panel.appendChild(rumor);

    const leave = document.createElement('button');
    leave.className = 'hp-leave';
    leave.textContent = 'Leave the harbour (L)';
    leave.addEventListener('click', handlers.onClose);
    panel.appendChild(leave);

    document.body.appendChild(panel);
    this.el = panel;
  }

  close(): void {
    this.el?.remove();
    this.el = null;
  }

  dispose(): void {
    this.close();
  }
}

function div(cls: string, text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

function span(cls: string, text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const r = document.createElement('div');
  r.className = 'hp-row';
  r.appendChild(span('hp-key', label));
  r.appendChild(control);
  return r;
}
