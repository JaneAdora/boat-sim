export type GameMode = 'classic' | 'magical';

export interface GameConfig {
  mode: GameMode;
  /** True only in Story Mode; gates construction of the campaign systems. */
  campaign?: boolean;
  /** Story spawn (Greyharbor dock). Free Roam leaves this undefined → default (0,1,0). */
  spawn?: { x: number; z: number };
}
