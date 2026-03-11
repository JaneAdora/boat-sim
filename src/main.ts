import { Engine } from './Engine';
import { BoatDefinition } from './boats/BoatDefinition';
import { TUGBOAT } from './boats/Tugboat';
import { CRUISE_SHIP } from './boats/CruiseShip';
import { SPEEDBOAT } from './boats/Speedboat';

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
};

const BOATS: { def: BoatDefinition; desc: string; iconKey: string }[] = [
  { def: TUGBOAT, desc: 'Steady & sturdy', iconKey: 'tugboat' },
  { def: SPEEDBOAT, desc: 'Fast & nimble', iconKey: 'speedboat' },
  { def: CRUISE_SHIP, desc: 'Huge & majestic', iconKey: 'cruiseship' },
];

// Build boat selector UI inside the loading screen
const loadingText = document.getElementById('loading-text')!;
const loadingBar = document.getElementById('loading-bar')!;

function showSelector(): void {
  loadingBar.style.width = '100%';
  loadingText.textContent = 'Choose your vessel';

  const selector = document.createElement('div');
  selector.id = 'boat-selector';

  for (const boat of BOATS) {
    const card = document.createElement('button');
    card.className = 'boat-card';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'boat-icon';
    // Parse hardcoded SVG safely via DOMParser
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

    card.addEventListener('click', () => startGame(boat.def));
    card.addEventListener('touchend', (e) => {
      e.preventDefault();
      startGame(boat.def);
    });
    selector.appendChild(card);
  }

  loadingText.parentElement!.appendChild(selector);
}

function startGame(def: BoatDefinition): void {
  const engine = new Engine(def);
  (window as any).__engine = engine;
  engine.start();
}

// Show selector once page is ready
showSelector();
