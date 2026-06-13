/**
 * Opt-in calm: two accessibility toggles set on the opening screen and read
 * once when the engine starts. They sit on top of either game mode — a way to
 * dial combat down without leaving "Boatface Killah".
 */
export interface CombatSettings {
  /** Other boats (the battleship) won't fire on you — no shells at all. */
  peaceful: boolean;
  /** No offensive weapons anywhere: your torpedoes & missiles AND the
   *  battleship's cannon are switched off. A fully unarmed sea. */
  disarmed: boolean;
}

const PEACEFUL_KEY = 'tb-peaceful';
const DISARMED_KEY = 'tb-disarmed';

export function loadCombatSettings(storage: Storage = localStorage): CombatSettings {
  return {
    peaceful: storage.getItem(PEACEFUL_KEY) === '1',
    disarmed: storage.getItem(DISARMED_KEY) === '1',
  };
}
