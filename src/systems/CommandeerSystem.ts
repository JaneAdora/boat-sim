import * as THREE from 'three';
import { World, EntityId } from '../ecs/World';
import { Ocean } from '../rendering/Ocean';
import { WildlifeSystem, WildlifeEntity } from './WildlifeSystem';
import { BoatDefinition, deriveDragQuad } from '../boats/BoatDefinition';
import { NPC_BOAT_DEFS, NPC_HULL_HP, isCommandeerable, CommandeerableType } from '../boats/NpcDefinitions';
import { Transform } from '../components/Transform';
import { RigidBody } from '../components/RigidBody';
import { Buoyancy } from '../components/Buoyancy';
import { BoatControl } from '../components/BoatControl';
import { MeshRenderable } from '../components/MeshRenderable';

export interface CommandeerCallbacks {
  onKarma: (delta: number, reason: string, journalKey?: string) => void;
  /** Boarding-prompt banner (null clears it). */
  onHint: (text: string | null) => void;
  /** Re-pip the damage model for the hull now under your feet. */
  setHull: (maxHp: number) => void;
  /** True while captaining a stolen military vessel — the navy holds a grudge. */
  onNavalAlert: (active: boolean) => void;
}

const BOARD_RANGE = 18;
const LABELS: Record<CommandeerableType, string> = {
  fishing_boat: 'fishing boat',
  cargo_ship: 'cargo ship',
  battleship: 'battleship',
};

interface BoatVisuals {
  sailPivot: THREE.Object3D | null;
  rudderPivot: THREE.Object3D | null;
}

/**
 * Commandeering — pull alongside any vessel, press B, and it's yours.
 *
 * Being "the player" here is just a set of components on one entity, so a
 * theft is component surgery: the NPC's mesh and a per-type BoatDefinition
 * move onto the player entity, and your old boat stays anchored where you
 * left it, bobbing, re-boardable. Abandoning a *stolen* hull hands it back
 * to ordinary traffic. Theft costs karma; getting your own boat back is free.
 */
export class CommandeerSystem {
  /** Your real boat, waiting where you left it (null while you're aboard it). */
  private ownBoat: {
    mesh: THREE.Object3D;
    visuals: BoatVisuals;
    x: number;
    z: number;
    heading: number;
  } | null = null;

  private currentType: CommandeerableType | null = null;
  private boardRequested = false;
  private time = 0;

