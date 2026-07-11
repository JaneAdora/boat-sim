import type { StoryBeat } from './StoryBeats';
import { STORY_LOCATIONS } from './StoryBeats';
import { ACT2_LOCATIONS, SOUL_NAMES, SOUL_PRONOUNS } from './StoryBeatsAct2';
import type { Keeper, SoulId } from './CampaignState';
import { TRENCH_ACT3 } from '../world/TrenchProfile';

/**
 * Act 3 "The Turning Tide" — beat definitions (17–24).
 *
 * Same staging discipline as Act 2: beats join the production working array
 * ONLY via ACT3_SHIPPED, stage by stage (an act2complete save arms beat 17
 * the moment it ships); the dev harness (VITE_STORY_HARNESS builds) carries
 * the full ACT3_BEATS so unshipped beats stay playable first.
 *
 * TREE-SHAKE CONTRACT (the assert-no-harness tripwire depends on it): the
 * beats live in per-stage arrays, and ACT3_SHIPPED must reference ONLY the
 * arrays whose stage has shipped — never ACT3_BEATS, never a slice of it.
 * Production imports just ACT3_SHIPPED (CampaignState) and the keeper copy
 * (MissionSystem); every unshipped stage array is then dead to the prod
 * graph and its beat ids stay out of the bundle. The harness alone reads
 * ACT3_BEATS, inside Engine's compile-time-dead VITE_STORY_HARNESS branch.
 */

const trench = STORY_LOCATIONS.trench;

export const ACT3_LOCATIONS = {
  /** The drowned bell on the flats — beat 9 placed it at flats + (26, −18). */
  bell: { x: ACT2_LOCATIONS.flats.x + 26, z: ACT2_LOCATIONS.flats.z - 18 },
  /** The pier's end — the Greyharbor dock (findStoryHarbor resolves the same
   *  point at runtime; the literal is locked by a test). */
  pier: { x: -540, z: 96 },
  /** The trench approach — just west of the mouth, where the fleet holds. */
  approach: { x: 900, z: 86 },
} as const;

// ── Stage 2 ships these: the approach (beats 17–19) ──
export const ACT3_APPROACH: StoryBeat[] = [
  {
    id: 'false-calm',
    title: 'The False Calm',
    brief:
      'Seasons turn. Greyharbor calls you a hero — and the harbour has gone quiet in a way you do not trust.',
    objective: 'Look in on the bell out on the flats, and the figure at the pier’s end.',
    encounter: {
      kind: 'visit',
      points: [
        { id: 'visit_bell', x: ACT3_LOCATIONS.bell.x, z: ACT3_LOCATIONS.bell.z },
        { id: 'visit_pier', x: ACT3_LOCATIONS.pier.x, z: ACT3_LOCATIONS.pier.z },
      ],
      radius: 24,
    },
    reward: {
      credits: 40,
      successLine:
        'The bell hangs dead in a dead calm. And at the pier’s end the humming does not stop when you draw close — it is the song from the deep, in a mouth that came back from it. The sea is holding its breath.',
    },
  },
  {
    id: 'cracked-charm',
    title: 'The Cracked Charm',
    brief: 'A song on the night water, east — the same dark stretch her people left from. She has come back.',
    objective: 'After dark, find the mermaid on the eastern water.',
    encounter: {
      kind: 'mermaid',
      spawn: ACT2_LOCATIONS.nightWaters,
      radius: 16,
      requiresNight: true,
    },
    reward: {
      credits: 60,
      journalKey: 'mermaid',
      successLine:
        'She opens her hand: the charm she gave you has cracked clean through. "What was lulled was never stilled," she says. "The deep is asking again — and this time it does not ask for a hero. It asks for company."',
    },
  },
  {
    id: 'all-hands',
    title: 'All Hands',
    brief:
      'Greyharbor empties behind you — every hull that can float is putting out. Nobody sails to the deep alone. Not this time.',
    objective: 'Lead the fleet east to the trench approach.',
    encounter: {
      kind: 'procession',
      escorts: 3,
      destination: ACT3_LOCATIONS.approach,
      radius: 60,
    },
    reward: {
      credits: 80,
      successLine:
        'The fleet holds station at the trench mouth — and something vast surfaces alongside, keeping pace like an old promise kept. From here, Captain, you go down alone.',
      slainLine:
        'The fleet holds station at the trench mouth. The water beside you stays empty — what was taken from the sea does not come back to stand with you. From here, Captain, you go down alone.',
    },
  },
];

// ── Stage 3 ships these: the descent (beats 20–22, the slice) ──
export const ACT3_DESCENT: StoryBeat[] = [
  {
    id: 'into-maelstrom',
    title: 'Into the Maelstrom',
    brief:
      'The trench has opened its throat — a slow spiral turning down into water no chart has sounded.',
    objective: 'Descend the maelstrom: hold each gate slowly, in order, deeper each time.',
    requiresBoat: 'Submarine',
    encounter: {
      kind: 'descent-gates',
      spawn: trench,
      gates: [
        { x: 1100, z: 186, band: { min: -45, max: -30 } },
        { x: 1040, z: 126, band: { min: -70, max: -50 } },
        { x: 1100, z: 86, band: { min: -100, max: -80 } },
      ],
      radius: 25,
      dwellSeconds: 5,
      maxSpeed: 3,
    },
    reward: {
      credits: 60,
      successLine:
        'The last gate opens. Below the old floor, below everything you have dared, there is light — warm, and gold, and waiting.',
    },
  },
  {
    id: 'heart-deep',
    title: 'The Heart of the Deep',
    brief:
      'Warm gold light in the deepest water there is. No teeth, no storm — something vast, and unbearably alone.',
    objective: 'Hold inside the light and listen. Stay deep, stay close, stay still.',
    requiresBoat: 'Submarine',
    encounter: {
      kind: 'listen',
      spawn: trench,
      radius: 60,
      band: TRENCH_ACT3.heartBand,
      seconds: 30,
    },
    reward: {
      credits: 80,
      successLine:
        'You listened all the way through, and you understand now: not a monster, not a god. A keeper — and the last keeper is gone. The deep has been calling for a new one all along.',
    },
  },
  {
    id: 'what-sea-asks',
    title: 'What the Sea Asks',
    brief: 'The light gathers itself into a question. It will not take. It asks.',
    objective: 'Return to the heart of the deep and answer what the sea asks.',
    requiresBoat: 'Submarine',
    encounter: {
      kind: 'keeper-choice',
      spawn: trench,
      radius: 60,
      band: TRENCH_ACT3.heartBand,
    },
    reward: {
      karma: 10,
      // The real closing line is chosen by the committed keeper —
      // keeperLineFor(state.keeper) below; this is only the safety fallback.
      successLine: 'The sea has its answer.',
    },
  },
];

