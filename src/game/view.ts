import * as THREE from 'three';
import { CAR_TUNING } from '../core/car';
import type { GameState } from '../core/game';
import type { Track } from '../core/track';
import type { Vec2 } from '../core/vec';
import { headingForward, lerp, lerpAngle, scale2, sub2 } from '../core/vec';

export type CameraMode = 'chase' | 'bonnet';

const BARRIER_HEIGHT = 0.95;
const BARRIER_THICKNESS = 0.45;

function waypointNormals(waypoints: readonly Vec2[]): Vec2[] {
  const count = waypoints.length;
  const normals: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const prev = waypoints[(i - 1 + count) % count];
    const next = waypoints[(i + 1) % count];
    if (!prev || !next) {
      normals.push({ x: 1, z: 0 });
      continue;
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // Right-hand perpendicular to tangent `(dx, dz)` on XZ.
    normals.push({ x: -dz / len, z: dx / len });
  }
  return normals;
}

function buildRibbonGeometry(
  leftRing: readonly Vec2[],
  rightRing: readonly Vec2[],
  y: number,
): THREE.BufferGeometry {
  const count = leftRing.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    const left = leftRing[i];
    const right = rightRing[i];
    if (!left || !right) continue;
    positions.push(left.x, y, left.z, right.x, y, right.z);
  }

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const l0 = i * 2;
    const r0 = i * 2 + 1;
    const l1 = next * 2;
    const r1 = next * 2 + 1;
    indices.push(l0, r0, l1, r0, r1, l1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildBarrierGeometry(
  innerEdge: readonly Vec2[],
  outerEdge: readonly Vec2[],
  height: number,
): THREE.BufferGeometry {
  const count = innerEdge.length;
  const positions: number[] = [];

  const pushQuad = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    positions.push(bx, by, bz, dx, dy, dz, cx, cy, cz);
  };

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const i0 = innerEdge[i];
    const o0 = outerEdge[i];
    const i1 = innerEdge[next];
    const o1 = outerEdge[next];
    if (!i0 || !o0 || !i1 || !o1) continue;

    // Top face
    pushQuad(i0.x, height, i0.z, o0.x, height, o0.z, i1.x, height, i1.z, o1.x, height, o1.z);
    // Road-facing and outer-facing vertical walls
    pushQuad(i1.x, 0, i1.z, i0.x, 0, i0.z, i1.x, height, i1.z, i0.x, height, i0.z);
    pushQuad(o0.x, 0, o0.z, o1.x, 0, o1.z, o0.x, height, o0.z, o1.x, height, o1.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildTrackGroup(track: Track): THREE.Group {
  const group = new THREE.Group();
  const normals = waypointNormals(track.waypoints);
  const halfWidth = track.roadWidth / 2;

  const roadLeft: Vec2[] = [];
  const roadRight: Vec2[] = [];
  const leftWallInner: Vec2[] = [];
  const leftWallOuter: Vec2[] = [];
  const rightWallInner: Vec2[] = [];
  const rightWallOuter: Vec2[] = [];

  for (let i = 0; i < track.waypoints.length; i++) {
    const wp = track.waypoints[i];
    const n = normals[i];
    if (!wp || !n) continue;
    roadLeft.push(sub2(wp, scale2(n, halfWidth)));
    roadRight.push({ x: wp.x + n.x * halfWidth, z: wp.z + n.z * halfWidth });
    leftWallInner.push(sub2(wp, scale2(n, halfWidth + BARRIER_THICKNESS)));
    leftWallOuter.push(sub2(wp, scale2(n, halfWidth)));
    rightWallInner.push({ x: wp.x + n.x * halfWidth, z: wp.z + n.z * halfWidth });
    rightWallOuter.push({
      x: wp.x + n.x * (halfWidth + BARRIER_THICKNESS),
      z: wp.z + n.z * (halfWidth + BARRIER_THICKNESS),
    });
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x6c727a, roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.9 });
  group.add(new THREE.Mesh(buildRibbonGeometry(roadLeft, roadRight, 0.015), roadMaterial));

  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xb6bbc2, roughness: 0.82 });
  group.add(
    new THREE.Mesh(
      buildBarrierGeometry(leftWallInner, leftWallOuter, BARRIER_HEIGHT),
      barrierMaterial,
    ),
  );
  group.add(
    new THREE.Mesh(
      buildBarrierGeometry(rightWallInner, rightWallOuter, BARRIER_HEIGHT),
      barrierMaterial,
    ),
  );

  // Dashed centreline markers for speed and corner reference.
  const dashGeometry = new THREE.BoxGeometry(0.18, 0.01, 2.6);
  const markingMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d8de, roughness: 0.75 });
  const dashIndices: number[] = [];
  for (let i = 0; i < track.waypoints.length; i += 2) dashIndices.push(i);
  const dashes = new THREE.InstancedMesh(dashGeometry, markingMaterial, dashIndices.length);
  const matrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  for (let idx = 0; idx < dashIndices.length; idx++) {
    const wpIndex = dashIndices[idx] ?? 0;
    const wp = track.waypoints[wpIndex];
    const next = track.waypoints[(wpIndex + 1) % track.waypoints.length];
    if (!wp || !next) continue;
    dummy.position.set(wp.x, 0.024, wp.z);
    dummy.rotation.set(0, Math.atan2(-(next.x - wp.x), -(next.z - wp.z)), 0);
    dummy.updateMatrix();
    matrix.copy(dummy.matrix);
    dashes.setMatrixAt(idx, matrix);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // Checkpoint marker posts outside the barriers and a painted start/finish line.
  const postGeometry = new THREE.BoxGeometry(0.32, 2.4, 0.32);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xe6eaef, roughness: 0.7 });
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, track.checkpoints.length * 2);
  for (let i = 0; i < track.checkpoints.length; i++) {
    const cp = track.checkpoints[i];
    if (!cp) continue;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(cp.left.x, 1.2, cp.left.z);
    dummy.updateMatrix();
    posts.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(cp.right.x, 1.2, cp.right.z);
    dummy.updateMatrix();
    posts.setMatrixAt(i * 2 + 1, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  const finish = track.checkpoints[track.checkpoints.length - 1];
  if (finish) {
    const span = sub2(finish.right, finish.left);
    const roadSpan = track.roadWidth - 0.3;
    const len = Math.hypot(span.x, span.z) || 1;
    const cx = (finish.left.x + finish.right.x) / 2;
    const cz = (finish.left.z + finish.right.z) / 2;
    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(roadSpan, 0.012, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.65 }),
    );
    startLine.position.set(cx, 0.026, cz);
    startLine.rotation.y = Math.atan2(span.z / len, span.x / len) * -1;
    group.add(startLine);
  }

  return group;
}

