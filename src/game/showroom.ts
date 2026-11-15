import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CarSpec } from '../core/cars';
import { carAnchors } from '../core/cars';
import { clamp } from '../core/vec';
import type { CarModel } from './carModel';
import { buildCarModel } from './carModel';
import { applySurface, surface } from './materials';

/** Screen rectangle the car should sit in, in CSS pixels. */
export interface BayFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_YAW = 0.62;
const DEFAULT_PITCH = 0.2;
const MIN_PITCH = 0.04;
const MAX_PITCH = 0.9;
const FOV = 24;

/**
 * Lit bay that shows one car for the garage and dealership. The camera moves only when
 * asked to, and the bay is redrawn only when something changed.
 */
export function createShowroom(renderer: THREE.WebGLRenderer) {
  // Soft-box studio reflections, so paint and glass show their shape.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.fog = new THREE.Fog(0x0b0d10, 16, 38);
  scene.environment = environment;
  scene.environmentIntensity = 0.9;

  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x1c1e22, 0.12));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.1);
  key.position.set(-4.5, 8, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 22;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rimLeft = new THREE.DirectionalLight(0xbcd2ff, 0.8);
  rimLeft.position.set(7, 3.5, 6);
  const rimRight = new THREE.DirectionalLight(0xffd9b0, 0.6);
  rimRight.position.set(-7, 2.5, 7);
  scene.add(rimLeft, rimRight);

  const floorGeometry = new THREE.PlaneGeometry(70, 70);
  floorGeometry.rotateX(-Math.PI / 2);
  applySurface(floorGeometry, 'concrete');
  // Same concrete as the circuit's aprons, darkened for an indoor floor.
  const floorMaterial = surface('concrete').clone();
  floorMaterial.color.setHex(0x1b1d21);
  floorMaterial.envMapIntensity = 0.25;
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.2, 80);
  const target = new THREE.Vector3();

  let model: CarModel | null = null;
  let shown: CarSpec | null = null;
  let yaw = DEFAULT_YAW;
  let pitch = DEFAULT_PITCH;
  let frame: BayFrame | null = null;
  let viewWidth = 1;
  let viewHeight = 1;
  let dirty = true;

  function placeCamera() {
    if (!shown) return;
    const anchors = carAnchors(shown);
    const bay = frame ?? { x: 0, y: 0, width: viewWidth, height: viewHeight };
    const centreZ = (anchors.bounds.front + anchors.bounds.rear) / 2;
    target.set(0, anchors.orbitTarget.y, centreZ);

    // Far enough that the car's length fits the bay's width and its height the bay's height.
    const aspect = viewWidth / viewHeight;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Far enough that the whole car, seen from any side, sits inside the frame with room
    // around it for the list and figures.
    const halfLength = (anchors.bounds.rear - anchors.bounds.front) / 2;
    const forWidth = (halfLength * 1.75) / (tanHalf * aspect * (bay.width / viewWidth));
    const forHeight = (anchors.bounds.height * 1.5) / (tanHalf * (bay.height / viewHeight));
    const distance = Math.max(forWidth, forHeight);

    camera.aspect = aspect;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z - Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(target);
    // Shift the image so the look target lands in the middle of the bay, not the window.
    camera.setViewOffset(
      viewWidth,
      viewHeight,
      viewWidth / 2 - (bay.x + bay.width / 2),
      viewHeight / 2 - (bay.y + bay.height / 2),
      viewWidth,
      viewHeight,
    );
    camera.updateProjectionMatrix();
  }

  return {
    car: (): CarSpec | null => shown,

    setCar(car: CarSpec) {
      if (shown?.id === car.id) return;
      if (model) {
        scene.remove(model.root);
        model.dispose();
      }
      model = buildCarModel(car);
      model.update({
        steerAngle: -0.22,
        wheelSpin: 0.5,
        braking: false,
        reversing: false,
        pitch: 0,
        roll: 0,
      });
      scene.add(model.root);
      shown = car;
      dirty = true;
    },

    /** Frees the model when the bay is left. */
    clear() {
      if (model) {
        scene.remove(model.root);
        model.dispose();
      }
      model = null;
      shown = null;
    },

    setFrame(next: BayFrame | null, width: number, height: number) {
      frame = next;
      viewWidth = Math.max(1, width);
      viewHeight = Math.max(1, height);
      dirty = true;
    },

    orbit(yawDelta: number, pitchDelta: number) {
      yaw += yawDelta;
      pitch = clamp(pitch + pitchDelta, MIN_PITCH, MAX_PITCH);
      dirty = true;
    },

    resetView() {
      yaw = DEFAULT_YAW;
      pitch = DEFAULT_PITCH;
      dirty = true;
    },

    orbitAngles: () => ({ yaw, pitch }),

    invalidate() {
      dirty = true;
    },

    /** Draws the bay if anything changed since the last draw. Returns whether it drew. */
    render(renderer: THREE.WebGLRenderer): boolean {
      if (!dirty || !shown) return false;
      placeCamera();
      renderer.render(scene, camera);
      dirty = false;
      return true;
    },
  };
}

export type Showroom = ReturnType<typeof createShowroom>;
