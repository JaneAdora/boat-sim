import { Engine } from './Engine';
import { BoatDefinition } from './boats/BoatDefinition';
import { TUGBOAT } from './boats/Tugboat';
import { CRUISE_SHIP } from './boats/CruiseShip';
import { SPEEDBOAT } from './boats/Speedboat';
import { VIKING_SHIP } from './boats/VikingShip';
import { JETSKI } from './boats/JetSki';
import { GameMode } from './state/GameConfig';
import { loadStats, recordVoyageStart } from './state/VoyageLog';
import { discoveredCount } from './state/DiscoveryTracker';
import { journalCount, JOURNAL_TOTAL } from './state/JournalTracker';
import { getCredits } from './state/Wallet';
import { applyBoatUpgrades, buyUpgrade, hasUpgrade, upgradeCost, UPGRADE_CATALOG } from './state/Upgrades';
import { getKarma, karmaTitle, karmaPriceFactor } from './state/Karma';
import { ledgerCount, FISH_TOTAL } from './state/Fishing';

// SVG boat silhouette icons (no emojis)
const BOAT_ICONS: Record<string, string> = {
  tugboat: `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="30">
    <path d="M8 28 Q4 28 6 32 L14 36 H50 L58 32 Q60 28 56 28 H42 V18 H36 V14 H28 V18 H22 V28 Z" fill="rgba(255,255,255,0.7)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <rect x="30" y="20" width="8" height="8" rx="1" fill="rgba(255,255,255,0.4)"/>
    <line x1="34" y1="14" x2="34" y2="8" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
  </svg>`,
  speedboat: `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="30">
    <path d="M4 30 Q2 26 10 26 H38 L42 22 H48 L42 26 H54 Q62 26 58 30 L52 34 H12 Z" fill="rgba(255,255,255,0.7)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <path d="M40 22 L44 16 L46 22" fill="rgba(255,255,255,0.4)"/>
  </svg>`,
  cruiseship: `<svg viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="33">
    <path d="M6 32 Q2 32 4 36 L12 40 H52 L60 36 Q62 32 58 32 H6Z" fill="rgba(255,255,255,0.7)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <rect x="14" y="24" width="36" height="8" rx="2" fill="rgba(255,255,255,0.5)"/>
    <rect x="18" y="18" width="28" height="6" rx="1" fill="rgba(255,255,255,0.4)"/>
    <rect x="22" y="13" width="18" height="5" rx="1" fill="rgba(255,255,255,0.3)"/>
    <line x1="32" y1="13" x2="32" y2="6" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
  </svg>`,
  vikingship: `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="30">
    <path d="M6 28 Q2 28 4 32 L12 36 H52 L60 32 Q62 28 56 28 H8Z" fill="rgba(255,255,255,0.7)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <path d="M8 28 Q6 20 4 14" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" fill="none"/>
    <circle cx="4" cy="12" r="2" fill="rgba(255,255,255,0.4)"/>
    <path d="M56 28 Q58 22 60 18" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" fill="none"/>
    <line x1="32" y1="28" x2="32" y2="10" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
    <rect x="22" y="12" width="20" height="14" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>
    <line x1="22" y1="17" x2="42" y2="17" stroke="rgba(255,200,150,0.3)" stroke-width="1"/>
    <line x1="22" y1="22" x2="42" y2="22" stroke="rgba(255,200,150,0.3)" stroke-width="1"/>
  </svg>`,
  jetski: `<svg viewBox="0 0 64 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="30">
    <path d="M14 30 Q10 30 12 33 L18 35 H46 L54 31 Q57 29 52 28 L40 27 Z" fill="rgba(255,255,255,0.7)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <path d="M26 27 Q28 22 33 22 L36 26" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none"/>
    <line x1="33" y1="22" x2="30" y2="18" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
    <line x1="26" y1="18" x2="34" y2="18" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
    <path d="M8 33 Q4 31 2 27" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" fill="none"/>
    <path d="M10 35 Q6 35 3 33" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none"/>
  </svg>`,
};

