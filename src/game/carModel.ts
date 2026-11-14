import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_TUNING } from '../core/car';
import { surface } from './materials';

/**
 * Collapse every static mesh in a group into one mesh per material. The car is
 * built from ~70 small boxes and cylinders; merging cuts its draw calls by
 * roughly two thirds without changing a pixel. Only meshes sharing a material
 * and standard attributes are merged, and animation pivots stay groups.
 */
function mergeByMaterial(group: THREE.Group): void {
  const buckets = new Map<
    THREE.Material,
    { geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }
  >();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const material = mesh.material;
    const geometry = mesh.geometry;
    const bucket = buckets.get(material) ?? {
      geometries: [],
      meshes: [],
      cast: false,
      receive: false,
    };
    mesh.updateMatrix();
    bucket.geometries.push(geometry.clone().applyMatrix4(mesh.matrix));
    bucket.meshes.push(mesh);
    bucket.cast ||= mesh.castShadow;
    bucket.receive ||= mesh.receiveShadow;
    buckets.set(material, bucket);
  }
  for (const [material, bucket] of buckets) {
    if (bucket.meshes.length < 2) {
      for (const geometry of bucket.geometries) geometry.dispose();
      continue;
    }
    const merged = mergeGeometries(bucket.geometries);
    for (const geometry of bucket.geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    for (const original of bucket.meshes) group.remove(original);
    group.add(mesh);
  }
}

export interface CarVisualState {
  readonly steerAngle: number;
  readonly wheelSpin: number;
  readonly braking: boolean;
  readonly reversing: boolean;
  readonly pitch: number;
  readonly roll: number;
}

/**
 * Code-built 1989 BMW M3 (E30) coupe matched to `CAR_TUNING` and
 * `reference/bmw-m3-e30.png`: crimson paint, flared box arches, matte-black
 * bumper rub strips, sloped tinted glasshouse, raised rear wing, split tail
 * lights and multi-spoke silver alloy wheels.
 */
