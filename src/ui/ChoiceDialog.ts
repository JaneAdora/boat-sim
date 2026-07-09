/**
 * A minimal blocking two-choice dialog for Story Mode — used once, at Act 2
 * entry, to normalize a pre-flag Act 1 finish ("Did you spare it, Captain?").
 * Unlike StoryInterlude it cannot be dismissed without choosing; keys are
 * swallowed while it's up so the boat doesn't respond underneath.
 */
export class ChoiceDialog {
  private root: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** Show the dialog; resolves 0 for the first option, 1 for the second. */
  show(title: string, line: string, optionA: string, optionB: string): Promise<0 | 1> {
    this.close(); // never two at once
    this.injectStyles();
    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.id = 'choice-dialog';
      root.innerHTML =
        `<div class="cd-card"><div class="cd-title"></div><div class="cd-line"></div>` +
        `<div class="cd-buttons"><button class="cd-a"></button><button class="cd-b"></button></div></div>`;
      (root.querySelector('.cd-title') as HTMLElement).textContent = title;
      (root.querySelector('.cd-line') as HTMLElement).textContent = line;
      const a = root.querySelector('.cd-a') as HTMLButtonElement;
      const b = root.querySelector('.cd-b') as HTMLButtonElement;
      a.textContent = optionA;
      b.textContent = optionB;
      const pick = (v: 0 | 1) => {
        this.close();
        resolve(v);
      };
      a.addEventListener('click', () => pick(0));
      b.addEventListener('click', () => pick(1));
      this.keyHandler = (e: KeyboardEvent) => e.stopPropagation(); // block the boat
      window.addEventListener('keydown', this.keyHandler, true);
      document.body.appendChild(root);
      this.root = root;
    });
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
    this.close();
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
