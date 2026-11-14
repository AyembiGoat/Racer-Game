import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { OpenWorldRuntime } from '../core/world/build';
import type { BarrierStyle, BuildingSpec, TreeSpec } from '../core/world/types';
import type { Vec2 } from '../core/vec';
import { applySurface, surface } from './materials';
import { buildSkyAndSun } from './world';

/**
 * Kestrel Valley renderer.
 *
 * Every mesh is extruded from the same `OpenWorldRuntime` data that produces
 * collision: road ribbons use the sampled `RoadPath`, barrier slabs use the
 * exact `BuiltBarrier.points` and thickness, buildings use their collider
 * footprint, and trees use the accepted `TreeSpec` positions. Nothing is
 * hand-placed here, so the picture and the collision volumes cannot drift.
 *
 * Static geometry is merged by material and instanced by style/kind. Trees are
 * chunked on a 500 m grid so the far side of the valley can be culled.
 */

const ROAD_Y = 0.018;
const PAINT_Y = 0.026;
const PAD_Y = 0.016;
const CHUNK_METRES = 1200;

const DIRT = new THREE.MeshStandardMaterial({ color: 0x79664c, roughness: 1 });
const MOWN = new THREE.MeshStandardMaterial({ color: 0x6d8545, roughness: 1 });
const PADDOCK = new THREE.MeshStandardMaterial({ color: 0x7f8a4e, roughness: 1 });
const GRAVEL = new THREE.MeshStandardMaterial({ color: 0x8b8576, roughness: 1 });
const GRASS = surface('grass');
const ASPHALT = surface('asphalt');
const KERB = surface('kerb');
const WHITE = new THREE.MeshStandardMaterial({ color: 0xeeefe8, roughness: 0.74 });
const SLATE = new THREE.MeshStandardMaterial({ color: 0x474b52, roughness: 0.82 });
const TERRACOTTA = new THREE.MeshStandardMaterial({ color: 0x9a4b34, roughness: 0.86 });
const PLASTER = new THREE.MeshStandardMaterial({ color: 0xded4bf, roughness: 0.94 });
const TIMBER = new THREE.MeshStandardMaterial({ color: 0x74523a, roughness: 0.95 });
const CONCRETE = surface('concrete');
const DARK = new THREE.MeshStandardMaterial({ color: 0x1e2125, roughness: 0.7 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x7f8a91, roughness: 0.46, metalness: 0.55 });
const FENCE_WIRE = new THREE.MeshStandardMaterial({
  color: 0x7b7568,
  roughness: 0.65,
  metalness: 0.25,
});
const TRUNK = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.98 });
const CANOPY = surface('foliage');
const ROCK = new THREE.MeshStandardMaterial({ color: 0x6e6f68, roughness: 0.97 });