// ── Stage 4 ships these: the close (beats 23–24) ──
export const ACT3_CLOSE: StoryBeat[] = [
  {
    id: 'slack-water',
    title: 'Slack Water',
    brief:
      'The asking is over. The water has gone still all the way down — rise now, gently, the way you came.',
    objective: 'Surface near the trench.',
    encounter: { kind: 'ascend', spawn: trench, radius: 150 },
    reward: {
      credits: 60,
      successLine:
        'You break the surface into slack water — the pause between tides, the sea at rest for the first time since the Marigold. All around you, soft lights are rising home.',
    },
  },
  {
    id: 'homecoming',
    title: 'Homecoming',
    brief: 'Dawn on the water, Greyharbor on the horizon, and the whole fleet lit to bring you in.',
    objective: 'Come home to the Greyharbor dock.',
    encounter: { kind: 'ascend', spawn: ACT3_LOCATIONS.pier, radius: 44 },
    reward: {
      credits: 400,
      karma: 15,
      journalKey: 'the-turning-tide', // catalog entry ships with stage 4 (PENDING_JOURNAL until then)
      flag: 'campaignComplete',
      // Stage 4 wires the keeper clause (names the keeper, or the seal) into
      // these lines; the base copy must hold for every answer until then.
      successLine:
        'Greyharbor takes you home. {saved} stand on the dock to meet you; {kept} sings below, remembered; and the deep is at peace with what you answered. The tide has turned for good, Captain. (The Vanishing Tide — complete.)',
      slainLine:
        'Greyharbor takes you home. {saved} stand on the dock to meet you; {kept} sings below, remembered; and the deep is at peace with what you answered — quieter than it might have been, and yours. The tide has turned, Captain. (The Vanishing Tide — complete.)',
    },
  },
];

/** The full act — the dev harness's array. Production never reads this. */
export const ACT3_BEATS: StoryBeat[] = [...ACT3_APPROACH, ...ACT3_DESCENT, ...ACT3_CLOSE];

/**
 * The Act 3 beats currently SHIPPED to production. Grows by plan stage —
 * stage 2: [...ACT3_APPROACH]; stage 3: += ACT3_DESCENT; stage 4: +=
 * ACT3_CLOSE. Per the tree-shake contract above, reference stage arrays
 * directly; never slice ACT3_BEATS.
 */
export const ACT3_SHIPPED: StoryBeat[] = [];

// ── Beat 22: the ask itself (copy lives with the beats, logic stays pure) ──

export const KEEPER_ASK = {
  title: 'What the Sea Asks',
  line:
    'The deep cannot keep itself. The last keeper is gone, and the light cannot be alone again. Something living must stay — or the door must close, forever. The sea will not take. It is asking.',
} as const;

export interface KeeperOption {
  label: string;
  keeper: Keeper;
}

/**
 * The options the ask offers, by save (the spec's matrix). Refusal — the seal —
 * is ALWAYS offered, so no save state can soft-lock the ask; the Leviathan can
 * stay only if it was spared; a soul can stay only if one was actually saved
 * (the first delivered volunteers).
 */
export function keeperOptionsFor(mercy: boolean, firstSaved: SoulId | null): KeeperOption[] {
  const opts: KeeperOption[] = [];
  if (mercy) opts.push({ label: 'Let the Leviathan stay', keeper: { kind: 'leviathan' } });
  if (firstSaved) {
    const name = SOUL_NAMES[firstSaved] ?? firstSaved;
    const pron = SOUL_PRONOUNS[firstSaved] ?? 'she';
    opts.push({
      label: `Let ${name} stay — ${pron} is willing`,
      keeper: { kind: 'soul', soulId: firstSaved },
    });
  }
  opts.push({ label: 'Seal the deep', keeper: { kind: 'sealed' } });
  return opts;
}

/** The beat's closing line, chosen by the committed keeper. */
export function keeperLineFor(keeper: Keeper): string {
  switch (keeper.kind) {
    case 'leviathan':
      return 'The Leviathan turns one slow circle and settles over the gold, coil upon coil — the vigil it was spared for. The deep has its keeper. Rise, Captain.';
    case 'soul': {
      const name = SOUL_NAMES[keeper.soulId] ?? keeper.soulId;
      return `${name} takes the light’s hand, and the gold steadies like a held breath let go. The sea keeps one more voice — given, this time, not taken. Rise, Captain.`;
    }
    case 'sealed':
      return 'The light dims as the door draws closed, and the deep folds its own dark around it. The quiet has a shape now, and you gave it one. Rise, Captain.';
  }
}
