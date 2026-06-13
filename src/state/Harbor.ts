import { Biome } from '../world/IslandGenerator';
import { chunkHash, islandName } from '../world/IslandNames';

/**
 * Harbour towns — the social verb. Some big islands carry a working dock with
 * a harbour-master who sells the Angler's Rod, remembers your catch, and trades
 * gossip about distant corners of the sea. Everything here is a pure function of
 * the island's chunk coordinates, so every visit (and every session) agrees on
 * who runs the dock and what they say — the mesh and the UI just render it.
 *
 * Salts 21–28 are used below. Harbours only exist on island chunks, and the
 * water-only wreck graveyards reuse the 20-range salts on empty chunks, so the
 * two never collide on the same chunk.
 */

/** Price of the Angler's Rod at any harbour. */
export const ROD_COST = 200;

/** Only sizeable islands rate a harbour, and only about half of those. */
export const HARBOR_MIN_RADIUS = 55;

export function harborEligible(radius: number, cx: number, cz: number): boolean {
  return radius > HARBOR_MIN_RADIUS && chunkHash(cx, cz, 21) < 0.5;
}

// A pool of salty harbour-masters. Deterministically assigned per island.
const HARBOURMASTERS = [
  'Old Greaves', 'Marta Quayle', 'Bosun Pike', 'Nan Halloran',
  'Silas Boon', "Cap'n Reyes", 'Tunny Walsh', 'Mads Eriksen',
  'Perla Vance', 'Cobb Tidewell', 'Inez Marlow', 'Dewi Salt',
  'Ferro Lunn', 'Greta Voss', 'Hob Carrack', 'Una Brine',
];

export function dockmasterName(cx: number, cz: number): string {
  return HARBOURMASTERS[Math.floor(chunkHash(cx, cz, 25) * HARBOURMASTERS.length)];
}

/** A spoken greeting weaving the harbour-master and the island's name. */
export function dockGreeting(cx: number, cz: number, biome: Biome): string {
  const who = dockmasterName(cx, cz);
  const isle = islandName(cx, cz, biome);
  const lines = [
    `${who}, harbour-master of ${isle}, waves you alongside.`,
    `"Welcome to ${isle}," ${who} calls from the jetty. "Tie up and rest."`,
    `${who} catches your line. "Not many boats reach ${isle}. Stay a while."`,
    `"${isle}'s a quiet berth," says ${who}, "but the kettle's always on."`,
  ];
  return lines[Math.floor(chunkHash(cx, cz, 28) * lines.length)];
}

const DIRECTIONS = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

/**
 * A deterministic "tavern rumor" — each one points at real content somewhere in
 * the world (a sea arch, a wreck field, the mermaid's song, the Leviathan, a
 * bottled chart, a conditional fish, a dark lighthouse), with a hashed compass
 * bearing for flavour. Pure, so the same dock always tells the same tale.
 */
export function tavernRumor(cx: number, cz: number): string {
  const dir = DIRECTIONS[Math.floor(chunkHash(cx, cz, 27) * DIRECTIONS.length)];
  const rumors = [
    `A stone sea-arch stands off a big island to the ${dir} — sail clean under it for luck.`,
    `Old hands swear a graveyard of wrecks lies in deep water to the ${dir}. Good salvage, bad ghosts.`,
    `On a clear, calm night a song drifts from the arches. Cut your engine and follow it by ear.`,
    `In the worst storms something vast wakes in the deep water. Folk who've seen it don't fish there twice.`,
    `Charts wash up corked in bottles on the tide — pop one open and read the coastline (V).`,
    `They reckon the Thunder Marlin only takes a line mid-storm, out past the open shoals.`,
    `The lighthouse to the ${dir} went dark last season, and nobody's rowed out to see why.`,
    `Moonfish run after dark — drop a line on a black, calm night and wait for the dip.`,
  ];
  return rumors[Math.floor(chunkHash(cx, cz, 26) * rumors.length)];
}