function buildCarModel() {
  const root = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd5dae1, roughness: 0.55 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x4c535c, roughness: 0.4 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 });
  const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.9 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xbac0c8, roughness: 0.5 });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c1d1d,
    emissive: 0x000000,
    roughness: 0.5,
  });

  const bodyWidth = CAR_TUNING.width;
  const innerTubWidth = CAR_TUNING.width - 0.56;
  const beltBottom = CAR_TUNING.wheelRadius * 2 + 0.04;
  const beltHeight = 0.24;

  // Narrow lower tub so all four wheel wells stay open and front tyres never clip at full lock.
  const lowerTub = new THREE.Mesh(
    new THREE.BoxGeometry(innerTubWidth, 0.44, CAR_TUNING.length - 0.16),
    trimMaterial,
  );
  lowerTub.position.y = 0.22 + 0.22;
  root.add(lowerTub);

  // Full-width upper body above the wheel arches.
  const upperDeck = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, beltHeight, CAR_TUNING.length),
    bodyMaterial,
  );
  upperDeck.position.y = beltBottom + beltHeight / 2;
  root.add(upperDeck);

  // Front and rear lower bumpers ahead of and behind the wheel wells.
  const overhangLength =
    (CAR_TUNING.length - CAR_TUNING.wheelbase) / 2 - CAR_TUNING.wheelRadius - 0.08;
  if (overhangLength > 0.1) {
    const noseLower = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth, 0.34, overhangLength),
      bodyMaterial,
    );
    noseLower.position.set(0, 0.36 + 0.17, -(CAR_TUNING.length / 2 - overhangLength / 2));
    const tailLower = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth, 0.26, overhangLength),
      bodyMaterial,
    );
    tailLower.position.set(0, 0.44 + 0.13, CAR_TUNING.length / 2 - overhangLength / 2);
    root.add(noseLower, tailLower);
  }

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.8, 0.42, CAR_TUNING.length * 0.45),
    cabinMaterial,
  );
  cabin.position.set(0, beltBottom + beltHeight + 0.2, 0.16);
  root.add(cabin);

  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.96, 0.14, 0.12),
    trimMaterial,
  );
  frontBumper.position.set(0, 0.36, -CAR_TUNING.length / 2 - 0.02);
  root.add(frontBumper);

  const lightGeo = new THREE.BoxGeometry(0.36, 0.11, 0.06);
  const leftBrake = new THREE.Mesh(lightGeo, brakeLightMaterial);
  leftBrake.position.set(-0.56, beltBottom + beltHeight * 0.55, CAR_TUNING.length / 2 + 0.01);
  const rightBrake = new THREE.Mesh(lightGeo, brakeLightMaterial);
  rightBrake.position.set(0.56, beltBottom + beltHeight * 0.55, CAR_TUNING.length / 2 + 0.01);
  root.add(leftBrake, rightBrake);

  const wheelWidth = 0.24;
  const tyreGeo = new THREE.CylinderGeometry(
    CAR_TUNING.wheelRadius,
    CAR_TUNING.wheelRadius,
    wheelWidth,
    18,
  );
  tyreGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(wheelWidth + 0.01, CAR_TUNING.wheelRadius * 1.5, 0.07);

  const makeWheel = () => {
    const spinGroup = new THREE.Group();
    spinGroup.add(new THREE.Mesh(tyreGeo, tyreMaterial));
    spinGroup.add(new THREE.Mesh(spokeGeo, hubMaterial));
    return spinGroup;
  };

  const halfTrack = CAR_TUNING.width / 2 - wheelWidth / 2 - 0.02;
  const halfWheelbase = CAR_TUNING.wheelbase / 2;

  const flSteer = new THREE.Group();
  flSteer.position.set(-halfTrack, CAR_TUNING.wheelRadius, -halfWheelbase);
  const flSpin = makeWheel();
  flSteer.add(flSpin);

  const frSteer = new THREE.Group();
  frSteer.position.set(halfTrack, CAR_TUNING.wheelRadius, -halfWheelbase);
  const frSpin = makeWheel();
  frSteer.add(frSpin);

  const rlSpin = makeWheel();
  rlSpin.position.set(-halfTrack, CAR_TUNING.wheelRadius, halfWheelbase);

  const rrSpin = makeWheel();
  rrSpin.position.set(halfTrack, CAR_TUNING.wheelRadius, halfWheelbase);

  root.add(flSteer, frSteer, rlSpin, rrSpin);

  return {
    root,
    steerPivots: [flSteer, frSteer] as const,
    spinGroups: [flSpin, frSpin, rlSpin, rrSpin] as const,
    setBraking(braking: boolean) {
      brakeLightMaterial.color.setHex(braking ? 0xd93829 : 0x5c1d1d);
      brakeLightMaterial.emissive.setHex(braking ? 0x66120b : 0x000000);
    },
  };
}

