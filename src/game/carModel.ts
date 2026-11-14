import * as THREE from 'three';
import type { CarSpec } from '../core/cars';
import { carAnchors } from '../core/cars';
import { loftBody } from './cars/loft';
import type { PartMaterial } from './cars/parts';
import { createParts } from './cars/parts';
import { CAR_SHAPES } from './cars/shapes';
import { bodyDims } from './cars/silhouette';
import { buildWheel, buildWheelGeometry } from './cars/wheels';

export interface CarVisualState {
  readonly steerAngle: number;
  readonly wheelSpin: number;
  readonly braking: boolean;
  readonly reversing: boolean;
  readonly pitch: number;
  readonly roll: number;
}

export interface CarModel {
  readonly root: THREE.Group;
  update(visual: CarVisualState): void;
  dispose(): void;
}

function carMaterials(car: CarSpec, caliper: number): Record<PartMaterial, THREE.Material> {
  const standard = (color: number, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: car.visual.paint,
      roughness: car.visual.metallic ? 0.38 : 0.3,
      metalness: car.visual.metallic ? 0.35 : 0.08,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      // The sky map is bright and blurred; at full strength it washes dark paint out.
      envMapIntensity: 0.45,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x15161a,
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0c1418,
      roughness: 0.04,
      metalness: 0.7,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    }),
    interior: standard(0x1b1c1f, 0.92, 0),
    chrome: standard(0xe2e6ec, 0.16, 0.9),
    alloy: standard(0xc9ced4, 0.3, 0.8),
    darkAlloy: standard(0x2c2e33, 0.36, 0.75),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf3f5f8, emissive: 0x2a2822, roughness: 0.12 }),
    amber: standard(0xd8720f, 0.3, 0),
    tail: standard(0x6e1010, 0.3, 0),
    brake: new THREE.MeshStandardMaterial({ color: 0x7c1414, emissive: 0x180202, roughness: 0.3 }),
    reverse: new THREE.MeshStandardMaterial({
      color: 0xdcdde0,
      emissive: 0x000000,
      roughness: 0.35,
    }),
    disc: standard(0x8d9298, 0.45, 0.85),
    caliper: standard(caliper, 0.5, 0.3),
    plate: standard(0xe9e6da, 0.6, 0),
  };
}

/**
 * Builds one roster car from its catalog entry and its shape. Origin is on the ground
 * midway between the axles; the nose points down -Z.
 */
