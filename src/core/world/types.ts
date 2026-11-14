import type { Vec2 } from '../vec';

/**
 * Open-world map specification.
 *
 * This data is the single source of truth for both simulation and rendering:
 * `buildOpenWorld` samples and indexes it into collision and surface queries,
 * and `src/game/openWorldScene.ts` extrudes the same sampled paths into meshes.
 * Nothing in here depends on Three.js.
 *
 * Coordinate convention (metres, radians):
 *   - X is east, Z is south, Y is up, the valley floor is flat at y = 0.
 *   - A pose heading of 0 points along -Z; positive headings rotate left.
 *   - A box `angle` is the direction of its local +X axis measured from world +X
 *     toward world +Z (standard `atan2(dz, dx)`). Renderers must negate it for
 *     Three.js `rotation.y`, because +Y rotation turns +X toward -Z.
 *   - Every box anchor is its footprint centre at ground level.
 */

export type WorldSurface = 'tarmac' | 'kerb' | 'grass';

export type RoadKind = 'main' | 'secondary' | 'lane' | 'runway' | 'access';

/** Kerb flags for an arc-length span (metres from the road start). */
export interface KerbRange {
  readonly start: number;
  readonly end: number;
  readonly side: 'left' | 'right' | 'both';
}

export interface RoadSpec {
  readonly id: string;
  readonly name: string;
  readonly kind: RoadKind;
  /** Asphalt width between the edge lines, in metres. */
  readonly width: number;
  /** Spline control points in driving order. */
  readonly controlPoints: readonly Vec2[];
  readonly closed: boolean;
  /** Resample spacing in metres. Defaults to 4. */
  readonly spacing?: number;
  /** Painted white edge lines. Defaults to true except on runways. */
  readonly edgeLines?: boolean;
  readonly kerbs?: readonly KerbRange[];
}

/** A road after spline sampling and arc-length annotation. */
export interface RoadPath {
  readonly spec: RoadSpec;
  readonly points: readonly Vec2[];
  readonly normals: readonly Vec2[];
  readonly tangents: readonly Vec2[];
  /** Cumulative arc length, one longer than `points` on open roads, plus a closing entry on closed ones. */
  readonly arcLengths: readonly number[];
  readonly totalLength: number;
}

/** A paved junction disc that ties two or more roads together. */
export interface JunctionSpec {
  readonly id: string;
  readonly name: string;
  readonly center: Vec2;
  readonly radius: number;
}

export type BarrierStyle = 'guardrail' | 'stone' | 'timber' | 'fence';

/**
 * Barrier/kerb source. `road-edge` offsets a road centreline between the
 * samples nearest to `from` and `to`, so the rail follows the sampled road
 * exactly instead of being hand-placed next to it.
 */
export type BarrierSource =
  | { readonly type: 'polyline'; readonly points: readonly Vec2[] }
  | {
      readonly type: 'road-edge';
      readonly roadId: string;
      readonly side: 'left' | 'right';
      /** Extra distance outside the asphalt edge, in metres. */
      readonly offset: number;
      readonly from: Vec2;
      readonly to: Vec2;
    };

export interface BarrierSpec {
  readonly id: string;
  readonly name: string;
  readonly style: BarrierStyle;
  /** Rail wall thickness in metres, used for both the mesh slab and the collider. */
  readonly thickness: number;
  readonly height: number;
  readonly source: BarrierSource;
  /** `boundary` marks the world edge; everything else is ordinary scenery. */
  readonly category?: 'solid' | 'boundary';
}

export type BuildingKind = 'house' | 'shop' | 'hall' | 'shed' | 'hangar' | 'tower' | 'deck';
export type BuildingWall = 'plaster' | 'timber' | 'concrete';
export type BuildingRoof = 'gable' | 'hip' | 'flat' | 'mono';

export interface BuildingSpec {
  readonly id: string;
  readonly kind: BuildingKind;
  /** Footprint centre. */
  readonly center: Vec2;
  readonly size: { readonly x: number; readonly z: number };
  /** Direction of local +X in XZ radians. */
  readonly angle: number;
  readonly baseY?: number;
  readonly wallHeight: number;
  readonly roofHeight: number;
  readonly wall: BuildingWall;
  readonly roof: BuildingRoof;
  /** False only for overhead structures such as the bridge deck. */
  readonly solid: boolean;
}

