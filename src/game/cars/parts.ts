import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PartMaterial =
  | 'paint'
  | 'trim'
  | 'glass'
  | 'interior'
  | 'chrome'
  | 'alloy'
  | 'darkAlloy'
  | 'lamp'
  | 'amber'
  | 'tail'
  | 'brake'
  | 'reverse'
  | 'disc'
  | 'caliper'
  | 'plate';

const scratch = new THREE.Object3D();

/**
 * Collects a model's static pieces by material and merges each material into one mesh,
 * so a car is a handful of draw calls however many pieces it is built from.
 */
export function createParts() {
  const byMaterial = new Map<PartMaterial, THREE.BufferGeometry[]>();
  const triangles = new Map<PartMaterial, number[]>();

  function push(material: PartMaterial, geometry: THREE.BufferGeometry) {
    let source = geometry.index ? geometry.toNonIndexed() : geometry;
    if (source !== geometry) geometry.dispose();
    if (source.hasAttribute('uv')) source = source.deleteAttribute('uv');
    const list = byMaterial.get(material);
    if (list) list.push(source);
    else byMaterial.set(material, [source]);
  }

  const api = {
    /** Adds `geometry` (consumed) placed at a position with an optional rotation. */
    add(
      material: PartMaterial,
      geometry: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) {
      scratch.position.set(x, y, z);
      scratch.rotation.set(rx, ry, rz);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      geometry.applyMatrix4(scratch.matrix);
      push(material, geometry);
    },

    box(
      material: PartMaterial,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) {
      api.add(material, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
    },

    /** Cylinder along Z (lamps, exhausts) unless rotated. */
    tube(
      material: PartMaterial,
      radius: number,
      length: number,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
    ) {
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 18);
      geometry.rotateX(Math.PI / 2);
      api.add(material, geometry, x, y, z, rx, ry);
    },

    /** Ellipsoid with the given half-extents. */
    blob(
      material: PartMaterial,
      sx: number,
      sy: number,
      sz: number,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
    ) {
      const geometry = new THREE.SphereGeometry(1, 16, 10);
      geometry.scale(sx, sy, sz);
      api.add(material, geometry, x, y, z, rx, ry);
    },

    /** One triangle of a hand-built surface; smoothed per material in `build`. */
    triangle(material: PartMaterial, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
      let list = triangles.get(material);
      if (!list) {
        list = [];
        triangles.set(material, list);
      }
      list.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    },

    /** Welds and smooths the hand-built surfaces so far, keeping them apart from later ones. */
    sealSurfaces() {
      for (const [material, list] of triangles) {
        const raw = new THREE.BufferGeometry();
        raw.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
        const welded = mergeVertices(raw, 1e-4);
        welded.computeVertexNormals();
        raw.dispose();
        push(material, welded);
      }
      triangles.clear();
    },

    build(materials: Readonly<Record<PartMaterial, THREE.Material>>): THREE.Group {
      api.sealSurfaces();
      const group = new THREE.Group();
      for (const [material, list] of byMaterial) {
        const merged = mergeGeometries(list, false);
        for (const geometry of list) geometry.dispose();
        const mesh = new THREE.Mesh(merged, materials[material]);
        mesh.castShadow = material !== 'glass';
        mesh.receiveShadow = material !== 'glass';
        if (material === 'glass') mesh.renderOrder = 2;
        group.add(mesh);
      }
      byMaterial.clear();
      return group;
    },
  };
  return api;
}

export type Parts = ReturnType<typeof createParts>;
