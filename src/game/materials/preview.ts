import * as THREE from 'three';
import { applySurface, surface, SURFACE_NAMES } from './index';

/**
 * Renders every shared surface swatch side by side under daylight (`?materials`)
 * so `npm run playtest -- --materials` can inspect textures without driving.
 */
export function showMaterials(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x25282c);
  scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x6a7062, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.position.set(6, 10, 7);
  scene.add(sun);

  const cols = 4;
  const spacing = 2.5;
  SURFACE_NAMES.forEach((name, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const geo = new THREE.BoxGeometry(2.1, 2.1, 0.25);
    applySurface(geo, name);
    const mesh = new THREE.Mesh(geo, surface(name));
    mesh.position.set((col - (cols - 1) / 2) * spacing, (0.5 - row) * spacing, 0);
    mesh.rotation.set(-0.22, 0.18, 0);
    scene.add(mesh);
  });

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9.2);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  document.body.dataset.ready = 'true';
}
