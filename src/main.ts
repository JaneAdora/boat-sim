import { Engine } from './Engine';
import { BoatDefinition } from './boats/BoatDefinition';
import { TUGBOAT } from './boats/Tugboat';
import { CRUISE_SHIP } from './boats/CruiseShip';
import { SPEEDBOAT } from './boats/Speedboat';
import { VIKING_SHIP } from './boats/VikingShip';
import { GameMode } from './state/GameConfig';

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
};

const BOATS: { def: BoatDefinition; desc: string; iconKey: string }[] = [
  { def: TUGBOAT, desc: 'Steady & sturdy', iconKey: 'tugboat' },
  { def: SPEEDBOAT, desc: 'Fast & nimble', iconKey: 'speedboat' },
  { def: CRUISE_SHIP, desc: 'Huge & majestic', iconKey: 'cruiseship' },
  { def: VIKING_SHIP, desc: 'Ancient & humble', iconKey: 'vikingship' },
];

// Shared DOM refs
const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const loadingBar = document.getElementById('loading-bar')!;
const escMenu = document.getElementById('esc-menu')!;
const escConfirm = document.getElementById('esc-confirm')!;
const escCancel = document.getElementById('esc-cancel')!;
const escButton = document.getElementById('esc-button');

let activeEngine: Engine | null = null;
let escKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let selectedMode: GameMode = 'classic';

function showSelector(): void {
  loadingBar.style.width = '100%';
  loadingText.textContent = 'Choose your vessel';

  // Remove previous UI if it exists (re-entry case)
  document.getElementById('mode-pill')?.remove();
  document.getElementById('boat-selector')?.remove();

  // Mode toggle pill
  const modePill = document.createElement('div');
  modePill.id = 'mode-pill';

  const classicBtn = document.createElement('button');
  classicBtn.className = `mode-btn${selectedMode === 'classic' ? ' active' : ''}`;
  classicBtn.textContent = '\u{1F4A3} Boatface Killah';

  const magicalBtn = document.createElement('button');
  magicalBtn.className = `mode-btn${selectedMode === 'magical' ? ' active' : ''}`;
  magicalBtn.textContent = '\u2728 Magical Mode';

  classicBtn.addEventListener('click', () => {
    selectedMode = 'classic';
    classicBtn.classList.add('active');
    magicalBtn.classList.remove('active');
  });

  magicalBtn.addEventListener('click', () => {
    selectedMode = 'magical';
    magicalBtn.classList.add('active');
    classicBtn.classList.remove('active');
  });

  modePill.appendChild(classicBtn);
  modePill.appendChild(magicalBtn);
  loadingText.parentElement!.insertBefore(modePill, loadingText);

  const selector = document.createElement('div');
  selector.id = 'boat-selector';

  for (const boat of BOATS) {
    const card = document.createElement('button');
    card.className = 'boat-card';

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
}

function showEscMenu(): void {
  if (!activeEngine) return;
  activeEngine.pause();
  escMenu.classList.add('visible');
}

function hideEscMenu(): void {
  escMenu.classList.remove('visible');
  if (activeEngine) activeEngine.resume();
}

function returnToSelector(): void {
  escMenu.classList.remove('visible');

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
  const engine = new Engine(def, { mode });
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
escConfirm.addEventListener('click', returnToSelector);
escCancel.addEventListener('click', hideEscMenu);

// Mobile escape button
if (escButton) {
  escButton.addEventListener('click', showEscMenu);
}

// Show selector once page is ready
showSelector();
