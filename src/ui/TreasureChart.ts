import { TreasureMapData, mapIsland, extractCoastline } from '../state/TreasureMap';

/**
 * The treasure chart — a torn parchment overlay (V to toggle) showing the
 * target island's REAL coastline silhouette and an ✕. Deliberately no name,
 * no coordinates, no waypoint: the puzzle is recognizing the shape against
 * the minimap or the horizon.
 */
export class TreasureChart {
  private panel: HTMLDivElement | null = null;
  private map: TreasureMapData | null = null;

  setMap(map: TreasureMapData | null): void {
    this.map = map;
    if (!map) this.hide();
  }

  hasMap(): boolean {
    return this.map !== null;
  }

  toggle(): void {
    if (this.panel) this.hide();
    else if (this.map) this.show();
  }

  private show(): void {
    if (!this.map) return;
    const island = mapIsland(this.map);
    if (!island) return;

    this.panel = document.createElement('div');
    this.panel.id = 'treasure-chart';

    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    // Parchment
    ctx.fillStyle = '#e8d9b0';
    ctx.fillRect(0, 0, 280, 300);
    ctx.strokeStyle = 'rgba(122, 92, 52, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 7, 266, 286);

    ctx.fillStyle = '#6b5232';
    ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('…torn from a logbook', 140, 30);

    // The island silhouette — true coastline from the world's own heightmap
    const coast = extractCoastline(island);
    const size = island.heightmapSize;
    const inset = 45;
    const span = 280 - inset * 2;
    ctx.fillStyle = 'rgba(94, 72, 44, 0.85)';
    for (const p of coast) {
      const px = inset + (p.x / size) * span;
      const py = 55 + (p.z / size) * span;
      // Sketchy hand-inked dots rather than a clean line
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // The ✕ — world position → heightmap grid → parchment
    const scale = (island.radius * 2.5) / size;
    const gx = (this.map.digX - island.centerX) / scale + size / 2;
    const gz = (this.map.digZ - island.centerZ) / scale + size / 2;
    const xx = inset + (gx / size) * span;
    const xy = 55 + (gz / size) * span;
    ctx.strokeStyle = '#a3342a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xx - 7, xy - 7); ctx.lineTo(xx + 7, xy + 7);
    ctx.moveTo(xx + 7, xy - 7); ctx.lineTo(xx - 7, xy + 7);
    ctx.stroke();

    // Compass rose (chart is north-up, like the minimap)
    ctx.strokeStyle = '#6b5232';
    ctx.fillStyle = '#6b5232';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(245, 60); ctx.lineTo(245, 36);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(245, 32); ctx.lineTo(241, 42); ctx.lineTo(249, 42);
    ctx.closePath();
    ctx.fill();
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('N', 245, 74);

    ctx.font = '400 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('the shape is the only name you get', 140, 285);

    const hint = document.createElement('div');
    hint.id = 'treasure-chart-hint';
    hint.textContent = 'V to stow the chart';

    this.panel.append(canvas, hint);
    document.body.appendChild(this.panel);
  }

  private hide(): void {
    this.panel?.remove();
    this.panel = null;
  }

  dispose(): void {
    this.hide();
  }
}
