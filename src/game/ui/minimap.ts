import type { Track } from '../../core/track';
import { clamp } from '../../core/vec';
import type { MinimapMode } from './settings';

const SVG_SIZE = 160;
const PADDING = 18;

export interface MinimapController {
  readonly element: SVGSVGElement;
  update(x: number, z: number, heading: number, nextCheckpoint: number, mode: MinimapMode): void;
}

export function createMinimap(track: Track): MinimapController {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
  svg.setAttribute('class', 'hud-minimap-svg');
  svg.setAttribute('aria-hidden', 'true');

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const pt of track.waypoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const drawSpan = SVG_SIZE - PADDING * 2;
  const scale = Math.min(drawSpan / spanX, drawSpan / spanZ);
  const offsetX = (SVG_SIZE - spanX * scale) * 0.5 - minX * scale;
  const offsetY = (SVG_SIZE - spanZ * scale) * 0.5 - minZ * scale;

  const toSvg = (wx: number, wz: number) => ({
    x: wx * scale + offsetX,
    y: wz * scale + offsetY,
  });

  const worldGroup = document.createElementNS(ns, 'g');
  worldGroup.setAttribute('class', 'minimap-world');

  // Track path built directly from real track waypoints.
  const pathData = track.waypoints
    .map((pt, idx) => {
      const p = toSvg(pt.x, pt.z);
      return `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const outerTrack = document.createElementNS(ns, 'path');
  outerTrack.setAttribute('d', `${pathData} Z`);
  outerTrack.setAttribute('class', 'minimap-track-casing');
  worldGroup.appendChild(outerTrack);

  const innerTrack = document.createElementNS(ns, 'path');
  innerTrack.setAttribute('d', `${pathData} Z`);
  innerTrack.setAttribute('class', 'minimap-track-line');
  worldGroup.appendChild(innerTrack);

  // Start/finish line from the final checkpoint gate.
  const finishGate = track.checkpoints[track.checkpoints.length - 1];
  if (finishGate) {
    const a = toSvg(finishGate.left.x, finishGate.left.z);
    const b = toSvg(finishGate.right.x, finishGate.right.z);
    const finishLine = document.createElementNS(ns, 'line');
    finishLine.setAttribute('x1', a.x.toFixed(1));
    finishLine.setAttribute('y1', a.y.toFixed(1));
    finishLine.setAttribute('x2', b.x.toFixed(1));
    finishLine.setAttribute('y2', b.y.toFixed(1));
    finishLine.setAttribute('class', 'minimap-finish-line');
    worldGroup.appendChild(finishLine);
  }

  // Intermediate sector checkpoint markers.
  const sectorDots: SVGCircleElement[] = [];
  const intermediateCount = Math.max(0, track.checkpoints.length - 1);
  for (let i = 0; i < intermediateCount; i++) {
    const gate = track.checkpoints[i];
    if (!gate) continue;
    const mid = toSvg((gate.left.x + gate.right.x) * 0.5, (gate.left.z + gate.right.z) * 0.5);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', mid.x.toFixed(1));
    dot.setAttribute('cy', mid.y.toFixed(1));
    dot.setAttribute('r', '2.8');
    dot.setAttribute('class', 'minimap-sector-dot');
    worldGroup.appendChild(dot);
    sectorDots.push(dot);
  }

  const carGroup = document.createElementNS(ns, 'g');
  carGroup.setAttribute('class', 'minimap-car');
  const carChevron = document.createElementNS(ns, 'polygon');
  carChevron.setAttribute('points', '0,-6.5 4.8,4.5 0,2.2 -4.8,4.5');
  carGroup.appendChild(carChevron);

  svg.appendChild(worldGroup);
  svg.appendChild(carGroup);

  let lastNextCheckpoint = -1;
  let lastWorldTransform = '';
  let lastCarTransform = '';

  return {
    element: svg,

    update(x, z, heading, nextCheckpoint, mode) {
      if (mode === 'off') return;

      if (nextCheckpoint !== lastNextCheckpoint) {
        lastNextCheckpoint = nextCheckpoint;
        for (let i = 0; i < sectorDots.length; i++) {
          const dot = sectorDots[i];
          if (!dot) continue;
          const passed = i < nextCheckpoint;
          const isNext = i === nextCheckpoint;
          dot.classList.toggle('is-passed', passed);
          dot.classList.toggle('is-next', isNext);
        }
      }

      const pos = toSvg(x, z);
      const cx = clamp(pos.x, 4, SVG_SIZE - 4);
      const cy = clamp(pos.y, 4, SVG_SIZE - 4);
      const deg = (heading * 180) / Math.PI;

      if (mode === 'rotating') {
        const half = SVG_SIZE * 0.5;
        const zoom = 1.18;
        const rotatedTx = `translate(${half.toFixed(1)}, ${half.toFixed(1)}) scale(${zoom}) rotate(${deg.toFixed(1)}) translate(${(-cx).toFixed(1)}, ${(-cy).toFixed(1)})`;
        if (rotatedTx !== lastWorldTransform) {
          lastWorldTransform = rotatedTx;
          worldGroup.setAttribute('transform', rotatedTx);
        }
        const carTx = `translate(${half.toFixed(1)}, ${half.toFixed(1)})`;
        if (carTx !== lastCarTransform) {
          lastCarTransform = carTx;
          carGroup.setAttribute('transform', carTx);
        }
      } else {
        if (lastWorldTransform !== '') {
          lastWorldTransform = '';
          worldGroup.removeAttribute('transform');
        }
        const carTx = `translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${(-deg).toFixed(1)})`;
        if (carTx !== lastCarTransform) {
          lastCarTransform = carTx;
          carGroup.setAttribute('transform', carTx);
        }
      }
    },
  };
}
