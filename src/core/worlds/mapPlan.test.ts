import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildOpenWorld } from '../world/build';
import { kestrelValley } from './kestrelValley';

it('writes a top-down map plan for inspection', () => {
  const runtime = buildOpenWorld(kestrelValley);
  mkdirSync('playtest', { recursive: true });
  const width = 1200;
  const height = 900;

  const toX = (x: number) => ((x + 1200) / 2400) * width;
  const toY = (z: number) => ((z + 900) / 1800) * height;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#20261e"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#c9a227" stroke-width="4"/>`,
  ];
  for (const patch of runtime.spec.groundPatches) {
    parts.push(
      `<rect x="${toX(patch.center.x - patch.size.x / 2)}" y="${toY(patch.center.z - patch.size.z / 2)}" width="${(patch.size.x / 2400) * width}" height="${(patch.size.z / 1800) * height}" fill="#5a4a2a" opacity="0.35" transform="rotate(${(patch.angle * 180) / Math.PI} ${toX(patch.center.x)} ${toY(patch.center.z)})"/>`,
    );
  }
  for (const junction of runtime.junctions) {
    parts.push(
      `<circle cx="${toX(junction.center.x)}" cy="${toY(junction.center.z)}" r="${(junction.radius / 2400) * width}" fill="#4b4f55"/>`,
    );
  }
  for (const road of runtime.roads) {
    const d = road.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.z).toFixed(1)}`)
      .join(' ');
    const widthPx = (road.spec.width / 2400) * width;
    parts.push(
      `<path d="${d}${road.spec.closed ? ' Z' : ''}" fill="none" stroke="#31343a" stroke-width="${widthPx + 3}" stroke-linejoin="round"/>`,
    );
    parts.push(
      `<path d="${d}${road.spec.closed ? ' Z' : ''}" fill="none" stroke="#8d9299" stroke-width="${widthPx}" stroke-linejoin="round" opacity="0.9"/>`,
    );
  }
  for (const tree of runtime.trees) {
    parts.push(
      `<circle cx="${toX(tree.position.x)}" cy="${toY(tree.position.z)}" r="${2.2 * tree.scale}" fill="#3f6f35"/>`,
    );
  }
  for (const building of runtime.buildings) {
    const w = (building.size.x / 2400) * width;
    const h = (building.size.z / 1800) * height;
    parts.push(
      `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${building.solid ? '#b9b2a4' : '#6d6a64'}" transform="translate(${toX(building.center.x)} ${toY(building.center.z)}) rotate(${(building.angle * 180) / Math.PI})"/>`,
    );
  }
  for (const barrier of runtime.barriers) {
    const d = barrier.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.z).toFixed(1)}`)
      .join(' ');
    const color = barrier.spec.category === 'boundary' ? '#c9a227' : '#b23b2e';
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`,
    );
  }
  for (const rock of runtime.spec.rocks) {
    parts.push(
      `<circle cx="${toX(rock.position.x)}" cy="${toY(rock.position.z)}" r="${(rock.radius / 2400) * width}" fill="#7c7466"/>`,
    );
  }
  const spawn = runtime.spec.spawn.position;
  parts.push(
    `<circle cx="${toX(spawn.x)}" cy="${toY(spawn.z)}" r="6" fill="#f39c12"/><text x="${toX(spawn.x) + 8}" y="${toY(spawn.z) - 8}" fill="#f39c12" font-family="sans-serif" font-size="16">SPAWN</text>`,
  );
  for (const road of runtime.roads) {
    const mid = road.points[Math.floor(road.points.length / 2)];
    if (!mid) continue;
    parts.push(
      `<text x="${toX(mid.x)}" y="${toY(mid.z)}" fill="#f2f4f5" font-family="sans-serif" font-size="13">${road.spec.name}</text>`,
    );
  }
  parts.push('</svg>');
  writeFileSync('playtest/map-plan.svg', parts.join('\n'));

  console.log(
    JSON.stringify(
      {
        roads: runtime.roads.map((road) => ({
          id: road.spec.id,
          length: Math.round(road.totalLength),
        })),
        totalRoadLength: Math.round(runtime.roads.reduce((sum, road) => sum + road.totalLength, 0)),
        colliders: runtime.colliders.length,
        trees: runtime.trees.length,
        barriers: runtime.barriers.map((barrier) => ({
          id: barrier.spec.id,
          points: barrier.points.length,
          colliders: barrier.colliders.length,
        })),
        grid: {
          cells: runtime.colliderGrid.cells.length,
          roadCells: runtime.roadGrid.cells.length,
        },
      },
      null,
      2,
    ),
  );
});
