import type { StoryBeat } from './StoryBeats';

/**
 * Act 3 "The Turning Tide" — beat definitions (17–24).
 *
 * Same staging discipline as Act 2: beats join the production working array
 * ONLY via ACT3_SHIPPED, stage by stage (an act2complete save arms beat 17
 * the moment it ships); the dev harness (VITE_STORY_HARNESS builds) carries
 * the full array so unshipped beats stay playable first. Beat data is
 * authored in plan stage 1; until then both arrays are empty and an
 * act2complete save remains complete ("to be continued").
 */
export const ACT3_BEATS: StoryBeat[] = [];

/** Grows by plan stage: 17–19 (stage 2), 20–22 (stage 3), 23–24 (stage 4). */
export const ACT3_SHIPPED: StoryBeat[] = ACT3_BEATS.slice(0, 0);
