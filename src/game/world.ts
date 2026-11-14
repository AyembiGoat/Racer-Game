import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../core/track';
import { projectOntoTrack } from '../core/track';
import type { Vec2 } from '../core/vec';
import { distance2, headingTo, scale2, sub2 } from '../core/vec';
import { applySurface, surface } from './materials';

const SUN_ELEVATION = THREE.MathUtils.degToRad(36);
const SUN_AZIMUTH = THREE.MathUtils.degToRad(-52);
const GUARDRAIL_HEIGHT = 0.82;
const GUARDRAIL_THICKNESS = 0.22;
const KERB_WIDTH = 0.95;

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
    normals.push({ x: -dz / len, z: dx / len });
  }
  return normals;
}

function cumulativeArcLengths(waypoints: readonly Vec2[]): number[] {
  const lengths = [0];
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    if (!a || !b) continue;
    total += distance2(a, b);
    lengths.push(total);
  }
  return lengths;
}

function buildTexturedRibbon(
  leftRing: readonly Vec2[],
  rightRing: readonly Vec2[],
  arcLengths: readonly number[],
  yLeft: number,
  yRight: number,
  uSpanMetres: number,
  vTileMetres: number,
): THREE.BufferGeometry {
  const count = leftRing.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Duplicate vertex 0 at `count` with total arc length so UVs wrap seamlessly without a jump.
  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const left = leftRing[idx];
    const right = rightRing[idx];
    if (!left || !right) continue;
    const s = arcLengths[i] ?? 0;
    positions.push(left.x, yLeft, left.z, right.x, yRight, right.z);
    uvs.push(0, s / vTileMetres, uSpanMetres, s / vTileMetres);
  }

  for (let i = 0; i < count; i++) {
    const l0 = i * 2;
    const r0 = i * 2 + 1;
    const l1 = (i + 1) * 2;
    const r1 = (i + 1) * 2 + 1;
    indices.push(l0, r0, l1, r0, r1, l1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildKerbGeometry(
  waypoints: readonly Vec2[],
  normals: readonly Vec2[],
  arcLengths: readonly number[],
  kerbFlags: readonly boolean[],
  sideSign: -1 | 1,
  halfRoad: number,
): THREE.BufferGeometry {
  const count = waypoints.length;
  const positions: number[] = [];
  const uvs: number[] = [];

  const pushQuad = (
    ax: number,
    ay: number,
    az: number,
    au: number,
    av: number,
    bx: number,
    by: number,
    bz: number,
    bu: number,
    bv: number,
    cx: number,
    cy: number,
    cz: number,
    cu: number,
    cv: number,
    dx: number,
    dy: number,
    dz: number,
    du: number,
    dv: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uvs.push(au, av, bu, bv, cu, cv);
    positions.push(bx, by, bz, dx, dy, dz, cx, cy, cz);
    uvs.push(bu, bv, du, dv, cu, cv);
  };

  for (let i = 0; i < count; i++) {
    if (!kerbFlags[i]) continue;
    const next = (i + 1) % count;
    const p0 = waypoints[i];
    const p1 = waypoints[next];
    const n0 = normals[i];
    const n1 = normals[next];
    if (!p0 || !p1 || !n0 || !n1) continue;

    const innerDist = halfRoad - 0.08;
    const outerDist = halfRoad + KERB_WIDTH;
    const i0 = { x: p0.x + n0.x * sideSign * innerDist, z: p0.z + n0.z * sideSign * innerDist };
    const o0 = { x: p0.x + n0.x * sideSign * outerDist, z: p0.z + n0.z * sideSign * outerDist };
    const i1 = { x: p1.x + n1.x * sideSign * innerDist, z: p1.z + n1.z * sideSign * innerDist };
    const o1 = { x: p1.x + n1.x * sideSign * outerDist, z: p1.z + n1.z * sideSign * outerDist };

    const v0 = (arcLengths[i] ?? 0) / 2.4;
    const v1 = (arcLengths[i + 1] ?? 0) / 2.4;

    if (sideSign === 1) {
      pushQuad(
        i0.x,
        0.02,
        i0.z,
        0,
        v0,
        o0.x,
        0.055,
        o0.z,
        1,
        v0,
        i1.x,
        0.02,
        i1.z,
        0,
        v1,
        o1.x,
        0.055,
        o1.z,
        1,
        v1,
      );
    } else {
      pushQuad(
        o0.x,
        0.055,
        o0.z,
        1,
        v0,
        i0.x,
        0.02,
        i0.z,
        0,
        v0,
        o1.x,
        0.055,
        o1.z,
        1,
        v1,
        i1.x,
        0.02,
        i1.z,
        0,
        v1,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function buildGuardrailGeometry(
  innerEdge: readonly Vec2[],
  outerEdge: readonly Vec2[],
  arcLengths: readonly number[],
): THREE.BufferGeometry {
  const count = innerEdge.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const railBottom = 0.24;
  const railTop = GUARDRAIL_HEIGHT;

  const pushQuad = (
    ax: number,
    ay: number,
    az: number,
    au: number,
    av: number,
    bx: number,
    by: number,
    bz: number,
    bu: number,
    bv: number,
    cx: number,
    cy: number,
    cz: number,
    cu: number,
    cv: number,
    dx: number,
    dy: number,
    dz: number,
    du: number,
    dv: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uvs.push(au, av, bu, bv, cu, cv);
    positions.push(bx, by, bz, dx, dy, dz, cx, cy, cz);
    uvs.push(bu, bv, du, dv, cu, cv);
  };

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const i0 = innerEdge[i];
    const o0 = outerEdge[i];
    const i1 = innerEdge[next];
    const o1 = outerEdge[next];
    if (!i0 || !o0 || !i1 || !o1) continue;

    const u0 = (arcLengths[i] ?? 0) / 2.5;
    const u1 = (arcLengths[i + 1] ?? 0) / 2.5;

    pushQuad(
      i0.x,
      railTop,
      i0.z,
      u0,
      1,
      o0.x,
      railTop,
      o0.z,
      u0,
      0.85,
      i1.x,
      railTop,
      i1.z,
      u1,
      1,
      o1.x,
      railTop,
      o1.z,
      u1,
      0.85,
    );
    pushQuad(
      i1.x,
      railBottom,
      i1.z,
      u1,
      0,
      i0.x,
      railBottom,
      i0.z,
      u0,
      0,
      i1.x,
      railTop,
      i1.z,
      u1,
      1,
      i0.x,
      railTop,
      i0.z,
      u0,
      1,
    );
    pushQuad(
      o0.x,
      railBottom,
      o0.z,
      u0,
      0,
      o1.x,
      railBottom,
      o1.z,
      u1,
      0,
      o0.x,
      railTop,
      o0.z,
      u0,
      1,
      o1.x,
      railTop,
      o1.z,
      u1,
      1,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function makeDistanceBoardTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.fillStyle = '#f2f4f5';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1b1d20';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#15171a';
  ctx.font = '700 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeChequeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const sq = 16;
  for (let y = 0; y < 64; y += sq) {
    for (let x = 0; x < 256; x += sq) {
      const dark = ((x / sq + y / sq) & 1) === 1;
      ctx.fillStyle = dark ? '#1f2124' : '#f2f3f5';
      ctx.fillRect(x, y, sq, sq);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildSkyAndSun(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(
    1,
    Math.PI / 2 - SUN_ELEVATION,
    SUN_AZIMUTH,
  );

  const sky = new Sky();
  sky.scale.setScalar(2500);
  const uniforms = sky.material.uniforms;
  const set = (name: string, value: number) => {
    const uniform = uniforms[name];
    if (uniform) uniform.value = value;
  };
  set('turbidity', 3.4);
  set('rayleigh', 2.2);
  set('mieCoefficient', 0.003);
  set('mieDirectionalG', 0.82);
  set('cloudCoverage', 0.28);
  set('cloudDensity', 0.34);
  (uniforms.sunPosition?.value as THREE.Vector3 | undefined)?.copy(sunDirection);

  const skyOnly = new THREE.Scene();
  skyOnly.add(sky);

  // Bake the sky once onto a cubemap and PMREM environment so every frame stays cheap.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 5000, cubeTarget).update(renderer, skyOnly);
  scene.background = cubeTarget.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyOnly, 0, 1, 5000).texture;
  scene.environmentIntensity = 0.34;
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();

  scene.add(new THREE.HemisphereLight(0x9ec4f8, 0x6f7c54, 1.05));

  const sun = new THREE.DirectionalLight(0xffe8c2, 4.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -65;
  cam.right = 65;
  cam.top = 65;
  cam.bottom = -65;
  cam.near = 10;
  cam.far = 180;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  scene.fog = new THREE.Fog(0x8fb4dc, 240, 760);

  return { scene, sun, sunDirection };
}

function buildTrees(track: Track, group: THREE.Group): void {
  const placements: { x: number; z: number; scale: number; rot: number }[] = [];
  const safeDistance = track.roadWidth / 2 + track.vergeWidth + 8.5;

  // Deterministic pseudo-random ring of trees framing the park around the circuit.
  let seed = 1337;
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    return (seed >>> 0) / 4294967296;
  };

  for (let i = 0; i < 260 && placements.length < 105; i++) {
    const angle = rand() * Math.PI * 2;
    const infield = i % 5 === 0;
    const radius = infield ? 12 + rand() * 42 : 120 + rand() * 95;
    const x = Math.cos(angle) * radius - 8;
    const z = Math.sin(angle) * radius;
    const proj = projectOntoTrack(track, { x, z });
    if (proj.distance < safeDistance) continue;
    placements.push({
      x,
      z,
      scale: 0.85 + rand() * 0.7,
      rot: rand() * Math.PI * 2,
    });
  }

  if (placements.length === 0) return;

  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 2.9, 7);
  trunkGeo.translate(0, 1.45, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4f3d2d, roughness: 0.94 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  // Layered multi-cluster crown so trees read as natural deciduous canopies, not spheres.
  const lobeA = new THREE.IcosahedronGeometry(2.3, 1);
  lobeA.scale(1.1, 0.85, 1.05);
  lobeA.translate(-0.75, 3.9, 0.35);
  const lobeB = new THREE.IcosahedronGeometry(2.45, 1);
  lobeB.scale(1.0, 0.92, 1.05);
  lobeB.translate(0.7, 4.15, -0.35);
  const lobeC = new THREE.IcosahedronGeometry(2.15, 1);
  lobeC.scale(0.95, 0.9, 0.95);
  lobeC.translate(0.05, 5.2, 0.1);
  const crownGeo = mergeGeometries([lobeA, lobeB, lobeC]);
  applySurface(crownGeo, 'foliage');
  const crowns = new THREE.InstancedMesh(crownGeo, surface('foliage'), placements.length);
  crowns.castShadow = true;
  crowns.receiveShadow = true;

  const dummy = new THREE.Object3D();
  placements.forEach((tree, idx) => {
    dummy.position.set(tree.x, 0, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    crowns.setMatrixAt(idx, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks, crowns);
}

export function buildWorld(track: Track, renderer: THREE.WebGLRenderer) {
  const { scene, sun, sunDirection } = buildSkyAndSun(renderer);
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Sunlit grass meadow across the infield, verges and surrounding park.
  // Offset slightly below y = 0 so road and kerbs never z-fight at long range.
  const groundGeo = new THREE.PlaneGeometry(1400, 1400);
  groundGeo.rotateX(-Math.PI / 2);
  applySurface(groundGeo, 'grass');
  const ground = new THREE.Mesh(groundGeo, surface('grass'));
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  const normals = waypointNormals(track.waypoints);
  const arcLengths = cumulativeArcLengths(track.waypoints);
  const halfRoad = track.roadWidth / 2;
  const halfCorridor = halfRoad + track.vergeWidth;

  const roadLeft: Vec2[] = [];
  const roadRight: Vec2[] = [];
  const lineLeftInner: Vec2[] = [];
  const lineLeftOuter: Vec2[] = [];
  const lineRightInner: Vec2[] = [];
  const lineRightOuter: Vec2[] = [];
  const leftGuardInner: Vec2[] = [];
  const leftGuardOuter: Vec2[] = [];
  const rightGuardInner: Vec2[] = [];
  const rightGuardOuter: Vec2[] = [];

  for (let i = 0; i < track.waypoints.length; i++) {
    const wp = track.waypoints[i];
    const n = normals[i];
    if (!wp || !n) continue;
    roadLeft.push(sub2(wp, scale2(n, halfRoad)));
    roadRight.push({ x: wp.x + n.x * halfRoad, z: wp.z + n.z * halfRoad });

    lineLeftOuter.push(sub2(wp, scale2(n, halfRoad - 0.08)));
    lineLeftInner.push(sub2(wp, scale2(n, halfRoad - 0.26)));
    lineRightInner.push({ x: wp.x + n.x * (halfRoad - 0.26), z: wp.z + n.z * (halfRoad - 0.26) });
    lineRightOuter.push({ x: wp.x + n.x * (halfRoad - 0.08), z: wp.z + n.z * (halfRoad - 0.08) });

    leftGuardInner.push(sub2(wp, scale2(n, halfCorridor + GUARDRAIL_THICKNESS)));
    leftGuardOuter.push(sub2(wp, scale2(n, halfCorridor)));
    rightGuardInner.push({ x: wp.x + n.x * halfCorridor, z: wp.z + n.z * halfCorridor });
    rightGuardOuter.push({
      x: wp.x + n.x * (halfCorridor + GUARDRAIL_THICKNESS),
      z: wp.z + n.z * (halfCorridor + GUARDRAIL_THICKNESS),
    });
  }

  // Asphalt ribbon.
  const roadMesh = new THREE.Mesh(
    buildTexturedRibbon(roadLeft, roadRight, arcLengths, 0.018, 0.018, track.roadWidth / 4.5, 4.5),
    surface('asphalt'),
  );
  roadMesh.receiveShadow = true;
  worldGroup.add(roadMesh);

  // Continuous white track-edge lines on both sides of the asphalt.
  const whitePaintMat = new THREE.MeshStandardMaterial({ color: 0xeeefe9, roughness: 0.72 });
  const leftLine = new THREE.Mesh(
    buildTexturedRibbon(lineLeftOuter, lineLeftInner, arcLengths, 0.024, 0.024, 1, 4),
    whitePaintMat,
  );
  const rightLine = new THREE.Mesh(
    buildTexturedRibbon(lineRightInner, lineRightOuter, arcLengths, 0.024, 0.024, 1, 4),
    whitePaintMat,
  );
  leftLine.receiveShadow = true;
  rightLine.receiveShadow = true;
  worldGroup.add(leftLine, rightLine);

  // Red-and-white serrated concrete kerbs on corner apexes and exits.
  const leftKerbs = new THREE.Mesh(
    buildKerbGeometry(
      track.waypoints,
      normals,
      arcLengths,
      track.kerbs.map((k) => k.left),
      -1,
      halfRoad,
    ),
    surface('kerb'),
  );
  const rightKerbs = new THREE.Mesh(
    buildKerbGeometry(
      track.waypoints,
      normals,
      arcLengths,
      track.kerbs.map((k) => k.right),
      1,
      halfRoad,
    ),
    surface('kerb'),
  );
  leftKerbs.receiveShadow = true;
  rightKerbs.receiveShadow = true;
  worldGroup.add(leftKerbs, rightKerbs);

  // Steel W-beam Armco guardrails and vertical steel support posts.
  const guardrailMat = surface('guardrail');
  const leftGuard = new THREE.Mesh(
    buildGuardrailGeometry(leftGuardInner, leftGuardOuter, arcLengths),
    guardrailMat,
  );
  const rightGuard = new THREE.Mesh(
    buildGuardrailGeometry(rightGuardInner, rightGuardOuter, arcLengths),
    guardrailMat,
  );
  leftGuard.castShadow = true;
  leftGuard.receiveShadow = true;
  rightGuard.castShadow = true;
  rightGuard.receiveShadow = true;
  worldGroup.add(leftGuard, rightGuard);

  const postGeo = new THREE.BoxGeometry(0.12, GUARDRAIL_HEIGHT + 0.04, 0.12);
  postGeo.translate(0, (GUARDRAIL_HEIGHT + 0.04) / 2, 0);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x8f98a2,
    roughness: 0.5,
    metalness: 0.55,
  });
  const posts = new THREE.InstancedMesh(postGeo, postMat, track.waypoints.length * 2);
  posts.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < track.waypoints.length; i++) {
    const lp = leftGuardInner[i];
    const rp = rightGuardOuter[i];
    if (!lp || !rp) continue;
    dummy.position.set(lp.x, 0, lp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(rp.x, 0, rp.z);
    dummy.updateMatrix();
    posts.setMatrixAt(i * 2 + 1, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  worldGroup.add(posts);

  // Chequered start/finish line, grid boxes and overhead start gantry on the main straight.
  const sx = track.spawn.position.x;
  const finishStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(track.roadWidth - 0.5, 1.5),
    new THREE.MeshStandardMaterial({ map: makeChequeredTexture(), roughness: 0.72 }),
  );
  finishStrip.rotation.x = -Math.PI / 2;
  finishStrip.position.set(sx, 0.026, 0);
  finishStrip.receiveShadow = true;
  worldGroup.add(finishStrip);

  // Staggered painted starting-grid brackets behind the start line.
  for (let slot = 0; slot < 6; slot++) {
    const side = slot % 2 === 0 ? 0 : -1;
    const gx = slot === 0 ? sx : sx + (slot % 2 === 1 ? -2.6 : 2.6);
    if (slot === 1) continue;
    const gz = slot === 0 ? 7.8 : 10 + slot * 7.2;
    const frontBar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 0.14), whitePaintMat);
    frontBar.position.set(gx + side * 0, 0.03, gz - 2.3);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 1.0), whitePaintMat);
    leftLeg.position.set(gx - 1.03, 0.03, gz - 1.85);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 1.0), whitePaintMat);
    rightLeg.position.set(gx + 1.03, 0.03, gz - 1.85);
    worldGroup.add(frontBar, leftLeg, rightLeg);
  }

  // Overhead start/finish gantry spanning the main straight at z = 0.
  const gantrySpan = halfCorridor * 2 + 1.2;
  const pillarGeo = new THREE.BoxGeometry(0.55, 6.2, 0.55);
  applySurface(pillarGeo, 'concrete');
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, surface('concrete'));
    pillar.position.set(sx + side * (halfCorridor + 0.6), 3.1, 0);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    worldGroup.add(pillar);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(gantrySpan, 0.95, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, metalness: 0.25 }),
  );
  banner.position.set(sx, 5.8, 0);
  banner.castShadow = true;
  const bannerStripe = new THREE.Mesh(
    new THREE.BoxGeometry(gantrySpan + 0.04, 0.22, 0.74),
    new THREE.MeshStandardMaterial({ color: 0xc82420, roughness: 0.5 }),
  );
  bannerStripe.position.set(sx, 5.42, 0);
  worldGroup.add(banner, bannerStripe);

  // 100 m and 50 m braking marker boards on the right grass verge before Turn 1 and Hairpin.
  const tex100 = makeDistanceBoardTexture('100');
  const tex50 = makeDistanceBoardTexture('50');
  const boardGeo = new THREE.BoxGeometry(1.15, 0.62, 0.08);
  const mat100 = new THREE.MeshStandardMaterial({ map: tex100, roughness: 0.65 });
  const mat50 = new THREE.MeshStandardMaterial({ map: tex50, roughness: 0.65 });

  // Turn 1 braking zone along East straight (heading 0, outside verge on +X right).
  for (const [zPos, mat] of [
    [-25, mat100],
    [-55, mat50],
  ] as const) {
    const board = new THREE.Mesh(boardGeo, mat);
    board.position.set(sx + halfRoad + 2.2, 0.42, zPos);
    board.castShadow = true;
    worldGroup.add(board);
  }

  // Hairpin braking zone along West straight (heading ~PI, outside verge on -X right).
  for (const [idxFraction, mat] of [
    [0.44, mat100],
    [0.48, mat50],
  ] as const) {
    const idx = Math.floor(idxFraction * track.waypoints.length) % track.waypoints.length;
    const wp = track.waypoints[idx];
    const next = track.waypoints[(idx + 1) % track.waypoints.length];
    const n = normals[idx];
    if (wp && next && n) {
      const board = new THREE.Mesh(boardGeo, mat);
      board.position.set(wp.x + n.x * (halfRoad + 2.2), 0.42, wp.z + n.z * (halfRoad + 2.2));
      board.rotation.y = headingTo(wp, next);
      board.castShadow = true;
      worldGroup.add(board);
    }
  }

  buildTrees(track, worldGroup);

  return {
    scene,
    /** Keep the directional shadow frustum centred around the car so shadows stay sharp. */
    moveShadowFocus(x: number, z: number) {
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
      sun.position.set(x + sunDirection.x * 75, sunDirection.y * 75, z + sunDirection.z * 75);
    },
  };
}
