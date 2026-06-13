import { BoatDefinition } from './BoatDefinition';
import { TUGBOAT } from './Tugboat';
import { CRUISE_SHIP } from './CruiseShip';

/** NPC vessel types the player can board and sail off with. */
export type CommandeerableType = 'fishing_boat' | 'cargo_ship' | 'battleship';

/**
 * Handling definitions for commandeered hulls. Hull sample points are
 * borrowed from proven player boats (buoyancy stability is hard-won tuning);
 * the *feel* — speed, turn radius, slew, power — is what differentiates them.
 */
export const NPC_BOAT_DEFS: Record<CommandeerableType, BoatDefinition> = {
  fishing_boat: {
    name: 'Fishing Boat',
    meshType: 'tugboat', // unused — the NPC mesh comes along with the theft
    mass: 2200,
    hullSamplePoints: TUGBOAT.hullSamplePoints,
    sailArea: 0,
    enginePower: 3800,
    maxSpeedKnots: 14,
    turnRadius: 28,
    rudderSlew: 1.8,
    propWash: 0.15,
  },
  cargo_ship: {
    name: 'Cargo Ship',
    meshType: 'cruiseship',
    mass: 18000,
    hullSamplePoints: CRUISE_SHIP.hullSamplePoints,
    sailArea: 0,
    enginePower: 16000,
    maxSpeedKnots: 16,
    turnRadius: 140,
    rudderSlew: 1.0,
    propWash: 0.04,
  },
  battleship: {
    name: 'Battleship',
    meshType: 'cruiseship',
    mass: 18000,
    hullSamplePoints: CRUISE_SHIP.hullSamplePoints,
    sailArea: 0,
    enginePower: 26000,
    maxSpeedKnots: 26,
    turnRadius: 110,
    rudderSlew: 1.4,
    propWash: 0.08,
  },
};

/** Hull points per stolen vessel — fishing boats are fragile, warships soak. */
export const NPC_HULL_HP: Record<CommandeerableType, number> = {
  fishing_boat: 2,
  cargo_ship: 5,
  battleship: 6,
};

export function isCommandeerable(type: string): type is CommandeerableType {
  return type === 'fishing_boat' || type === 'cargo_ship' || type === 'battleship';
}
