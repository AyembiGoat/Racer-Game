import * as THREE from 'three';
import type { CarState, DrivingSurface } from '../core/car';
import { CAR_TUNING } from '../core/car';
import type { Track } from '../core/track';
import { clamp, headingForward, headingRight, lerp, lerpAngle } from '../core/vec';
import { buildCarModel } from './carModel';
import { buildWorld } from './world';

export type CameraMode = 'chase' | 'bonnet';

/** Minimal state a driving camera needs; both the circuit and free roam supply it. */
export interface DrivingViewState {
  readonly car: CarState;
  readonly surface: DrivingSurface;
}

/** Everything a view needs from a built world. */
export interface WorldRig {
  readonly scene: THREE.Scene;
  moveShadowFocus(x: number, z: number): void;
}

export function createViewRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(MAX_PIXEL_RATIO);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.52;
  document.body.prepend(renderer.domElement);
  return renderer;
}

const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.75);
const MIN_PIXEL_RATIO = 0.7;
const SKID_POOL_SIZE = 220;

export function createView(track: Track, renderer: THREE.WebGLRenderer = createViewRenderer()) {
  return createDrivingView(renderer, buildWorld(track, renderer), track.spawn.heading, 900);
}

export function createDrivingView(
  renderer: THREE.WebGLRenderer,
  world: WorldRig,
  spawnHeading: number,
  farPlane: number,
) {
  let pixelRatio = renderer.getPixelRatio();
  const carModel = buildCarModel();
  world.scene.add(carModel.root);

  // Pre-allocated ring buffer of rear-tyre marks on tarmac when sliding hard.
  const skidGeo = new THREE.PlaneGeometry(0.24, 0.95);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x181a1d,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKID_POOL_SIZE);
  skids.frustumCulled = false;
  const hiddenMatrix = new THREE.Matrix4().makeTranslation(0, -10, 0);
  for (let i = 0; i < SKID_POOL_SIZE; i++) {
    skids.setMatrixAt(i, hiddenMatrix);
  }
  skids.instanceMatrix.needsUpdate = true;
  world.scene.add(skids);

  const camera = new THREE.PerspectiveCamera(
    64,
    window.innerWidth / window.innerHeight,
    0.15,
    farPlane,
  );
  camera.rotation.order = 'YXZ';

  let cameraMode: CameraMode = 'chase';
  let chaseYaw = spawnHeading;
  let chaseDistance = 6.2;
  let skidCursor = 0;
  let skidCooldown = 0;
  let slowSeconds = 0;
  let smoothSeconds = 0;
  let titleShowcase = false;
  let showcaseAngle = 0.55;
  let reducedMotion = false;
  let hasRendered = false;

  const lookTarget = new THREE.Vector3();
  const skidDummy = new THREE.Object3D();

  function clearSkids() {
    for (let i = 0; i < SKID_POOL_SIZE; i++) {
      skids.setMatrixAt(i, hiddenMatrix);
    }
    skids.instanceMatrix.needsUpdate = true;
    skidCursor = 0;
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (hasRendered) {
      renderer.render(world.scene, camera);
    }
  });

  return {
    canvas: renderer.domElement,

    /** Renderer work for the last frame, for honest performance reporting. */
    renderInfo() {
      const info = renderer.info.render;
      return {
        calls: info.calls,
        triangles: info.triangles,
        lines: info.lines,
        points: info.points,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        pixelRatio,
      };
    },

    compileShaders() {
      renderer.compile(world.scene, camera);
    },

    camera(): CameraMode {
      return cameraMode;
    },

    setCamera(mode: CameraMode) {
      cameraMode = mode;
    },

    cycleCamera() {
      cameraMode = cameraMode === 'chase' ? 'bonnet' : 'chase';
    },

    fov(): number {
      return camera.fov;
    },

    setFov(degrees: number) {
      const clamped = clamp(degrees, 48, 88);
      if (Math.abs(camera.fov - clamped) > 1e-3) {
        camera.fov = clamped;
        camera.updateProjectionMatrix();
      }
    },

    setTitleShowcase(active: boolean) {
      titleShowcase = active;
      if (active) {
        showcaseAngle = 0.52;
      }
    },

    setReducedMotion(reduced: boolean) {
      reducedMotion = reduced;
    },

    resetCamera(heading: number) {
      chaseYaw = heading;
      chaseDistance = 6.2;
      clearSkids();
    },

    /** Lower pixel ratio after sustained slow frames; restore once steady. */
    adapt(frameSeconds: number) {
      if (frameSeconds > 0.2) return;
      if (frameSeconds > 0.022) {
        slowSeconds += frameSeconds;
        smoothSeconds = 0;
      } else {
        smoothSeconds += frameSeconds;
        slowSeconds = Math.max(0, slowSeconds - frameSeconds);
      }
      let nextRatio = pixelRatio;
      if (slowSeconds > 0.6) {
        nextRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio * 0.85);
        slowSeconds = 0;
      } else if (smoothSeconds > 8 && pixelRatio < MAX_PIXEL_RATIO) {
        nextRatio = Math.min(MAX_PIXEL_RATIO, pixelRatio / 0.85);
        smoothSeconds = 0;
      }
      if (nextRatio !== pixelRatio) {
        pixelRatio = nextRatio;
        renderer.setPixelRatio(pixelRatio);
      }
    },

    frame(
      previous: DrivingViewState,
      current: DrivingViewState,
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
      const pitch = lerp(previous.car.pitch, current.car.pitch, alpha);
      const roll = lerp(previous.car.roll, current.car.roll, alpha);

      carModel.root.position.set(carX, 0, carZ);
      carModel.root.rotation.y = carHeading;
      carModel.update({
        steerAngle,
        wheelSpin,
        braking,
        reversing: current.car.gear < 0,
        pitch,
        roll,
      });

      skidCooldown = Math.max(0, skidCooldown - dtSeconds);
      if (
        dtSeconds > 0 &&
        current.surface === 'tarmac' &&
        current.car.slip > 0.34 &&
        skidCooldown <= 0
      ) {
        skidCooldown = 0.03;
        const nose = headingForward(carHeading);
        const right = headingRight(carHeading);
        const halfWB = CAR_TUNING.wheelbase / 2;
        const halfTrack = CAR_TUNING.width / 2 - 0.14;
        for (const side of [-1, 1]) {
          skidDummy.position.set(
            carX - nose.x * halfWB + right.x * side * halfTrack,
            0.023,
            carZ - nose.z * halfWB + right.z * side * halfTrack,
          );
          skidDummy.rotation.set(0, carHeading, 0);
          skidDummy.updateMatrix();
          skids.setMatrixAt(skidCursor, skidDummy.matrix);
          skidCursor = (skidCursor + 1) % SKID_POOL_SIZE;
        }
        skids.instanceMatrix.needsUpdate = true;
      }

      if (titleShowcase) {
        if (!reducedMotion && dtSeconds > 0) {
          showcaseAngle += dtSeconds * 0.08;
        }
        // Slow pit-lane three-quarter hero orbit framing the BMW M3 on the right-centre,
        // keeping the left viewport open for the title menu.
        const radius = 5.6;
        const orbitAngle = carHeading + showcaseAngle;
        const camOffsetX = Math.sin(orbitAngle) * radius;
        const camOffsetZ = Math.cos(orbitAngle) * radius;
        camera.position.set(
          carX + camOffsetX,
          1.46 + Math.sin(showcaseAngle * 0.7) * 0.12,
          carZ + camOffsetZ,
        );
        const camRightX = Math.cos(orbitAngle);
        const camRightZ = -Math.sin(orbitAngle);
        const nose = headingForward(carHeading);
        lookTarget.set(
          carX + nose.x * 0.65 - camRightX * 1.15,
          0.74,
          carZ + nose.z * 0.65 - camRightZ * 1.15,
        );
        camera.lookAt(lookTarget);
      } else {
        const yawFollow = dtSeconds > 0 ? 1 - Math.exp(-6.2 * dtSeconds) : 1;
        chaseYaw = lerpAngle(chaseYaw, carHeading, yawFollow);

        const speedRatio = clamp(Math.abs(current.car.speed) / CAR_TUNING.maxSpeed, 0, 1);
        const desiredDistance = 6.15 + speedRatio * 0.7;
        chaseDistance =
          dtSeconds > 0
            ? lerp(chaseDistance, desiredDistance, 1 - Math.exp(-5 * dtSeconds))
            : desiredDistance;

        if (cameraMode === 'chase') {
          const camForward = headingForward(chaseYaw);
          camera.position.set(
            carX - camForward.x * chaseDistance,
            2.12,
            carZ - camForward.z * chaseDistance,
          );
          const nose = headingForward(carHeading);
          lookTarget.set(carX + nose.x * 6.5, 0.82, carZ + nose.z * 6.5);
          camera.lookAt(lookTarget);
        } else {
          const nose = headingForward(carHeading);
          camera.position.set(carX + nose.x * 0.48, 1.2, carZ + nose.z * 0.48);
          lookTarget.set(carX + nose.x * 28, 0.84, carZ + nose.z * 28);
          camera.lookAt(lookTarget);
        }
      }

      if (draw) {
        world.moveShadowFocus(carX, carZ);
        renderer.render(world.scene, camera);
        hasRendered = true;
      }
    },
  };
}