function quad(
  positions: number[],
  uvs: number[],
  indices: number[],
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
  y: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): void {
  const base = positions.length / 3;
  positions.push(a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, d.x, y, d.z);
  uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Paved ribbon between two offset rings. Closed roads wrap seamlessly. */
function ribbon(
  road: {
    readonly points: readonly Vec2[];
    readonly normals: readonly Vec2[];
    readonly arcLengths: readonly number[];
    readonly spec: { readonly closed: boolean };
  },
  innerOffset: number,
  outerOffset: number,
  y: number,
  tile: number,
  startIndex = 0,
  endIndex = road.points.length,
  skip?: (a: Vec2, b: Vec2) => boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const count = endIndex - startIndex;
  if (count < 2) return new THREE.BufferGeometry();
  const closed = road.spec.closed && startIndex === 0 && endIndex === road.points.length;
  const total = closed ? count : count - 1;
  for (let step = 0; step < total; step++) {
    const i = startIndex + step;
    const j = startIndex + ((step + 1) % count);
    const pi = road.points[i];
    const pj = road.points[j];
    const ni = road.normals[i];
    const nj = road.normals[j];
    if (!pi || !pj || !ni || !nj) continue;
    if (skip?.(pi, pj)) continue;
    const ai = { x: pi.x + ni.x * innerOffset, z: pi.z + ni.z * innerOffset };
    const bi = { x: pi.x + ni.x * outerOffset, z: pi.z + ni.z * outerOffset };
    const aj = { x: pj.x + nj.x * innerOffset, z: pj.z + nj.z * innerOffset };
    const bj = { x: pj.x + nj.x * outerOffset, z: pj.z + nj.z * outerOffset };
    const v0 = (road.arcLengths[i] ?? 0) / tile;
    const v1 = (road.arcLengths[i + 1] ?? (road.arcLengths[i] ?? 0) + 1) / tile;
    quad(positions, uvs, indices, ai, bi, bj, aj, y, 0, 1, v0, v1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roadSurface(runtime: OpenWorldRuntime): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const road of runtime.roads) {
    const half = road.spec.width / 2;
    parts.push(ribbon(road, -half, half, ROAD_Y, 4.5));
  }
  for (const pad of runtime.junctions) {
    const geometry = new THREE.CircleGeometry(pad.radius, 40);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(pad.center.x, PAD_Y, pad.center.z);
    applySurface(geometry, 'asphalt');
    parts.push(geometry);
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const part of parts) part.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function roadPaint(runtime: OpenWorldRuntime): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Edge lines stop at junction aprons instead of drawing across the mouth.
  const nearJunction = (a: Vec2, b: Vec2): boolean => {
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    return runtime.junctions.some(
      (pad) => Math.hypot(x - pad.center.x, z - pad.center.z) < pad.radius + 1,
    );
  };
  for (const road of runtime.roads) {
    if (road.spec.edgeLines === false) {
      // Runway: dashed centreline plus threshold keys instead of edge lines.
      const half = road.spec.width / 2;
      if (road.spec.kind === 'runway') {
        for (let i = 0; i < road.points.length - 1; i++) {
          const arc = road.arcLengths[i] ?? 0;
          if (Math.floor(arc / 30) % 2 !== 0) continue;
          const next = Math.min(i + 4, road.points.length - 1);
          const part = ribbon(road, -0.25, 0.25, PAINT_Y, 4, i, next + 1);
          parts.push(part);
        }
        for (const end of [2, road.points.length - 3]) {
          const index = Math.max(0, Math.min(road.points.length - 1, end));
          const point = road.points[index];
          const normal = road.normals[index];
          if (!point || !normal) continue;
          for (let bar = -2; bar <= 2; bar++) {
            if (bar === 0) continue;
            const offset = (bar * half) / 2.8;
            const geometry = new THREE.PlaneGeometry(0.8, 2.6);
            geometry.rotateX(-Math.PI / 2);
            geometry.rotateY(-Math.atan2(normal.z, normal.x) + Math.PI / 2);
            geometry.translate(point.x + normal.x * offset, PAINT_Y, point.z + normal.z * offset);
            parts.push(geometry);
          }
        }
      }
      continue;
    }
    const half = road.spec.width / 2;
    parts.push(
      ribbon(road, -half + 0.08, -half + 0.28, PAINT_Y, 4, 0, road.points.length, nearJunction),
    );
    parts.push(
      ribbon(road, half - 0.28, half - 0.08, PAINT_Y, 4, 0, road.points.length, nearJunction),
    );
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const part of parts) part.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function kerbSurfaces(runtime: OpenWorldRuntime): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const road of runtime.roads) {
    for (const range of road.spec.kerbs ?? []) {
      const indices: number[] = [];
      for (let i = 0; i < road.points.length; i++) {
        const arc = road.arcLengths[i] ?? 0;
        if (arc >= range.start && arc <= range.end) indices.push(i);
      }
      if (indices.length < 2) continue;
      const sides: (-1 | 1)[] =
        range.side === 'both' ? [-1, 1] : range.side === 'left' ? [-1] : [1];
      for (const side of sides) {
        const positions: number[] = [];
        const uvs: number[] = [];
        const index: number[] = [];
        const half = road.spec.width / 2;
        for (let step = 0; step < indices.length; step++) {
          const i = indices[step];
          if (i === undefined) continue;
          const point = road.points[i];
          const normal = road.normals[i];
          if (!point || !normal) continue;
          const inner = {
            x: point.x + normal.x * half * side,
            z: point.z + normal.z * half * side,
          };
          const outer = {
            x: point.x + normal.x * (half + 0.72) * side,
            z: point.z + normal.z * (half + 0.72) * side,
          };
          const v = (road.arcLengths[i] ?? 0) / 2.4;
          const base = positions.length / 3;
          positions.push(inner.x, 0.055, inner.z, outer.x, 0.055, outer.z);
          uvs.push(0, v, 1, v);
          if (step > 0) {
            index.push(base - 2, base - 1, base, base - 1, base + 1, base);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        parts.push(geometry);
      }
    }
  }
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const part of parts) part.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function barrierGeometry(style: BarrierStyle): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(x, y, z);
    return geometry;
  };
  if (style === 'guardrail') {
    parts.push(box(1, 0.32, 1, 0, 0.61, 0));
    parts.push(box(0.06, 0.82, 0.55, 0, 0.41, 0));
  } else if (style === 'stone') {
    parts.push(box(1, 0.86, 1, 0, 0.43, 0));
    parts.push(box(1, 0.14, 1.25, 0, 0.93, 0));
  } else if (style === 'timber') {
    for (const y of [0.3, 0.62, 0.94]) parts.push(box(1, 0.18, 0.55, 0, y, 0));
    parts.push(box(0.09, 1.05, 0.75, 0, 0.525, 0));
  } else {
    for (const y of [0.36, 0.72, 1.08, 1.3]) parts.push(box(1, 0.055, 0.4, 0, y, 0));
    parts.push(box(0.08, 1.4, 0.5, 0, 0.7, 0));
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function barrierMeshes(runtime: OpenWorldRuntime): THREE.Object3D[] {
  const styles: BarrierStyle[] = ['guardrail', 'stone', 'timber', 'fence'];
  const meshes: THREE.Object3D[] = [];
  for (const style of styles) {
    const segments = runtime.barriers.flatMap((barrier) =>
      barrier.spec.style === style
        ? barrier.points.slice(1).map((b, index) => ({ a: barrier.points[index], b, barrier }))
        : [],
    );
    const valid = segments.filter(
      (segment): segment is { a: Vec2; b: Vec2; barrier: (typeof segments)[number]['barrier'] } =>
        Boolean(segment.a && segment.b),
    );
    if (!valid.length) continue;
    const material =
      style === 'guardrail'
        ? surface('guardrail')
        : style === 'stone'
          ? CONCRETE
          : style === 'timber'
            ? TIMBER
            : FENCE_WIRE;
    const mesh = new THREE.InstancedMesh(barrierGeometry(style), material, valid.length);
    const dummy = new THREE.Object3D();
    valid.forEach((segment, index) => {
      const a = segment.a;
      const b = segment.b;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.05) return;
      dummy.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      dummy.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0);
      dummy.scale.set(length, segment.barrier.spec.height, segment.barrier.spec.thickness / 0.35);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = style === 'guardrail';
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

function gableGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5,
        0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 1, 3, 4, 5, 2, 5, 4, 0, 2, 3, 0, 1, 2,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function hipGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(0.72, 1, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, 0.5, 0);
  geometry.scale(1, 1, 0.72);
  geometry.computeVertexNormals();
  return geometry;
}

function monoGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, -0.5, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 5, 0, 5, 4, 3, 2, 5, 2, 1, 5]);
  geometry.computeVertexNormals();
  return geometry;
}

function buildingMeshes(runtime: OpenWorldRuntime): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const wallsByMaterial = new Map<THREE.Material, BuildingSpec[]>();
  for (const building of runtime.buildings) {
    const material =
      building.wall === 'plaster' ? PLASTER : building.wall === 'timber' ? TIMBER : CONCRETE;
    const list = wallsByMaterial.get(material) ?? [];
    list.push(building);
    wallsByMaterial.set(material, list);
  }
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  wallGeometry.translate(0, 0.5, 0);
  for (const [material, buildings] of wallsByMaterial) {
    const mesh = new THREE.InstancedMesh(wallGeometry, material, buildings.length);
    const dummy = new THREE.Object3D();
    buildings.forEach((building, index) => {
      dummy.position.set(building.center.x, building.baseY ?? 0, building.center.z);
      dummy.rotation.set(0, -building.angle, 0);
      dummy.scale.set(building.size.x, building.wallHeight, building.size.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objects.push(mesh);
  }

  const roofsByKind = new Map<string, BuildingSpec[]>();
  for (const building of runtime.buildings) {
    const list = roofsByKind.get(building.roof) ?? [];
    list.push(building);
    roofsByKind.set(building.roof, list);
  }
  for (const [kind, buildings] of roofsByKind) {
    const geometry =
      kind === 'gable'
        ? gableGeometry()
        : kind === 'hip'
          ? hipGeometry()
          : kind === 'mono'
            ? monoGeometry()
            : new THREE.BoxGeometry(1, 1, 1);
    if (kind === 'flat') geometry.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(
      geometry,
      kind === 'gable' || kind === 'mono' ? TERRACOTTA : SLATE,
      buildings.length,
    );
    const dummy = new THREE.Object3D();
    buildings.forEach((building, index) => {
      dummy.position.set(
        building.center.x,
        (building.baseY ?? 0) + building.wallHeight,
        building.center.z,
      );
      dummy.rotation.set(0, -building.angle, 0);
      dummy.scale.set(
        building.size.x * 1.06,
        Math.max(0.4, building.roofHeight),
        building.size.z * 1.06,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objects.push(mesh);
  }

  // A dark door and two windows give every ground-level wall a readable front.
  const openings: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (const building of runtime.buildings) {
    if (!building.solid || building.kind === 'tower' || building.kind === 'deck') continue;
    const localZ = building.size.z / 2 + 0.02;
    const cos = Math.cos(building.angle);
    const sin = Math.sin(building.angle);
    const place = (offsetX: number, y: number, width: number, height: number) => {
      dummy.position.set(
        building.center.x - sin * localZ + cos * offsetX,
        (building.baseY ?? 0) + y,
        building.center.z + cos * localZ + sin * offsetX,
      );
      dummy.rotation.set(0, -building.angle, 0);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      openings.push(dummy.matrix.clone());
    };
    place(0, 1.25, 1.9, 2.5);
    if (building.size.x > 7 && building.wallHeight > 3) {
      place(-building.size.x * 0.27, building.wallHeight * 0.62, 1.2, 1.25);
      place(building.size.x * 0.27, building.wallHeight * 0.62, 1.2, 1.25);
    }
  }
  if (openings.length) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geometry, DARK, openings.length);
    openings.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    objects.push(mesh);
  }
  return objects;
}

function treeMeshes(runtime: OpenWorldRuntime): THREE.Object3D[] {
  const chunks = new Map<string, TreeSpec[]>();
  for (const tree of runtime.trees) {
    const key = `${Math.floor(tree.position.x / CHUNK_METRES)}:${Math.floor(tree.position.z / CHUNK_METRES)}`;
    const list = chunks.get(key) ?? [];
    list.push(tree);
    chunks.set(key, list);
  }
  const objects: THREE.Object3D[] = [];
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.32, 3.6, 6);
  trunkGeometry.translate(0, 1.8, 0);
  const canopyGeometry = new THREE.IcosahedronGeometry(1.7, 1);
  const dummy = new THREE.Object3D();
  for (const trees of chunks.values()) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, TRUNK, trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeometry, CANOPY, trees.length);
    trees.forEach((tree, index) => {
      const scale = tree.scale;
      const rotation =
        (tree.variant * 1.7 + tree.position.x * 0.013 + tree.position.z * 0.007) % (Math.PI * 2);
      dummy.position.set(tree.position.x, 0, tree.position.z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(tree.position.x, 4.0 * scale, tree.position.z);
      dummy.scale.set(scale * 1.05, scale * 1.25, scale * 1.05);
      dummy.rotation.set(0, rotation * 1.7, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(index, dummy.matrix);
      const shade = 0.82 + ((tree.id.charCodeAt(0) + index * 7) % 17) / 100;
      canopies.setColorAt(index, new THREE.Color(shade * 0.86, shade, shade * 0.74));
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    trunks.castShadow = false;
    canopies.castShadow = true;
    canopies.receiveShadow = true;
    objects.push(trunks, canopies);
  }
  return objects;
}

function rockMeshes(runtime: OpenWorldRuntime): THREE.Object3D[] {
  if (!runtime.spec.rocks.length) return [];
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, ROCK, runtime.spec.rocks.length);
  const dummy = new THREE.Object3D();
  runtime.spec.rocks.forEach((rock, index) => {
    dummy.position.set(rock.position.x, rock.height * 0.4, rock.position.z);
    dummy.rotation.set(rock.variant * 0.4, rock.variant * 1.7, rock.variant * 0.2);
    dummy.scale.set(rock.radius, rock.height * 0.7, rock.radius * 0.9);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return [mesh];
}

function signTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#e8e6dc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#2b2f33';
    context.lineWidth = 8;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = '#20242a';
    context.font = 'bold 42px "Barlow Condensed", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface CylinderInstance {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly baseY: number;
}

function cylinderMesh(
  instances: readonly CylinderInstance[],
  material: THREE.Material,
): THREE.InstancedMesh | null {
  if (!instances.length) return null;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 14);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  const dummy = new THREE.Object3D();
  instances.forEach((instance, index) => {
    dummy.position.set(instance.x, instance.baseY, instance.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(instance.radius, instance.height, instance.radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function propMeshes(runtime: OpenWorldRuntime): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const steelCylinders: CylinderInstance[] = [];
  const concreteCylinders: CylinderInstance[] = [];
  const towerLegs: { x: number; z: number }[] = [];
  const siloCaps: { x: number; z: number; radius: number; height: number; y: number }[] = [];
  const signPanels: { position: Vec2; angle: number; scale: number; label: string }[] = [];

  for (const prop of runtime.spec.props) {
    const scale = prop.scale;
    if (prop.kind === 'silo') {
      steelCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 2.4 * scale,
        height: 14 * scale,
        baseY: 0,
      });
      siloCaps.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 2.4 * scale,
        height: 0.7 * scale,
        y: 14 * scale,
      });
    } else if (prop.kind === 'fuel-tank') {
      steelCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 1.5 * scale,
        height: 6 * scale,
        baseY: 0,
      });
    } else if (prop.kind === 'bollard') {
      concreteCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 0.16,
        height: 0.95,
        baseY: 0,
      });
    } else if (prop.kind === 'windsock') {
      steelCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 0.1,
        height: 5,
        baseY: 0,
      });
      const sock = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 2.2, 10, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0xe06a2a,
          roughness: 0.8,
          side: THREE.DoubleSide,
        }),
      );
      sock.rotation.z = Math.PI / 2;
      sock.rotation.y = -prop.angle;
      sock.position.set(
        prop.position.x + Math.cos(prop.angle),
        4.6,
        prop.position.z + Math.sin(prop.angle),
      );
      objects.push(sock);
    } else if (prop.kind === 'water-tower') {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          towerLegs.push({
            x: prop.position.x + sx * 1.8,
            z: prop.position.z + sz * 1.8,
          });
        }
      }
      steelCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 2.9 * scale,
        height: 3.2 * scale,
        baseY: 12.6,
      });
    } else if (prop.label) {
      steelCylinders.push({
        x: prop.position.x,
        z: prop.position.z,
        radius: 0.08,
        height: 2.4,
        baseY: 0,
      });
      signPanels.push({
        position: prop.position,
        angle: prop.angle,
        scale: prop.scale,
        label: prop.label,
      });
    }
  }

  const steel = cylinderMesh(steelCylinders, STEEL);
  if (steel) objects.push(steel);
  const concrete = cylinderMesh(concreteCylinders, CONCRETE);
  if (concrete) objects.push(concrete);

  if (siloCaps.length) {
    const geometry = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geometry, STEEL, siloCaps.length);
    const dummy = new THREE.Object3D();
    siloCaps.forEach((cap, index) => {
      dummy.position.set(cap.x, cap.y, cap.z);
      dummy.scale.set(cap.radius, cap.height, cap.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    objects.push(mesh);
  }

  if (towerLegs.length) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, STEEL, towerLegs.length);
    const dummy = new THREE.Object3D();
    towerLegs.forEach((leg, index) => {
      dummy.position.set(leg.x, 6, leg.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.32, 12, 0.32);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    objects.push(mesh);
  }

  for (const panel of signPanels) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6 * panel.scale, 1.0 * panel.scale),
      new THREE.MeshStandardMaterial({ map: signTexture(panel.label), roughness: 0.8 }),
    );
    mesh.position.set(panel.position.x, 2.2, panel.position.z);
    mesh.rotation.y = -panel.angle;
    objects.push(mesh);
  }
  return objects;
}