export function createView(track: Track) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyColor = 0x9aa4b0;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 130, 360);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.15, 420);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xf2f5fa, 0x585e66, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(70, 120, 50);
  scene.add(sun);

  scene.add(buildTrackGroup(track));
  const carModel = buildCarModel();
  scene.add(carModel.root);

  let cameraMode: CameraMode = 'chase';
  let chaseYaw = track.spawn.heading;
  const lookTarget = new THREE.Vector3();

  // Pre-compile shaders so first-frame rendering never stalls.
  renderer.compile(scene, camera);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    canvas: renderer.domElement,

    camera(): CameraMode {
      return cameraMode;
    },

    setCamera(mode: CameraMode) {
      cameraMode = mode;
    },

    cycleCamera() {
      cameraMode = cameraMode === 'chase' ? 'bonnet' : 'chase';
    },

    resetCamera(heading: number) {
      chaseYaw = heading;
    },

    frame(
      previous: GameState,
      current: GameState,
      alpha: number,
      dtSeconds: number,
      braking: boolean,
      draw = true,
    ) {
      const carX = lerp(previous.car.position.x, current.car.position.x, alpha);
      const carZ = lerp(previous.car.position.z, current.car.position.z, alpha);
      const carHeading = lerpAngle(previous.car.heading, current.car.heading, alpha);
      const steerAngle = lerp(previous.car.steerAngle, current.car.steerAngle, alpha);
      const wheelSpin = lerp(previous.car.wheelSpin, current.car.wheelSpin, alpha);

      carModel.root.position.set(carX, 0, carZ);
      carModel.root.rotation.y = carHeading;
      for (const pivot of carModel.steerPivots) {
        pivot.rotation.y = -steerAngle;
      }
      for (const wheel of carModel.spinGroups) {
        wheel.rotation.x = -wheelSpin;
      }
      carModel.setBraking(braking);

      const followFactor = dtSeconds > 0 ? 1 - Math.exp(-7.5 * dtSeconds) : 1;
      chaseYaw = lerpAngle(chaseYaw, carHeading, followFactor);

      if (cameraMode === 'chase') {
        const camForward = headingForward(chaseYaw);
        camera.position.set(carX - camForward.x * 6.8, 2.35, carZ - camForward.z * 6.8);
        const nose = headingForward(carHeading);
        lookTarget.set(carX + nose.x * 6, 0.85, carZ + nose.z * 6);
        camera.lookAt(lookTarget);
      } else {
        const nose = headingForward(carHeading);
        camera.position.set(carX + nose.x * 0.45, 1.22, carZ + nose.z * 0.45);
        lookTarget.set(carX + nose.x * 26, 0.85, carZ + nose.z * 26);
        camera.lookAt(lookTarget);
      }

      if (draw) {
        renderer.render(scene, camera);
      }
    },
  };
}