export function buildCarModel() {
  const root = new THREE.Group();
  // Sprung bodywork tilts with pitch and roll while wheels stay planted on y = 0.
  const body = new THREE.Group();
  root.add(body);

  const paintMaterial = new THREE.MeshStandardMaterial({
    color: 0xc41919,
    roughness: 0.24,
    metalness: 0.14,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.78,
    metalness: 0.05,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d262e,
    roughness: 0.1,
    metalness: 0.25,
  });
  const interiorMaterial = new THREE.MeshStandardMaterial({
    color: 0x24262a,
    roughness: 0.9,
  });
  const alloyMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5dade,
    roughness: 0.28,
    metalness: 0.72,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e6ec,
    roughness: 0.18,
    metalness: 0.88,
  });
  const headlampMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2f4f8,
    emissive: 0x22201a,
    roughness: 0.15,
  });
  const amberMaterial = new THREE.MeshStandardMaterial({
    color: 0xd46b12,
    roughness: 0.35,
  });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c1414,
    emissive: 0x180202,
    roughness: 0.32,
  });
  const reverseLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcdde0,
    emissive: 0x000000,
    roughness: 0.35,
  });
  const tyreMaterial = surface('tyre-rubber');

  const W = CAR_TUNING.width;
  const L = CAR_TUNING.length;
  const halfW = W / 2;
  const halfL = L / 2;
  const halfWB = CAR_TUNING.wheelbase / 2;
  const R = CAR_TUNING.wheelRadius;

  const castAndReceive = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Narrow undertray so open wheel arches never intersect turning front tyres.
  const undertray = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.56, 0.36, L - 0.18), trimMaterial),
  );
  undertray.position.y = 0.36;
  body.add(undertray);

  // Side sills between front and rear wheel wells.
  const sillLen = CAR_TUNING.wheelbase - R * 2 - 0.14;
  const sill = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.22, sillLen), paintMaterial),
  );
  sill.position.y = 0.29;
  body.add(sill);

  // Waistline belt above the wheel arches running full length.
  const beltBottom = R * 2 + 0.03;
  const beltHeight = 0.25;
  const waist = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, beltHeight, L - 0.06), paintMaterial),
  );
  waist.position.y = beltBottom + beltHeight / 2;
  body.add(waist);

  // Flared E30 M3 box wheel-arch blisters over all four corners.
  const flareGeo = new THREE.BoxGeometry(0.07, 0.24, R * 2 + 0.26);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const flare = castAndReceive(new THREE.Mesh(flareGeo, paintMaterial));
      flare.position.set(sx * (halfW - 0.02), beltBottom + 0.09, sz * halfWB);
      body.add(flare);
    }
  }

  // Front nose valence and rear lower apron outside the wheel wells.
  const frontOverhang = halfL - halfWB - R - 0.06;
  const frontValence = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.36, frontOverhang), paintMaterial),
  );
  frontValence.position.set(0, 0.42, -(halfL - frontOverhang / 2));
  body.add(frontValence);

  const rearOverhang = halfL - halfWB - R - 0.04;
  const rearValence = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.32, rearOverhang), paintMaterial),
  );
  rearValence.position.set(0, 0.46, halfL - rearOverhang / 2);
  body.add(rearValence);

  // Wrap-around matte-black E30 bumper rub strips.
  const frontBumper = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.1, 0.14), trimMaterial),
  );
  frontBumper.position.set(0, 0.48, -halfL - 0.02);
  const rearBumper = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.11, 0.15), trimMaterial),
  );
  rearBumper.position.set(0, 0.5, halfL + 0.02);
  const sideRubGeo = new THREE.BoxGeometry(W - 0.03, 0.045, sillLen + 0.08);
  const sideRub = new THREE.Mesh(sideRubGeo, trimMaterial);
  sideRub.position.set(0, 0.5, 0);
  body.add(frontBumper, rearBumper, sideRub);

  // Tapered three-box greenhouse (sloped windscreen, flat coupe roof, raked C-pillar).
  const cabinBottom = beltBottom + beltHeight - 0.01;
  const cabinHeight = 0.45;
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-0.88, 0);
  cabinShape.lineTo(1.06, 0);
  cabinShape.lineTo(0.68, cabinHeight);
  cabinShape.lineTo(-0.46, cabinHeight);
  cabinShape.closePath();

  const cabinWidth = W * 0.78;
  const glassGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: cabinWidth,
    bevelEnabled: false,
  });
  // Extrude runs along +Z; rotate so the side profile lies in YZ (+Z rear, -Z front).
  glassGeo.rotateY(-Math.PI / 2);
  glassGeo.translate(cabinWidth / 2, cabinBottom, 0.12);
  const greenhouse = castAndReceive(new THREE.Mesh(glassGeo, glassMaterial));
  body.add(greenhouse);

  // Painted roof cap and C-pillar trim over the glasshouse.
  const roofCap = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(cabinWidth + 0.03, 0.045, 1.16), paintMaterial),
  );
  roofCap.position.set(0, cabinBottom + cabinHeight + 0.005, 0.23);
  body.add(roofCap);

  // Two interior front-seat headrests visible through the rear glass.
  const headrestGeo = new THREE.BoxGeometry(0.22, 0.18, 0.1);
  for (const sx of [-0.3, 0.3]) {
    const rest = new THREE.Mesh(headrestGeo, interiorMaterial);
    rest.position.set(sx, cabinBottom + 0.2, 0.25);
    body.add(rest);
  }

  // Wing mirrors on both doors.
  const mirrorGeo = new THREE.BoxGeometry(0.14, 0.09, 0.1);
  for (const sx of [-1, 1]) {
    const mirror = castAndReceive(new THREE.Mesh(mirrorGeo, paintMaterial));
    mirror.position.set(sx * (halfW + 0.04), cabinBottom + 0.07, -0.56);
    body.add(mirror);
  }

  // Iconic E30 M3 raised rear decklid wing.
  const wingY = beltBottom + beltHeight + 0.11;
  const wingZ = halfL - 0.2;
  const wingBlade = castAndReceive(
    new THREE.Mesh(new THREE.BoxGeometry(W - 0.14, 0.04, 0.22), paintMaterial),
  );
  wingBlade.position.set(0, wingY, wingZ);
  const strutGeo = new THREE.BoxGeometry(0.05, 0.12, 0.2);
  for (const sx of [-1, 1]) {
    const strut = castAndReceive(new THREE.Mesh(strutGeo, paintMaterial));
    strut.position.set(sx * (halfW - 0.12), wingY - 0.055, wingZ);
    body.add(strut);
  }
  body.add(wingBlade);

  // Rear fascia: recessed number-plate panel, split tail lights, twin left exhaust tips.
  const tailY = beltBottom + beltHeight * 0.52;
  const tailZ = halfL - 0.015;
  const platePanel = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.03), trimMaterial);
  platePanel.position.set(0, tailY, tailZ);
  body.add(platePanel);

  for (const sx of [-1, 1]) {
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.035), amberMaterial);
    indicator.position.set(sx * (halfW - 0.13), tailY, tailZ);
    const brakeLamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.035), brakeLightMaterial);
    brakeLamp.position.set(sx * (halfW - 0.305), tailY, tailZ);
    const revLamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.035), reverseLightMaterial);
    revLamp.position.set(sx * (halfW - 0.465), tailY, tailZ);
    body.add(indicator, brakeLamp, revLamp);
  }

  const exhaustGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.22, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  for (const dx of [-0.52, -0.43]) {
    const tip = new THREE.Mesh(exhaustGeo, chromeMaterial);
    tip.position.set(dx, 0.33, halfL + 0.04);
    body.add(tip);
  }

  // Front fascia: full-width black grille, chrome twin-kidney centre, quad round headlamps.
  const frontY = beltBottom + beltHeight * 0.48;
  const frontZ = -halfL + 0.015;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 0.15, 0.04), trimMaterial);
  grille.position.set(0, frontY, frontZ);
  body.add(grille);

  for (const sx of [-0.075, 0.075]) {
    const kidney = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), chromeMaterial);
    kidney.position.set(sx, frontY, frontZ - 0.005);
    body.add(kidney);
  }

  const lampGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.04, 14);
  lampGeo.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const offset of [0.58, 0.42]) {
      const lamp = new THREE.Mesh(lampGeo, headlampMaterial);
      lamp.position.set(sx * offset, frontY, frontZ - 0.008);
      body.add(lamp);
    }
  }

  // Wheels: treaded tyre + stepped alloy rim + crossed multi-spoke insert.
  const wheelWidth = 0.235;
  const tyreGeo = new THREE.CylinderGeometry(R, R, wheelWidth, 24);
  tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(R * 0.68, R * 0.68, wheelWidth + 0.012, 20);
  rimGeo.rotateZ(Math.PI / 2);
  const wellGeo = new THREE.CylinderGeometry(R * 0.56, R * 0.56, wheelWidth + 0.018, 16);
  wellGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(wheelWidth + 0.024, R * 1.18, 0.034);
  const capGeo = new THREE.CylinderGeometry(0.055, 0.055, wheelWidth + 0.03, 12);
  capGeo.rotateZ(Math.PI / 2);

  mergeByMaterial(body);

  const makeWheel = () => {
    const spinGroup = new THREE.Group();
    const tyre = castAndReceive(new THREE.Mesh(tyreGeo, tyreMaterial));
    const rim = new THREE.Mesh(rimGeo, alloyMaterial);
    const well = new THREE.Mesh(wellGeo, trimMaterial);
    spinGroup.add(tyre, rim, well);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(spokeGeo, alloyMaterial);
      spoke.rotation.x = (i * Math.PI) / 4;
      spinGroup.add(spoke);
    }
    spinGroup.add(new THREE.Mesh(capGeo, trimMaterial));
    mergeByMaterial(spinGroup);
    return spinGroup;
  };

  const halfTrack = halfW - wheelWidth / 2 - 0.015;
  const flSteer = new THREE.Group();
  flSteer.position.set(-halfTrack, R, -halfWB);
  const flSpin = makeWheel();
  flSteer.add(flSpin);

  const frSteer = new THREE.Group();
  frSteer.position.set(halfTrack, R, -halfWB);
  const frSpin = makeWheel();
  frSteer.add(frSpin);

  const rlSpin = makeWheel();
  rlSpin.position.set(-halfTrack, R, halfWB);

  const rrSpin = makeWheel();
  rrSpin.position.set(halfTrack, R, halfWB);

  root.add(flSteer, frSteer, rlSpin, rrSpin);

  return {
    root,
    update(visual: CarVisualState) {
      body.rotation.x = visual.pitch;
      body.rotation.z = visual.roll;
      for (const pivot of [flSteer, frSteer]) {
        pivot.rotation.y = -visual.steerAngle;
      }
      for (const wheel of [flSpin, frSpin, rlSpin, rrSpin]) {
        wheel.rotation.x = -visual.wheelSpin;
      }
      brakeLightMaterial.color.setHex(visual.braking ? 0xff2b1c : 0x7c1414);
      brakeLightMaterial.emissive.setHex(visual.braking ? 0xc81808 : 0x180202);
      reverseLightMaterial.emissive.setHex(visual.reversing ? 0x66686c : 0x000000);
    },
  };
}

