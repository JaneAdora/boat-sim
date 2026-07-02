import type { StoryBeat } from './StoryBeats';
import { STORY_LOCATIONS } from './StoryBeats';

/**
 * Act 2 "The Drowned Light" — beat definitions (9 onward).
 *
 * NOT appended to the production STORY_BEATS: a finished Act 1 save arms
 * beat 9 the moment it exists, so these join the working array only via
 * (a) the dev slice harness (compile-time-gated) during Stage 1 build, and
 * (b) the real appends when each stage is playable (plan stages 2–4).
 *
 * Coordinates are narrative anchors validated open-water in tests; trench
 * content depths come from TrenchProfile, never literals here.
 */

export const ACT2_LOCATIONS = {
  /** The flats west of Greyharbor where the tide went wrong (beat 9). */
  flats: { x: -710, z: 200 },
  /** Night waters east of the harbour mouth, where the merfolk stream away (beat 10). */
  nightWaters: { x: 60, z: -110 },
} as const;

const reef = STORY_LOCATIONS.reef;
const trench = STORY_LOCATIONS.trench;

export const ACT2_BEATS: StoryBeat[] = [
  {
    id: 'tide-stayed',
    title: 'The Tide That Stayed',
    brief: 'The sea has gone still and wrong. Another boat sits empty off the western flats.',
    objective: 'Bring the drifting boat home from the western flats.',
    encounter: { kind: 'tow-derelict', spawn: ACT2_LOCATIONS.flats, radius: 44 },
    reward: {
      credits: 60,
      journalKey: 'rescue',
      successLine:
        'Home again, and still no crew. The bell out on the flats keeps tolling to no one.',
    },
  },
  {
    id: 'exodus',
    title: 'Her People Are Leaving',
    brief: 'A song on the night water, east. It sounds like a goodbye.',
    objective: 'Find the mermaid on the eastern water.',
    encounter: { kind: 'mermaid', spawn: ACT2_LOCATIONS.nightWaters, radius: 16 },
    reward: {
      credits: 60,
      journalKey: 'mermaid',
      successLine:
        'Her charm has gone dark, and her people stream away below. "It was not hunting you," she says. "It was running. And the lost are not lost."',
    },
  },
  {
    id: 'deep-refit',
    title: 'Built for the Pressure',
    brief: 'The trench floor would crush the sub as she is. The reef wrecks hold what the refit needs.',
    objective: 'Recover three salvage pieces at the reef, then return to Greyharbor.',
    encounter: {
      kind: 'multi-pickup',
      points: [
        { id: 'salvage_plating', x: reef.x - 28, z: reef.z + 30 },
        { id: 'salvage_viewport', x: reef.x + 38, z: reef.z - 18 },
        { id: 'salvage_gauges', x: reef.x - 6, z: reef.z - 40 },
      ],
      radius: 22,
      dockRadius: 44,
    },
    reward: {
      credits: 80,
      flag: 'deepRefit',
      successLine:
        'Plating welded, viewport seated, gauges tested. She can take the pressure now. The trench is open.',
    },
  },
  {
    id: 'into-trench',
    title: 'Into the Trench',
    brief: 'Past every depth you have dared. The breathing sound swells below.',
    objective: 'Dive the trench in the submarine, deeper than the old floor.',
    requiresBoat: 'Submarine',
    encounter: { kind: 'sonar-contact', spawn: trench, radius: 70, depth: -50 },
    reward: {
      credits: 50,
      journalKey: 'wrecks',
      successLine:
        'Boats stand moored along the ledge a mile from any harbour, masts raised like a congregation. Something arranged this.',
    },
  },
  {
    id: 'drowned-choir',
    title: 'The Drowned Choir',
    brief: 'At the bottom waits a drowned hamlet — and the vanished, standing in its streets, singing.',
    objective: 'Carry the souls you can back to the surface. You cannot carry them all.',
    requiresBoat: 'Submarine',
    encounter: {
      kind: 'soul-transport',
      hamlet: { x: trench.x, z: trench.z },
      souls: [
        { id: 'survivor_wife', name: 'Mara', dx: -12, dz: 6 },
        { id: 'soul_lampkeeper', name: 'Edda', dx: 10, dz: -8 },
        { id: 'soul_deckhand', name: 'Tomas', dx: 2, dz: 14 },
      ],
      pickupRadius: 8,
      deliverRadius: 40,
    },
    reward: {
      credits: 120,
      karma: 10,
      journalKey: 'drowned-choir',
      successLine:
        'Two came back to the light. {kept} stays below, singing — the sea keeps one voice for itself.',
    },
  },
];