  // Action keys are event-driven like T/M/G (polling misses keys cleared on blur)
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyB' && !e.repeat) this.boardRequested = true;
  };

  constructor(
    private world: World,
    private boatEntity: EntityId,
    private wildlife: WildlifeSystem,
    private ocean: Ocean,
    private ownDef: BoatDefinition,
    private ownMaxHp: number,
    private callbacks: CommandeerCallbacks,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  update(dt: number): void {
    this.time += dt;

    // Your abandoned boat rides the swell where you left it
    if (this.ownBoat) {
      const m = this.ownBoat.mesh;
      m.position.y = this.ocean.getWaveHeight(this.ownBoat.x, this.ownBoat.z) + 0.2;
      m.rotation.x = Math.sin(this.time * 0.8) * 0.03;
      m.rotation.z = Math.sin(this.time * 0.6) * 0.04;
    }

    const t = this.world.getComponent<Transform>(this.boatEntity, 'Transform');
    if (!t) return;
    const px = t.position.x;
    const pz = t.position.z;

    const canReboard =
      this.ownBoat && Math.hypot(this.ownBoat.x - px, this.ownBoat.z - pz) < BOARD_RANGE;
    const target = canReboard ? null : this.findStealTarget(px, pz);

    this.callbacks.onHint(
      canReboard
        ? `⚓ B — Return to your ${this.ownDef.name.toLowerCase()}`
        : target
          ? `⚓ B — Board the ${LABELS[target.type as CommandeerableType]}`
          : null,
    );

    // Consume the request inside the frame loop, where components are coherent
    const requested = this.boardRequested;
    this.boardRequested = false;
    if (requested) {
      if (canReboard) this.reboard(t);
      else if (target) this.steal(target, t);
    }
  }

  private findStealTarget(px: number, pz: number): WildlifeEntity | null {
    const result = this.wildlife.findNearestVesselOrZone(px, pz, BOARD_RANGE);
    if (!result) return null;
    if (!isCommandeerable(result.entity.type)) return null;
    // Distress vessels are protected (maxAge Infinity) — rescue them instead
    if (!Number.isFinite(result.entity.maxAge)) return null;
    return result.entity;
  }

  private steal(npc: WildlifeEntity, t: Transform): void {
    const type = npc.type as CommandeerableType;
    const mr = this.world.getComponent<MeshRenderable>(this.boatEntity, 'MeshRenderable');
    const visuals = this.world.getComponent<BoatVisuals>(this.boatEntity, 'BoatVisuals');
    if (!mr || !visuals) return;

    const heading = new THREE.Euler().setFromQuaternion(t.quaternion, 'YXZ').y;

    if (this.currentType === null) {
      // Leaving your own boat: anchor it here, remember everything
      this.ownBoat = {
        mesh: mr.object3D,
        visuals: { sailPivot: visuals.sailPivot, rudderPivot: visuals.rudderPivot },
        x: t.position.x,
        z: t.position.z,
        heading,
      };
      mr.object3D.rotation.set(0, heading, 0);
    } else {
      // Abandoning a stolen hull: it rejoins ordinary traffic
      this.wildlife.adoptVessel(mr.object3D as THREE.Group, this.currentType, heading);
    }

    this.wildlife.releaseEntity(npc);
    this.applyHull(NPC_BOAT_DEFS[type], npc.mesh, { sailPivot: null, rudderPivot: null }, t, {
      x: npc.mesh.position.x,
      y: npc.mesh.position.y + 0.5,
      z: npc.mesh.position.z,
      heading: npc.heading,
    });

    this.currentType = type;
    this.callbacks.setHull(NPC_HULL_HP[type]);
    this.callbacks.onNavalAlert(type === 'battleship');
    this.callbacks.onKarma(-10, `Commandeered a ${LABELS[type]}`, 'stolen-ship');
  }

  private reboard(t: Transform): void {
    const own = this.ownBoat;
    const mr = this.world.getComponent<MeshRenderable>(this.boatEntity, 'MeshRenderable');
    if (!own || !mr || this.currentType === null) return;

    const heading = new THREE.Euler().setFromQuaternion(t.quaternion, 'YXZ').y;
    this.wildlife.adoptVessel(mr.object3D as THREE.Group, this.currentType, heading);

    this.applyHull(this.ownDef, own.mesh, own.visuals, t, {
      x: own.x,
      y: 1,
      z: own.z,
      heading: own.heading,
    });

    this.currentType = null;
    this.ownBoat = null;
    this.callbacks.setHull(this.ownMaxHp);
    this.callbacks.onNavalAlert(false);
    this.callbacks.onHint(null);
  }

  /** Component surgery: point the player entity at a different hull. */
  private applyHull(
    def: BoatDefinition,
    mesh: THREE.Object3D,
    visuals: BoatVisuals,
    t: Transform,
    place: { x: number; y: number; z: number; heading: number },
  ): void {
    const rb = this.world.getComponent<RigidBody>(this.boatEntity, 'RigidBody');
    const buoy = this.world.getComponent<Buoyancy>(this.boatEntity, 'Buoyancy');
    const ctrl = this.world.getComponent<BoatControl>(this.boatEntity, 'BoatControl');
    const mr = this.world.getComponent<MeshRenderable>(this.boatEntity, 'MeshRenderable');
    const v = this.world.getComponent<BoatVisuals>(this.boatEntity, 'BoatVisuals');
    if (!rb || !buoy || !ctrl || !mr || !v) return;

    rb.mass = def.mass;
    rb.velocity.set(0, 0, 0);
    rb.angularVelocity.set(0, 0, 0);

    buoy.samplePoints = def.hullSamplePoints.map((p) => ({
      localOffset: p.offset.clone(),
      area: p.area,
    }));
    buoy.dragQuad = deriveDragQuad(def);

    ctrl.enginePower = def.enginePower;
    ctrl.rudderSpeed = def.rudderSlew;
    ctrl.turnRadius = def.turnRadius;
    ctrl.propWash = def.propWash;
    ctrl.throttle = 0;
    ctrl.rudderAngle = 0;

    t.position.set(place.x, place.y, place.z);
    t.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.heading);

    mr.object3D = mesh;
    v.sailPivot = visuals.sailPivot;
    v.rudderPivot = visuals.rudderPivot;
  }
}