const BOATS: { def: BoatDefinition; desc: string; iconKey: string }[] = [
  { def: TUGBOAT, desc: 'Steady & sturdy', iconKey: 'tugboat' },
  { def: SPEEDBOAT, desc: 'Fast & nimble', iconKey: 'speedboat' },
  { def: CRUISE_SHIP, desc: 'Huge & majestic', iconKey: 'cruiseship' },
  { def: VIKING_SHIP, desc: 'Ancient & humble', iconKey: 'vikingship' },
  { def: JETSKI, desc: 'Tiny & airborne', iconKey: 'jetski' },
];

// Shared DOM refs
const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const loadingBar = document.getElementById('loading-bar')!;
const escMenu = document.getElementById('esc-menu')!;
const escResume = document.getElementById('esc-resume')!;
const escLeave = document.getElementById('esc-leave')!;
const escMute = document.getElementById('esc-mute')!;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const escButton = document.getElementById('esc-button');

let activeEngine: Engine | null = null;
let escKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let escTrapHandler: ((e: KeyboardEvent) => void) | null = null;
let selectedMode: GameMode = localStorage.getItem('tb-mode') === 'magical' ? 'magical' : 'classic';

function showSelector(): void {
  // The progress bar has done its job — hide it so the selector reads clean
  loadingBar.parentElement!.style.display = 'none';
  loadingText.textContent = 'Choose your vessel';

  // Remove previous UI if it exists (re-entry case)
  document.getElementById('mode-pill')?.remove();
  document.getElementById('boat-selector')?.remove();
  document.getElementById('voyage-stats')?.remove();
  document.getElementById('shipyard-btn')?.remove();
  document.getElementById('shipyard')?.remove();

  // Mode toggle pill
  const modePill = document.createElement('div');
  modePill.id = 'mode-pill';

  const makeModeBtn = (active: boolean, name: string, desc: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.className = `mode-btn${active ? ' active' : ''}`;
    const n = document.createElement('span');
    n.className = 'mode-name';
    n.textContent = name;
    const d = document.createElement('span');
    d.className = 'mode-desc';
    d.textContent = desc;
    btn.append(n, d);
    return btn;
  };
  const classicBtn = makeModeBtn(selectedMode === 'classic', 'Boatface Killah', 'Combat — torpedoes & missiles');
  const magicalBtn = makeModeBtn(selectedMode === 'magical', 'Magical Mode', 'Family-friendly rainbows');

  classicBtn.addEventListener('click', () => {
    selectedMode = 'classic';
    localStorage.setItem('tb-mode', 'classic');
    classicBtn.classList.add('active');
    magicalBtn.classList.remove('active');
  });

  magicalBtn.addEventListener('click', () => {
    selectedMode = 'magical';
    localStorage.setItem('tb-mode', 'magical');
    magicalBtn.classList.add('active');
    classicBtn.classList.remove('active');
  });

  modePill.appendChild(classicBtn);
  modePill.appendChild(magicalBtn);
  loadingText.parentElement!.insertBefore(modePill, loadingText);

  const selector = document.createElement('div');
  selector.id = 'boat-selector';

  const lastBoat = localStorage.getItem('tb-boat');
  for (const boat of BOATS) {
    const card = document.createElement('button');
    card.className = boat.def.name === lastBoat ? 'boat-card last-played' : 'boat-card';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'boat-icon';
    const svgDoc = new DOMParser().parseFromString(BOAT_ICONS[boat.iconKey], 'image/svg+xml');
    iconSpan.appendChild(svgDoc.documentElement);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'boat-name';
    nameSpan.textContent = boat.def.name;

    const descSpan = document.createElement('span');
    descSpan.className = 'boat-desc';
    descSpan.textContent = boat.desc;

    card.appendChild(iconSpan);
    card.appendChild(nameSpan);
    card.appendChild(descSpan);

    card.addEventListener('click', () => startGame(boat.def, selectedMode));
    card.addEventListener('touchend', (e) => {
      e.preventDefault();
      startGame(boat.def, selectedMode);
    });
    selector.appendChild(card);
  }

  loadingText.parentElement!.appendChild(selector);

  // Lifetime voyage stats — only once there's something to show
  const stats = loadStats();
  const discovered = discoveredCount();
  const journal = journalCount();
  const karma = getKarma();
  if (stats.bestKills > 0 || discovered > 0 || stats.contracts > 0 || journal > 0 || karma !== 0) {
    const line = document.createElement('div');
    line.id = 'voyage-stats';
    const parts: string[] = [];
    if (karma !== 0) parts.push(`${karmaTitle(karma)} (karma ${karma > 0 ? '+' : ''}${karma})`);
    if (stats.bestKills > 0) parts.push(`Best voyage: ${stats.bestKills} kills`);
    if (discovered > 0) parts.push(`${discovered} island${discovered === 1 ? '' : 's'} discovered`);
    if (stats.contracts > 0) parts.push(`${stats.contracts} contract${stats.contracts === 1 ? '' : 's'} hauled`);
    if (journal > 0) parts.push(`journal ${journal}/${JOURNAL_TOTAL}`);
    const fish = ledgerCount();
    if (fish > 0) parts.push(`fish ${fish}/${FISH_TOTAL}`);
    line.textContent = parts.join(' · ');
    loadingText.parentElement!.appendChild(line);
  }

  // Shipyard — spend salvage credits on per-boat upgrades
  const shipyardBtn = document.createElement('button');
  shipyardBtn.id = 'shipyard-btn';
  shipyardBtn.textContent = `⚓ Shipyard · ${getCredits()} cr`;
  shipyardBtn.addEventListener('click', () => toggleShipyard(shipyardBtn));
  loadingText.parentElement!.appendChild(shipyardBtn);
}

