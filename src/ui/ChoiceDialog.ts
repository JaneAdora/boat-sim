/**
 * A minimal blocking choice dialog for Story Mode — the act-entry mercy ask
 * and Act 3's "What the Sea Asks". Cannot be dismissed without choosing; keys
 * are swallowed while it's up so the boat doesn't respond underneath.
 *
 * `show` takes 1–3 options and resolves the chosen index. `cancel()` (public,
 * per the Act 3 plan gate) closes the UI and REJECTS the pending promise with
 * 'cancelled' — callers swallow the rejection; combined with the mission's
 * beat-token guard, a cancelled ask can never commit anything.
 */
export class ChoiceDialog {
  private root: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;

  /** Show the dialog; resolves the chosen option index. */
  show(title: string, line: string, options: string[]): Promise<number> {
    this.cancel(); // never two at once
    this.injectStyles();
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      const root = document.createElement('div');
      root.id = 'choice-dialog';
      const card = document.createElement('div');
      card.className = 'cd-card';
      const titleEl = document.createElement('div');
      titleEl.className = 'cd-title';
      titleEl.textContent = title;
      const lineEl = document.createElement('div');
      lineEl.className = 'cd-line';
      lineEl.textContent = line;
      const buttons = document.createElement('div');
      buttons.className = 'cd-buttons';
      options.forEach((label, i) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => {
          this.pendingReject = null;
          this.close();
          resolve(i);
        });
        buttons.appendChild(b);
      });
      card.append(titleEl, lineEl, buttons);
      root.appendChild(card);
      this.keyHandler = (e: KeyboardEvent) => e.stopPropagation(); // block the boat
      window.addEventListener('keydown', this.keyHandler, true);
      document.body.appendChild(root);
      this.root = root;
    });
  }

  /** Close a pending ask (beat change, reload, dispose). The promise rejects;
   *  nothing is committed. Safe to call when nothing is pending. */
  cancel(): void {
    const reject = this.pendingReject;
    this.pendingReject = null;
    this.close();
    if (reject) reject(new Error('cancelled'));
  }

  private close(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    this.root?.remove();
    this.root = null;
  }

  dispose(): void {
    this.cancel();
  }

  private injectStyles(): void {
    if (document.getElementById('choice-dialog-css')) return;
    const s = document.createElement('style');
    s.id = 'choice-dialog-css';
    s.textContent = `
#choice-dialog{position:fixed;inset:0;z-index:420;display:flex;align-items:center;
  justify-content:center;background:rgba(4,9,13,.88);}
#choice-dialog .cd-card{max-width:34rem;margin:20px;padding:34px 38px;text-align:center;
  background:#0c161d;border:1px solid rgba(198,210,209,.22);box-shadow:0 30px 80px rgba(0,0,0,.7);}
#choice-dialog .cd-title{font-family:'Playfair Display',Georgia,serif;font-weight:700;
  font-size:24px;color:#f1efe6;}
#choice-dialog .cd-line{margin-top:12px;font-family:Georgia,serif;font-style:italic;
  font-size:15px;line-height:1.55;color:#aebbb9;}
#choice-dialog .cd-buttons{margin-top:24px;display:flex;gap:14px;justify-content:center;
  flex-wrap:wrap;}
#choice-dialog button{font-family:Georgia,serif;font-size:15px;padding:10px 22px;cursor:pointer;
  color:#eceae1;background:#16242e;border:1px solid rgba(198,210,209,.3);border-radius:4px;}
#choice-dialog button:hover{background:#1e3140;border-color:rgba(198,210,209,.55);}`;
    document.head.appendChild(s);
  }
}
