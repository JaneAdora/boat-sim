/**
 * Story Mode interlude cards — full-screen, letterboxed illustrated plates that
 * interrupt gameplay at beat boundaries so the campaign reads as an authored
 * story, not open-world drift. Each card shows one painted plate (served from
 * /story/panel-NN.jpg), the beat title, and a single caption line; tap anywhere
 * or press any key to continue. Cards queue if two fire back-to-back (e.g. the
 * opening pair). Campaign-only; Free Roam never constructs this.
 *
 * The overlay swallows keydowns (capture phase) while visible so the boat
 * doesn't respond to the dismiss keystroke; a short grace delay stops a held
 * throttle key from skipping the card instantly.
 */
const GRACE_MS = 450;

export interface InterludeCard {
  image: string; // e.g. '/story/panel-03.jpg'
  title: string;
  line: string;
}

export class StoryInterlude {
  private root: HTMLElement;
  private imgEl: HTMLImageElement;
  private titleEl: HTMLElement;
  private lineEl: HTMLElement;
  private queue: InterludeCard[] = [];
  private visible = false;
  private shownAt = 0;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.id = 'story-interlude';
    this.root.innerHTML =
      '<div class="si-frame"><img class="si-img" alt=""></div>' +
      '<div class="si-copy"><div class="si-title"></div><div class="si-line"></div>' +
      '<div class="si-hint">tap or press any key</div></div>';
    document.body.appendChild(this.root);
    this.imgEl = this.root.querySelector('.si-img') as HTMLImageElement;
    this.titleEl = this.root.querySelector('.si-title') as HTMLElement;
    this.lineEl = this.root.querySelector('.si-line') as HTMLElement;

    this.root.addEventListener('click', () => this.dismiss());
    // Capture phase: runs before (and suppresses) the InputSystem / ESC-menu
    // window listeners while a card is up.
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.visible) return;
      e.stopPropagation();
      if (!e.repeat) this.dismiss();
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  /** Queue a card; shows immediately if nothing is up. */
  show(card: InterludeCard): void {
    this.queue.push(card);
    if (!this.visible) this.next();
  }

  /** Warm the browser cache so the plate is ready before its moment. */
  preload(image: string): void {
    const img = new Image();
    img.src = image;
  }

  private next(): void {
    const card = this.queue.shift();
    if (!card) return;
    this.imgEl.src = card.image;
    this.titleEl.textContent = card.title;
    this.lineEl.textContent = card.line;
    this.visible = true;
    this.shownAt = performance.now();
    this.root.classList.add('visible');
  }

  private dismiss(): void {
    if (!this.visible || performance.now() - this.shownAt < GRACE_MS) return;
    this.visible = false;
    this.root.classList.remove('visible');
    // Let the fade-out finish before swapping in a queued card.
    if (this.queue.length) setTimeout(() => this.next(), 420);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler, true);
    this.root.remove();
  }

  private injectStyles(): void {
    if (document.getElementById('story-interlude-css')) return;
    const s = document.createElement('style');
    s.id = 'story-interlude-css';
    s.textContent = `
#story-interlude{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:22px;padding:5vh 20px;
  background:rgba(4,9,13,.88);opacity:0;pointer-events:none;
  transition:opacity .4s ease;cursor:pointer;}
#story-interlude.visible{opacity:1;pointer-events:auto;}
#story-interlude .si-frame{max-height:62vh;max-width:min(92vw,62vh);
  border:1px solid rgba(198,210,209,.22);box-shadow:0 30px 80px rgba(0,0,0,.7);
  transform:scale(1.02);transition:transform 6s ease;}
#story-interlude.visible .si-frame{transform:scale(1);}
#story-interlude .si-img{display:block;width:100%;height:100%;object-fit:contain;}
#story-interlude .si-copy{text-align:center;max-width:60ch;}
#story-interlude .si-title{font-family:'Playfair Display',Georgia,serif;font-weight:700;
  font-size:clamp(20px,3.4vw,30px);color:#f1efe6;letter-spacing:.5px;}
#story-interlude .si-line{margin-top:10px;font-family:Georgia,serif;font-style:italic;
  font-size:clamp(14px,2.2vw,17px);line-height:1.5;color:#aebbb9;}
#story-interlude .si-hint{margin-top:16px;font-family:monospace;font-size:10px;
  letter-spacing:.28em;text-transform:uppercase;color:#56656a;}
@media (prefers-reduced-motion:reduce){
  #story-interlude,#story-interlude .si-frame{transition:none;}
}`;
    document.head.appendChild(s);
  }
}