function toggleShipyard(btn: HTMLButtonElement): void {
  const existing = document.getElementById('shipyard');
  if (existing) {
    existing.remove();
    return;
  }
  const panel = document.createElement('div');
  panel.id = 'shipyard';

  const render = (): void => {
    panel.textContent = '';
    const factor = karmaPriceFactor(getKarma());
    const header = document.createElement('div');
    header.className = 'shipyard-header';
    header.textContent =
      `Salvage credits: ${getCredits()}` +
      (factor < 1 ? ` · ${karmaTitle(getKarma())} discount` : factor > 1 ? ` · ${karmaTitle(getKarma())} surcharge` : '');
    panel.appendChild(header);

    for (const boat of BOATS) {
      const row = document.createElement('div');
      row.className = 'shipyard-row';
      const name = document.createElement('span');
      name.className = 'shipyard-boat';
      name.textContent = boat.def.name;
      row.appendChild(name);

      for (const u of UPGRADE_CATALOG) {
        const owned = hasUpgrade(boat.def.name, u.key);
        const price = upgradeCost(u, factor);
        const b = document.createElement('button');
        b.className = owned ? 'shipyard-upgrade owned' : 'shipyard-upgrade';
        b.title = u.desc;
        b.textContent = owned ? `${u.name} ✓` : `${u.name} · ${price}`;
        b.disabled = owned || getCredits() < price;
        b.addEventListener('click', () => {
          if (buyUpgrade(boat.def.name, u.key, localStorage, factor)) {
            btn.textContent = `⚓ Shipyard · ${getCredits()} cr`;
            render();
          }
        });
        row.appendChild(b);
      }
      panel.appendChild(row);
    }

    const close = document.createElement('button');
    close.className = 'shipyard-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => panel.remove());
    panel.appendChild(close);
  };

  render();
  loadingText.parentElement!.appendChild(panel);
}

