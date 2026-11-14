import type { Aabb } from './types';

/**
 * Uniform spatial hash used for both solid colliders and road segments.
 * Every item is inserted into every cell its AABB touches, so queries may
 * return extra candidates but can never miss one.
 */
export interface UniformGrid {
  readonly cellSize: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly (readonly number[])[];
  readonly itemCount: number;
}

export interface IndexedAabb {
  readonly aabb: Aabb;
}

export function buildUniformGrid(
  items: readonly IndexedAabb[],
  bounds: Aabb,
  cellSize: number,
): UniformGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize));
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);

  items.forEach((item, index) => {
    const minCol = clampCell(Math.floor((item.aabb.minX - bounds.minX) / cellSize), cols);
    const maxCol = clampCell(Math.floor((item.aabb.maxX - bounds.minX) / cellSize), cols);
    const minRow = clampCell(Math.floor((item.aabb.minZ - bounds.minZ) / cellSize), rows);
    const maxRow = clampCell(Math.floor((item.aabb.maxZ - bounds.minZ) / cellSize), rows);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = cells[row * cols + col];
        if (cell) cell.push(index);
      }
    }
  });

  return {
    cellSize,
    minX: bounds.minX,
    minZ: bounds.minZ,
    cols,
    rows,
    cells,
    itemCount: items.length,
  };
}

function clampCell(value: number, count: number): number {
  return Math.min(count - 1, Math.max(0, value));
}

/** Reusable de-duplication scratch so broad-phase queries allocate nothing. */
export interface GridQueryScratch {
  readonly stamps: Int32Array;
  epoch: number;
  readonly indices: number[];
}

export function createGridQueryScratch(itemCount: number): GridQueryScratch {
  return { stamps: new Int32Array(itemCount), epoch: 0, indices: [] };
}

/**
 * Indices of every item whose grid cells intersect `area`.
 * Results are in ascending index order for determinism.
 */
export function queryGrid(
  grid: UniformGrid,
  area: Aabb,
  scratch: GridQueryScratch,
): readonly number[] {
  scratch.epoch += 1;
  const epoch = scratch.epoch;
  const results = scratch.indices;
  results.length = 0;

  if (area.maxX < grid.minX || area.maxZ < grid.minZ) return results;
  const gridMaxX = grid.minX + grid.cols * grid.cellSize;
  const gridMaxZ = grid.minZ + grid.rows * grid.cellSize;
  if (area.minX > gridMaxX || area.minZ > gridMaxZ) return results;

  const minCol = clampCell(Math.floor((area.minX - grid.minX) / grid.cellSize), grid.cols);
  const maxCol = clampCell(Math.floor((area.maxX - grid.minX) / grid.cellSize), grid.cols);
  const minRow = clampCell(Math.floor((area.minZ - grid.minZ) / grid.cellSize), grid.rows);
  const maxRow = clampCell(Math.floor((area.maxZ - grid.minZ) / grid.cellSize), grid.rows);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = grid.cells[row * grid.cols + col];
      if (!cell) continue;
      for (const index of cell) {
        if (scratch.stamps[index] === epoch) continue;
        scratch.stamps[index] = epoch;
        results.push(index);
      }
    }
  }
  results.sort((a, b) => a - b);
  return results;
}

/** Straightforward cell walk for audits; deliberately independent of queryGrid. */
export function exhaustiveCellIndices(grid: UniformGrid, area: Aabb): number[] {
  const found = new Set<number>();
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const x0 = grid.minX + col * grid.cellSize;
      const z0 = grid.minZ + row * grid.cellSize;
      const overlaps =
        x0 <= area.maxX &&
        x0 + grid.cellSize >= area.minX &&
        z0 <= area.maxZ &&
        z0 + grid.cellSize >= area.minZ;
      if (!overlaps) continue;
      const cell = grid.cells[row * grid.cols + col];
      if (!cell) continue;
      for (const index of cell) found.add(index);
    }
  }
  return [...found].sort((a, b) => a - b);
}

export interface GridStats {
  readonly cells: number;
  readonly occupiedCells: number;
  readonly items: number;
  readonly insertions: number;
  readonly maxPerCell: number;
}

export function gridStats(grid: UniformGrid): GridStats {
  let occupiedCells = 0;
  let insertions = 0;
  let maxPerCell = 0;
  for (const cell of grid.cells) {
    if (cell.length > 0) occupiedCells += 1;
    insertions += cell.length;
    maxPerCell = Math.max(maxPerCell, cell.length);
  }
  return {
    cells: grid.cells.length,
    occupiedCells,
    items: grid.itemCount,
    insertions,
    maxPerCell,
  };
}
