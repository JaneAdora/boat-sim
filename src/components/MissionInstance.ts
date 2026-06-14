/**
 * Stable identity for a mission-owned encounter object (a WildlifeEntity or a
 * THREE.Group prop) so completion checks the EXACT instance, not any ambient
 * look-alike. The campaign owns these; ambient despawn/journal scans skip them.
 */
export interface MissionInstance {
  beatId: string;
  ref: object; // WildlifeEntity | THREE.Group
}

export function sameInstance(a: MissionInstance | null, ref: object | null | undefined): boolean {
  return !!a && !!ref && a.ref === ref;
}
