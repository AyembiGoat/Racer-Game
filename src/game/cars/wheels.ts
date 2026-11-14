import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surface } from '../materials';

export interface WheelStyle {
  readonly spokes: number;
  /** Spoke width at the hub, metres. */
  readonly spokeWidth: number;
  /** Paired spokes lean toward each other in twos, as on a cross-spoke wheel. */
  readonly paired: boolean;
  readonly finish: 'alloy' | 'darkAlloy';
  readonly caliper: number;
}

export interface WheelSize {
  readonly radius: number;
  readonly width: number;
  readonly rimRadius: number;
}

export interface WheelMaterials {
  readonly alloy: THREE.Material;
  readonly darkAlloy: THREE.Material;
  readonly trim: THREE.Material;
  readonly disc: THREE.Material;
  readonly caliper: THREE.Material;
}

/** Geometry for one wheel size, shared by the wheels on that axle. Outer face is +X. */
export function buildWheelGeometry(size: WheelSize, style: WheelStyle) {
  const { radius: R, width: w, rimRadius: rim } = size;
  const half = w / 2;

  // Tyre: sidewalls bulge slightly and the shoulders are rounded.
  const profile = [
    new THREE.Vector2(rim, -half + 0.018),
    new THREE.Vector2(rim + (R - rim) * 0.55, -half),
    new THREE.Vector2(R - 0.022, -half + 0.012),
    new THREE.Vector2(R, -half + 0.045),
    new THREE.Vector2(R, half - 0.045),
    new THREE.Vector2(R - 0.022, half - 0.012),
    new THREE.Vector2(rim + (R - rim) * 0.55, half),
    new THREE.Vector2(rim, half - 0.018),
  ];
  const tyre = new THREE.LatheGeometry(profile, 32);
  tyre.rotateZ(-Math.PI / 2);

  const rimParts: THREE.BufferGeometry[] = [];
  const darkParts: THREE.BufferGeometry[] = [];

  // Rim lip and barrel.
  const lip = new THREE.LatheGeometry(
    [
      new THREE.Vector2(rim + 0.004, half - 0.02),
      new THREE.Vector2(rim + 0.006, half - 0.004),
      new THREE.Vector2(rim - 0.012, half - 0.002),
      new THREE.Vector2(rim - 0.02, half - 0.03),
    ],
    32,
  );
  lip.rotateZ(-Math.PI / 2);
  rimParts.push(lip.toNonIndexed());
  lip.dispose();
  const barrel = new THREE.CylinderGeometry(rim - 0.02, rim - 0.02, w * 0.86, 28, 1, true);
  barrel.rotateZ(Math.PI / 2);
  darkParts.push(barrel.toNonIndexed());
  barrel.dispose();
  const back = new THREE.CircleGeometry(rim - 0.02, 28);
  back.rotateY(Math.PI / 2);
  back.translate(-half + 0.04, 0, 0);
  darkParts.push(back.toNonIndexed());
  back.dispose();

  // Spokes run from the hub to the rim, set back from the lip.
  const faceX = half - 0.045;
  const hubRadius = 0.062;
  const spokeLength = rim - 0.022 - hubRadius * 0.6;
  for (let i = 0; i < style.spokes; i++) {
    const spoke = new THREE.BoxGeometry(0.022, spokeLength, style.spokeWidth);
    // Taper toward the rim.
    const position = spoke.getAttribute('position');
    for (let v = 0; v < position.count; v++) {
      if (position.getY(v) > 0) position.setZ(v, position.getZ(v) * 0.62);
    }
    spoke.translate(0, hubRadius * 0.6 + spokeLength / 2, 0);
    const angle = (i / style.spokes) * Math.PI * 2;
    if (style.paired) {
      spoke.translate(0, -hubRadius * 0.6, 0);
      spoke.rotateX(i % 2 === 0 ? 0.2 : -0.2);
      spoke.translate(0, hubRadius * 0.6, 0);
    }
    spoke.rotateX(angle);
    spoke.translate(faceX, 0, 0);
    rimParts.push(spoke.toNonIndexed());
    spoke.dispose();
  }
  const hub = new THREE.CylinderGeometry(hubRadius, hubRadius * 1.15, 0.04, 20);
  hub.rotateZ(-Math.PI / 2);
  hub.translate(faceX + 0.008, 0, 0);
  rimParts.push(hub.toNonIndexed());
  hub.dispose();
  const cap = new THREE.CylinderGeometry(0.028, 0.03, 0.014, 16);
  cap.rotateZ(-Math.PI / 2);
  cap.translate(faceX + 0.034, 0, 0);
  darkParts.push(cap.toNonIndexed());
  cap.dispose();

  const strip = (list: THREE.BufferGeometry[]) => {
    for (const geometry of list) geometry.deleteAttribute('uv');
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    return merged;
  };

  // Brake: disc behind the spokes and a caliper that does not turn with the wheel.
  const discRadius = Math.min(rim - 0.045, 0.19);
  const disc = new THREE.CylinderGeometry(discRadius, discRadius, 0.024, 28);
  disc.rotateZ(Math.PI / 2);
  disc.translate(faceX - 0.06, 0, 0);
  const caliper = new THREE.BoxGeometry(0.06, discRadius * 0.95, 0.075);
  caliper.translate(faceX - 0.058, 0, 0);
  // Sit over the rear upper edge of the disc.
  caliper.translate(0, 0, discRadius - 0.03);
  caliper.rotateX(-0.45);

  return { tyre, rim: strip(rimParts), dark: strip(darkParts), disc, caliper, style };
}

export type WheelGeometry = ReturnType<typeof buildWheelGeometry>;

/**
 * One wheel: `spin` turns with the road, the brake stays with the hub.
 * `side` is +1 for the right of the car, -1 for the left.
 */
export function buildWheel(geometry: WheelGeometry, materials: WheelMaterials, side: number) {
  const hub = new THREE.Group();
  if (side < 0) hub.rotation.y = Math.PI;
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(geometry.tyre, surface('tyre-rubber'));
  tyre.castShadow = true;
  const rim = new THREE.Mesh(geometry.rim, materials[geometry.style.finish]);
  rim.castShadow = true;
  spin.add(tyre, rim, new THREE.Mesh(geometry.dark, materials.trim));
  hub.add(
    spin,
    new THREE.Mesh(geometry.disc, materials.disc),
    new THREE.Mesh(geometry.caliper, materials.caliper),
  );
  return { hub, spin, spinSign: side < 0 ? -1 : 1 };
}