export function buildCarModel(car: CarSpec): CarModel {
  const shape = CAR_SHAPES[car.id];
  const anchors = carAnchors(car);
  const { real } = car;
  const materials = carMaterials(car, shape.wheel.caliper);
  const brakeMaterial = materials.brake as THREE.MeshStandardMaterial;
  const reverseMaterial = materials.reverse as THREE.MeshStandardMaterial;

  const root = new THREE.Group();
  // Sprung bodywork tilts with pitch and roll while the wheels stay on the ground.
  const body = new THREE.Group();
  root.add(body);

  const dims = bodyDims(car);
  const zOrigin = anchors.bounds.front;
  const zm = (zFromNose: number) => zOrigin + zFromNose;

  const parts = createParts();
  const surface = loftBody(parts, shape.body, dims, zOrigin);
  const { cabin } = shape.body;

  // Dark floor and arch liners between the wheels close the body from below.
  const frontTyre = real.tyreFront.widthMm / 1000;
  const rearTyre = real.tyreRear.widthMm / 1000;
  const frontInner = anchors.frontWheel.x - frontTyre / 2 - 0.17;
  const rearInner = anchors.rearWheel.x - rearTyre / 2 - 0.05;
  const floorLength = dims.rearAxle - dims.frontAxle + 0.5;
  parts.box(
    'trim',
    frontInner * 2,
    0.3,
    floorLength,
    0,
    surface.under(dims.length / 2) + 0.14,
    zm((dims.frontAxle + dims.rearAxle) / 2),
  );
  for (const [axle, radius, inner] of [
    [dims.frontAxle, dims.frontRadius, frontInner],
    [dims.rearAxle, dims.rearRadius, rearInner],
  ] as const) {
    const liner = new THREE.CylinderGeometry(
      radius + shape.body.archGap - 0.004,
      radius + shape.body.archGap - 0.004,
      inner * 2,
      24,
      1,
      false,
      Math.PI / 2,
      Math.PI,
    );
    liner.rotateZ(Math.PI / 2);
    parts.add('trim', liner, 0, radius, zm(axle));
  }

  // Cockpit: dash, wheel, seats.
  const belt = surface.edge(cabin.cowl + 0.3);
  parts.box(
    'interior',
    surface.cabinBase(cabin.cowl + 0.3) * 2 - 0.12,
    0.2,
    0.3,
    0,
    belt - 0.1,
    zm(cabin.tubFrom + 0.06),
  );
  const wheelRim = new THREE.TorusGeometry(0.175, 0.014, 8, 24);
  parts.add('trim', wheelRim, -shape.seatSpread, belt - 0.03, zm(cabin.tubFrom + 0.3), -0.35);
  parts.box(
    'trim',
    0.05,
    0.05,
    0.2,
    -shape.seatSpread,
    belt - 0.06,
    zm(cabin.tubFrom + 0.2),
    -0.35,
  );
  const seatZ = cabin.tubFrom + 0.78;
  for (const side of [-1, 1]) {
    const x = side * shape.seatSpread;
    parts.box('interior', 0.46, 0.12, 0.48, x, cabin.tubFloor + 0.06, zm(seatZ));
    parts.box('interior', 0.44, 0.56, 0.11, x, cabin.tubFloor + 0.36, zm(seatZ + 0.3), 0.28);
    parts.box('interior', 0.24, 0.17, 0.09, x, cabin.tubFloor + 0.7, zm(seatZ + 0.41), 0.2);
  }
  if (shape.rearSeat) {
    parts.box(
      'interior',
      shape.seatSpread * 2 + 0.5,
      0.42,
      0.14,
      0,
      cabin.tubFloor + 0.26,
      zm(cabin.tubTo - 0.1),
      0.3,
    );
  }

  // Door mirrors.
  const mirrorZ = cabin.cowl + 0.3;
  for (const side of [-1, 1]) {
    const x = side * (surface.cabinBase(mirrorZ) + 0.09);
    parts.blob(shape.mirror, 0.085, 0.055, 0.045, x, surface.edge(mirrorZ) + 0.075, zm(mirrorZ));
    parts.box(
      shape.mirror,
      0.09,
      0.02,
      0.04,
      x - side * 0.06,
      surface.edge(mirrorZ) + 0.04,
      zm(mirrorZ),
    );
  }

  shape.details({ parts, surface, dims, shape: shape.body, zm });
  body.add(parts.build(materials));

  const wheels: { spin: THREE.Group; spinSign: number; steer: THREE.Group | null }[] = [];
  const geometries = [
    buildWheelGeometry(
      {
        radius: anchors.frontWheel.y,
        width: frontTyre,
        rimRadius: (real.tyreFront.rimInches * 0.0254) / 2,
      },
      shape.wheel,
    ),
    buildWheelGeometry(
      {
        radius: anchors.rearWheel.y,
        width: rearTyre,
        rimRadius: (real.tyreRear.rimInches * 0.0254) / 2,
      },
      shape.wheel,
    ),
  ] as const;
  for (const side of [-1, 1]) {
    const front = buildWheel(geometries[0], materials, side);
    const steer = new THREE.Group();
    steer.position.set(side * anchors.frontWheel.x, anchors.frontWheel.y, anchors.frontWheel.z);
    steer.add(front.hub);
    const rear = buildWheel(geometries[1], materials, side);
    rear.hub.position.set(side * anchors.rearWheel.x, anchors.rearWheel.y, anchors.rearWheel.z);
    root.add(steer, rear.hub);
    wheels.push({ spin: front.spin, spinSign: front.spinSign, steer });
    wheels.push({ spin: rear.spin, spinSign: rear.spinSign, steer: null });
  }

  return {
    root,
    update(visual) {
      body.rotation.x = visual.pitch;
      body.rotation.z = visual.roll;
      for (const wheel of wheels) {
        if (wheel.steer) wheel.steer.rotation.y = -visual.steerAngle;
        wheel.spin.rotation.x = -visual.wheelSpin * wheel.spinSign;
      }
      brakeMaterial.color.setHex(visual.braking ? 0xff2b1c : 0x7c1414);
      brakeMaterial.emissive.setHex(visual.braking ? 0xc81808 : 0x180202);
      reverseMaterial.emissive.setHex(visual.reversing ? 0x66686c : 0x000000);
    },
    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) (object.geometry as THREE.BufferGeometry).dispose();
      });
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

/** Four-angle studio sheet (`?car=<id>`) for checking proportions and wheel clearance. */
export function showCar(car: CarSpec): void {
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

  const model = buildCarModel(car);
  model.update({
    steerAngle: -0.28,
    wheelSpin: 0.4,
    braking: true,
    reversing: false,
    pitch: 0,
    roll: 0,
  });
  scene.add(model.root);

  const reach = car.real.length / 4.345;
  const views: readonly [number, number, number][] = [
    [3.8 * reach, 1.7, 4.4 * reach],
    [-4.2 * reach, 1.5, -3.9 * reach],
    [5.4 * reach, 1.1, 0],
    [0, 6.4 * reach, 0.01],
  ];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const cam = new THREE.PerspectiveCamera(40, halfW / halfH, 0.1, 60);
  const centreZ = (carAnchors(car).bounds.front + carAnchors(car).bounds.rear) / 2;

  renderer.clear();
  views.forEach(([x, y, z], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    renderer.setViewport(col * halfW, (1 - row) * halfH, halfW, halfH);
    renderer.setScissor(col * halfW, (1 - row) * halfH, halfW, halfH);
    renderer.setScissorTest(true);
    cam.position.set(x, y, z + centreZ);
    cam.lookAt(0, 0.6, centreZ);
    renderer.render(scene, cam);
  });
  document.body.dataset.ready = 'true';
  document.body.dataset.car = car.id;
}