const COLLIDER_COLORS: Record<string, number> = {
  barrier: 0xff9a3c,
  building: 0x58d7ff,
  tree: 0x7dff70,
  rock: 0xffe05a,
  prop: 0xff6ad5,
  'world-edge': 0xff4040,
};

function colliderOverlay(runtime: OpenWorldRuntime): THREE.LineSegments {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const push = (a: Vec2, b: Vec2, y0: number, y1: number) => {
    positions.push(a.x, y0, a.z, b.x, y0, b.z);
    positions.push(a.x, y0, a.z, a.x, y1, a.z);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  };
  for (const collider of runtime.colliders) {
    color.setHex(COLLIDER_COLORS[collider.kind] ?? 0xffffff);
    const height = Math.max(0.4, Math.min(8, collider.height));
    if (collider.shape.type === 'circle') {
      const { center, radius } = collider.shape;
      const segments = 10;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = { x: center.x + Math.cos(a0) * radius, z: center.z + Math.sin(a0) * radius };
        const p1 = { x: center.x + Math.cos(a1) * radius, z: center.z + Math.sin(a1) * radius };
        positions.push(p0.x, 0.06, p0.z, p1.x, 0.06, p1.z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      positions.push(center.x, 0.06, center.z, center.x, height, center.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    } else {
      const { center, halfX, halfZ, angle } = collider.shape;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        { x: center.x - cos * halfX + sin * halfZ, z: center.z - sin * halfX - cos * halfZ },
        { x: center.x + cos * halfX + sin * halfZ, z: center.z + sin * halfX - cos * halfZ },
        { x: center.x + cos * halfX - sin * halfZ, z: center.z + sin * halfX + cos * halfZ },
        { x: center.x - cos * halfX - sin * halfZ, z: center.z - sin * halfX + cos * halfZ },
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        if (!a || !b) continue;
        push(a, b, 0.06, height);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

/** Distant non-collidable peaks that frame the valley; they sit outside the fence. */
function mountainBackdrop(): THREE.Group {
  const group = new THREE.Group();
  const bodies: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  let seed = 0x51f15e;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
  const peaks = 30;
  for (let i = 0; i < peaks; i++) {
    const angle = (i / peaks) * Math.PI * 2 + (random() - 0.5) * 0.12;
    const radiusX = 2600 + random() * 520;
    const radiusZ = 2100 + random() * 420;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    const height = 160 + random() * 210;
    const base = 250 + random() * 170;
    const body = new THREE.ConeGeometry(base, height, 7, 1);
    const spin = random() * Math.PI;
    body.rotateY(spin);
    body.translate(x, height / 2 - 6, z);
    bodies.push(body);
    if (height > 300) {
      const cap = new THREE.ConeGeometry(base * 0.3, height * 0.24, 7, 1);
      cap.rotateY(spin);
      cap.translate(x, height - height * 0.12 - 6, z);
      caps.push(cap);
    }
  }
  const bodyMesh = new THREE.Mesh(
    mergeGeometries(bodies),
    new THREE.MeshStandardMaterial({ color: 0x7b8da0, roughness: 1, flatShading: true }),
  );
  bodyMesh.receiveShadow = false;
  group.add(bodyMesh);
  if (caps.length) {
    const capMesh = new THREE.Mesh(
      mergeGeometries(caps),
      new THREE.MeshStandardMaterial({ color: 0xdde7ee, roughness: 0.95, flatShading: true }),
    );
    group.add(capMesh);
  }
  for (const geometry of [...bodies, ...caps]) geometry.dispose();
  return group;
}

export function buildOpenWorldScene(runtime: OpenWorldRuntime, renderer: THREE.WebGLRenderer) {
  const { scene, sun, sunDirection } = buildSkyAndSun(renderer);
  scene.fog = new THREE.Fog(0x9db9d6, 1100, 3900);
  const group = new THREE.Group();
  scene.add(group);

  const groundGeometry = new THREE.PlaneGeometry(5200, 5200);
  groundGeometry.rotateX(-Math.PI / 2);
  applySurface(groundGeometry, 'grass');
  const ground = new THREE.Mesh(groundGeometry, GRASS);
  ground.position.y = -0.09;
  ground.receiveShadow = true;
  group.add(ground);
  group.add(mountainBackdrop());

  const patchMaterials: Record<string, THREE.Material> = {
    dirt: DIRT,
    mown: MOWN,
    paddock: PADDOCK,
    gravel: GRAVEL,
  };
  const patchesByKind = new Map<string, THREE.BufferGeometry[]>();
  for (const patch of runtime.spec.groundPatches) {
    const geometry = new THREE.PlaneGeometry(patch.size.x, patch.size.z);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-patch.angle);
    geometry.translate(patch.center.x, 0.003, patch.center.z);
    const list = patchesByKind.get(patch.kind) ?? [];
    list.push(geometry);
    patchesByKind.set(patch.kind, list);
  }
  for (const [kind, geometries] of patchesByKind) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, patchMaterials[kind] ?? MOWN);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const roads = new THREE.Mesh(roadSurface(runtime), ASPHALT);
  roads.receiveShadow = true;
  group.add(roads);

  const paint = new THREE.Mesh(roadPaint(runtime), WHITE);
  paint.receiveShadow = true;
  group.add(paint);

  const kerbGeometry = kerbSurfaces(runtime);
  if (kerbGeometry.getAttribute('position').count > 0) {
    const kerbs = new THREE.Mesh(kerbGeometry, KERB);
    kerbs.receiveShadow = true;
    group.add(kerbs);
  }

  for (const object of barrierMeshes(runtime)) group.add(object);

  const building = new THREE.Group();
  for (const object of buildingMeshes(runtime)) building.add(object);
  group.add(building);

  for (const object of treeMeshes(runtime)) group.add(object);
  for (const object of rockMeshes(runtime)) group.add(object);
  for (const object of propMeshes(runtime)) group.add(object);

  const overlay = colliderOverlay(runtime);
  scene.add(overlay);

  return {
    scene,
    colliderCount: runtime.colliders.length,
    debugVisible(): boolean {
      return overlay.visible;
    },
    setDebugVisible(visible: boolean) {
      overlay.visible = visible;
    },
    toggleDebug(): boolean {
      overlay.visible = !overlay.visible;
      return overlay.visible;
    },
    moveShadowFocus(x: number, z: number) {
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
      sun.position.set(x + sunDirection.x * 75, sunDirection.y * 75, z + sunDirection.z * 75);
    },
  };
}

export type OpenWorldScene = ReturnType<typeof buildOpenWorldScene>;