export interface TreeSpec {
  readonly id: string;
  readonly position: Vec2;
  readonly scale: number;
  readonly variant: 0 | 1 | 2;
}

/**
 * Deterministic tree planting region. `buildOpenWorld` rejects candidates that
 * would sit on a road, pad, building or barrier, then records the accepted
 * positions as the one source of truth for meshes and trunk colliders.
 */
export interface TreeZoneSpec {
  readonly id: string;
  readonly center: Vec2;
  readonly size: { readonly x: number; readonly z: number };
  readonly count: number;
  readonly seed: number;
  /** Keep-out distance from asphalt edges, in metres. */
  readonly roadClearance: number;
  readonly minScale: number;
  readonly maxScale: number;
}

export interface RockSpec {
  readonly id: string;
  readonly position: Vec2;
  /** Horizontal radius of the visible boulder. */
  readonly radius: number;
  readonly height: number;
  readonly variant: 0 | 1 | 2;
}

export type PropKind = 'silo' | 'water-tower' | 'windsock' | 'sign' | 'bollard' | 'fuel-tank';

export interface PropSpec {
  readonly id: string;
  readonly kind: PropKind;
  readonly position: Vec2;
  readonly angle: number;
  readonly scale: number;
  /** Sign lettering, always a place name or direction. */
  readonly label?: string;
  readonly solid: boolean;
}

export type GroundPatchKind = 'dirt' | 'mown' | 'paddock' | 'gravel';

/** Render-only surface variation. It never changes handling. */
export interface GroundPatchSpec {
  readonly id: string;
  readonly kind: GroundPatchKind;
  readonly center: Vec2;
  readonly size: { readonly x: number; readonly z: number };
  readonly angle: number;
}

export interface StartPose {
  readonly position: Vec2;
  readonly heading: number;
}

export interface RecoveryPoint extends StartPose {
  readonly id: string;
  readonly name: string;
}

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface OpenWorldSpec {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly bounds: WorldBounds;
  readonly spawn: StartPose;
  readonly recoveryPoints: readonly RecoveryPoint[];
  readonly roads: readonly RoadSpec[];
  readonly junctions: readonly JunctionSpec[];
  readonly barriers: readonly BarrierSpec[];
  readonly buildings: readonly BuildingSpec[];
  readonly trees: readonly TreeSpec[];
  readonly treeZones: readonly TreeZoneSpec[];
  readonly rocks: readonly RockSpec[];
  readonly props: readonly PropSpec[];
  readonly groundPatches: readonly GroundPatchSpec[];
}

/* -------------------------------------------------------------------------- */
/* Collision                                                                   */
/* -------------------------------------------------------------------------- */

export type ColliderCategory = 'solid' | 'boundary';
export type ColliderKind = 'barrier' | 'building' | 'tree' | 'rock' | 'prop' | 'world-edge';

export interface BoxShape {
  readonly type: 'box';
  /** Footprint centre. */
  readonly center: Vec2;
  readonly halfX: number;
  readonly halfZ: number;
  /** Direction of local +X in XZ radians. */
  readonly angle: number;
}

export interface CircleShape {
  readonly type: 'circle';
  readonly center: Vec2;
  readonly radius: number;
}

export type ColliderShape = BoxShape | CircleShape;

export interface Collider {
  readonly id: string;
  /** The map object that produced this collider. */
  readonly sourceId: string;
  readonly category: ColliderCategory;
  readonly kind: ColliderKind;
  readonly shape: ColliderShape;
  /** Vertical extent from the ground, for documentation and debug drawing. */
  readonly height: number;
}

export interface Aabb {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A resolved contact. `normal` points from the obstacle toward the car. */
export interface CarContact {
  readonly colliderId: string;
  readonly sourceId: string;
  readonly kind: ColliderKind;
  readonly normal: Vec2;
  readonly depth: number;
  readonly point: Vec2;
}
