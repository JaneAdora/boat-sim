import { ChunkManager } from '../world/ChunkManager';
import { Biome } from '../world/IslandGenerator';

interface WildlifeInfo {
  x: number;
  z: number;
  type: string;
}

const CANVAS_SIZE = 280; // 2x CSS size for retina (CSS size is 140px)
const MAP_RADIUS = 500; // world units represented by the minimap radius
const HALF = CANVAS_SIZE / 2;

const BIOME_COLORS: Record<Biome, string> = {
  tropical: '#3a8a4a',
  rocky: '#7a7a7a',
  autumn: '#c8862a',
  desert: '#c8b070',
};

const WILDLIFE_COLORS: Record<string, string> = {
  dolphin: '#6ab8e8',
  whale: '#4a7a9a',
  fishing_boat: '#e8d06a',
  cargo_ship: '#e87a5a',
};

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private chunkManager: ChunkManager;
  private visible = true;

  constructor(chunkManager: ChunkManager) {
    this.chunkManager = chunkManager;

    this.container = document.getElementById('minimap-container')!;
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // Map toggle button (mobile)
    const mapToggle = document.getElementById('map-toggle');
    if (mapToggle) {
      mapToggle.textContent = '\u25CC'; // dotted circle icon
      mapToggle.addEventListener('click', () => this.toggle());
    }

    // Check if mobile — hidden by default on touch devices
    const isTouchDevice = matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) {
      this.visible = false;
      this.container.style.display = 'none';
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? 'block' : 'none';
  }

  update(
    boatX: number,
    boatZ: number,
    boatHeading: number,
    wildlife: WildlifeInfo[],
  ): void {
    if (!this.visible) return;

    const ctx = this.ctx;
    const islands = this.chunkManager.getIslandPositions();

    // Clear
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = 'rgba(10, 22, 40, 0.85)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Helper: transform world coords to minimap coords (boat-heading-up)
    const toMap = (wx: number, wz: number): [number, number] => {
      let dx = (wx - boatX);
      let dz = (wz - boatZ);
      // Rotate by -boatHeading for boat-heading-up mode
      const cos = Math.cos(-boatHeading);
      const sin = Math.sin(-boatHeading);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      const mx = rx / MAP_RADIUS * HALF + HALF;
      const mz = rz / MAP_RADIUS * HALF + HALF;
      return [mx, mz];
    };

    // Draw grid rings (subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath();
      ctx.arc(HALF, HALF, HALF * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw islands
    for (const island of islands) {
      const dx = island.x - boatX;
      const dz = island.z - boatZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Only draw if within range (with some margin for large islands)
      if (dist > MAP_RADIUS + island.radius) continue;

      const [mx, mz] = toMap(island.x, island.z);
      const mapR = Math.max(3, (island.radius / MAP_RADIUS) * HALF);

      ctx.fillStyle = BIOME_COLORS[island.biome] || BIOME_COLORS.tropical;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(mx, mz, mapR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Draw wildlife
    for (const w of wildlife) {
      const dx = w.x - boatX;
      const dz = w.z - boatZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > MAP_RADIUS) continue;

      const [mx, mz] = toMap(w.x, w.z);
      const dotSize = (w.type === 'cargo_ship') ? 4 : (w.type === 'fishing_boat') ? 3 : 2;

      ctx.fillStyle = WILDLIFE_COLORS[w.type] || '#aaaaaa';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(mx, mz, dotSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Draw compass direction labels
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const compassDirs: [string, number][] = [
      ['N', 0],
      ['E', Math.PI / 2],
      ['S', Math.PI],
      ['W', -Math.PI / 2],
    ];

    for (const [label, angle] of compassDirs) {
      // Rotate label positions by -boatHeading
      const a = angle - boatHeading;
      const lx = HALF + Math.sin(a) * (HALF - 16);
      const lz = HALF - Math.cos(a) * (HALF - 16);
      ctx.fillStyle = label === 'N' ? '#e05050' : 'rgba(255, 255, 255, 0.4)';
      ctx.fillText(label, lx, lz);
    }

    // Draw compass ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Draw player boat (white triangle at center, pointing up = forward)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const triSize = 8;
    ctx.moveTo(HALF, HALF - triSize);         // tip (forward)
    ctx.lineTo(HALF - triSize * 0.6, HALF + triSize * 0.6);
    ctx.lineTo(HALF + triSize * 0.6, HALF + triSize * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
