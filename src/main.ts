import { Engine } from './Engine';
import { BoatDefinition } from './boats/BoatDefinition';
import { TUGBOAT } from './boats/Tugboat';
import { CRUISE_SHIP } from './boats/CruiseShip';
import { SPEEDBOAT } from './boats/Speedboat';

const BOATS: { def: BoatDefinition; desc: string; icon: string }[] = [
  { def: TUGBOAT, desc: 'Steady & sturdy', icon: '\u{1F6A2}' },
  { def: SPEEDBOAT, desc: 'Fast & nimble', icon: '\u{1F3CE}\uFE0F' },
  { def: CRUISE_SHIP, desc: 'Huge & majestic', icon: '\u{1F6F3}\uFE0F' },
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
    iconSpan.textContent = boat.icon;

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