function showEscMenu(): void {
  if (!activeEngine) return;
  activeEngine.pause();
  volumeSlider.value = String(Math.round(activeEngine.getVolume() * 100));
  escMute.textContent = activeEngine.isMuted() ? 'Unmute' : 'Mute';
  escMenu.classList.add('visible');

  // Keyboard a11y: move focus into the dialog and trap Tab within it.
  escResume.focus();
  escTrapHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = Array.from(escMenu.querySelectorAll<HTMLElement>('button, input'));
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  escMenu.addEventListener('keydown', escTrapHandler);
}

function clearEscTrap(): void {
  if (escTrapHandler) {
    escMenu.removeEventListener('keydown', escTrapHandler);
    escTrapHandler = null;
  }
}

function hideEscMenu(): void {
  escMenu.classList.remove('visible');
  clearEscTrap();
  if (activeEngine) activeEngine.resume();
}

function returnToSelector(): void {
  escMenu.classList.remove('visible');
  clearEscTrap();

  // Dispose the running engine
  if (activeEngine) {
    activeEngine.dispose();
    activeEngine = null;
  }

  // Remove ESC key handler
  if (escKeyHandler) {
    window.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  // Re-show loading screen as the selector backdrop
  loadingScreen.style.display = '';
  loadingScreen.classList.remove('hidden');

  showSelector();
}

function startGame(def: BoatDefinition, mode: GameMode): void {
  if (activeEngine) return; // guard against the touchend + click double-fire
  localStorage.setItem('tb-mode', mode);
  localStorage.setItem('tb-boat', def.name);
  recordVoyageStart();
  const engine = new Engine(applyBoatUpgrades(def), { mode });
  activeEngine = engine;
  (window as any).__engine = engine;

  // ESC key handler (only active during gameplay)
  escKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (escMenu.classList.contains('visible')) {
        hideEscMenu();
      } else {
        showEscMenu();
      }
    }
  };
  window.addEventListener('keydown', escKeyHandler);

  engine.start();
}

// Wire ESC menu buttons
escResume.addEventListener('click', hideEscMenu);
escLeave.addEventListener('click', returnToSelector);
escMute.addEventListener('click', () => {
  if (!activeEngine) return;
  escMute.textContent = activeEngine.toggleMute() ? 'Unmute' : 'Mute';
});
volumeSlider.addEventListener('input', () => {
  activeEngine?.setVolume(Number(volumeSlider.value) / 100);
});

// Mobile escape button
if (escButton) {
  escButton.addEventListener('click', showEscMenu);
}

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// PWA install prompt
let deferredInstallPrompt: Event | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (localStorage.getItem('pwa-install-dismissed')) return;
  deferredInstallPrompt = e;
  showInstallButton();
});

function showInstallButton(): void {
  const loadingInner = document.getElementById('loading-inner');
  if (!loadingInner) return;

  const btn = document.createElement('button');
  btn.id = 'install-btn';
  btn.textContent = 'Install App';
  btn.style.cssText = `
    margin-top: 20px;
    padding: 10px 24px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 20px;
    color: rgba(255,255,255,0.6);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    letter-spacing: 0.5px;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(255,255,255,0.16)';
    btn.style.color = 'rgba(255,255,255,0.85)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(255,255,255,0.08)';
    btn.style.color = 'rgba(255,255,255,0.6)';
  });
  btn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      (deferredInstallPrompt as any).prompt();
      const result = await (deferredInstallPrompt as any).userChoice;
      if (result.outcome === 'accepted') {
        btn.remove();
      }
      deferredInstallPrompt = null;
    }
  });

  const dismiss = document.createElement('span');
  dismiss.textContent = ' \u00d7';
  dismiss.style.cssText = 'opacity: 0.4; margin-left: 8px; cursor: pointer;';
  dismiss.addEventListener('click', (e) => {
    e.stopPropagation();
    localStorage.setItem('pwa-install-dismissed', '1');
    btn.remove();
  });
  btn.appendChild(dismiss);

  loadingInner.appendChild(btn);
}

// Show selector once page is ready
showSelector();