/** Four-angle studio sheet (`?car`) for checking proportions and wheel clearance. */
export function showCar(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.autoClear = false;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfd4da);
  scene.add(new THREE.HemisphereLight(0xf4f7fc, 0x7c8086, 1.35));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.6);
  key.position.set(6, 9, 7);
  scene.add(key);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0xbac0c8, roughness: 0.92 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const car = buildCarModel();
  car.update({
    steerAngle: -0.28,
    wheelSpin: 0.4,
    braking: true,
    reversing: false,
    pitch: 0,
    roll: 0,
  });
  scene.add(car.root);

  const views: readonly [number, number, number][] = [
    [3.8, 1.7, 4.4],
    [-4.2, 1.5, -3.9],
    [5.2, 1.25, 0],
    [0, 6.2, 0.01],
  ];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const cam = new THREE.PerspectiveCamera(40, halfW / halfH, 0.1, 60);

  renderer.clear();
  views.forEach(([x, y, z], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    renderer.setViewport(col * halfW, (1 - row) * halfH, halfW, halfH);
    renderer.setScissor(col * halfW, (1 - row) * halfH, halfW, halfH);
    renderer.setScissorTest(true);
    cam.position.set(x, y, z);
    cam.lookAt(0, 0.62, 0);
    renderer.render(scene, cam);
  });
  document.body.dataset.ready = 'true';
}
