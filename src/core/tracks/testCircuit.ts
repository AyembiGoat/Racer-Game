import type { Track } from '../track';
import { gateAcrossTrack } from '../track';
import type { Vec2 } from '../vec';

const ROAD_WIDTH = 12;
const HALF_STRAIGHT_X = 18;
const HALF_STRAIGHT_Z = 55;
const CORNER_RADIUS = 28;
const ARC_STEPS = 14;

function buildWaypoints(): Vec2[] {
  const points: Vec2[] = [];
  const eastX = HALF_STRAIGHT_X + CORNER_RADIUS;
  const westX = -eastX;
  const northZ = -(HALF_STRAIGHT_Z + CORNER_RADIUS);
  const southZ = HALF_STRAIGHT_Z + CORNER_RADIUS;

  const pushLine = (from: Vec2, to: Vec2, segments: number) => {
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      points.push({
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
      });
    }
  };

  const pushArc = (centre: Vec2, startAngle: number, endAngle: number) => {
    for (let i = 0; i < ARC_STEPS; i++) {
      const phi = startAngle + ((endAngle - startAngle) * i) / ARC_STEPS;
      points.push({
        x: centre.x + CORNER_RADIUS * Math.cos(phi),
        z: centre.z - CORNER_RADIUS * Math.sin(phi),
      });
    }
  };

  pushLine({ x: eastX, z: 0 }, { x: eastX, z: -HALF_STRAIGHT_Z }, 8);
  pushArc({ x: HALF_STRAIGHT_X, z: -HALF_STRAIGHT_Z }, 0, Math.PI / 2);
  pushLine({ x: HALF_STRAIGHT_X, z: northZ }, { x: -HALF_STRAIGHT_X, z: northZ }, 6);
  pushArc({ x: -HALF_STRAIGHT_X, z: -HALF_STRAIGHT_Z }, Math.PI / 2, Math.PI);
  pushLine({ x: westX, z: -HALF_STRAIGHT_Z }, { x: westX, z: HALF_STRAIGHT_Z }, 16);
  pushArc({ x: -HALF_STRAIGHT_X, z: HALF_STRAIGHT_Z }, Math.PI, Math.PI * 1.5);
  pushLine({ x: -HALF_STRAIGHT_X, z: southZ }, { x: HALF_STRAIGHT_X, z: southZ }, 6);
  pushArc({ x: HALF_STRAIGHT_X, z: HALF_STRAIGHT_Z }, Math.PI * 1.5, Math.PI * 2);
  pushLine({ x: eastX, z: HALF_STRAIGHT_Z }, { x: eastX, z: 0 }, 8);

  return points;
}

const eastX = HALF_STRAIGHT_X + CORNER_RADIUS;
const westX = -eastX;
const northZ = -(HALF_STRAIGHT_Z + CORNER_RADIUS);
const southZ = HALF_STRAIGHT_Z + CORNER_RADIUS;

export const testCircuit: Track = {
  name: 'Test Circuit',
  waypoints: buildWaypoints(),
  roadWidth: ROAD_WIDTH,
  spawn: {
    position: { x: eastX, z: 6 },
    heading: 0,
  },
  checkpoints: [
    gateAcrossTrack({ x: 0, z: northZ }, Math.PI / 2, ROAD_WIDTH),
    gateAcrossTrack({ x: westX, z: 0 }, Math.PI, ROAD_WIDTH),
    gateAcrossTrack({ x: 0, z: southZ }, -Math.PI / 2, ROAD_WIDTH),
    // Start/finish line on the main straight facing -Z.
    gateAcrossTrack({ x: eastX, z: 0 }, 0, ROAD_WIDTH),
  ],
};
