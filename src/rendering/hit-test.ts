import type { Grid } from '../domain/project/grid'
import { CELL_SIZE, GRID_AXIS_MARGIN, screenToWorld, type Viewport } from './viewport'

export interface ClientPoint {
  readonly x: number
  readonly y: number
}

export interface CanvasClientRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface GridCellHit {
  readonly row: number
  readonly column: number
  readonly index: number
}

export function clientToCanvasScreen(
  point: ClientPoint,
  rect: CanvasClientRect,
): ClientPoint | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    point.x < rect.left ||
    point.y < rect.top ||
    point.x >= rect.left + rect.width ||
    point.y >= rect.top + rect.height
  ) {
    return null
  }

  return { x: point.x - rect.left, y: point.y - rect.top }
}

/** Converts pointer CSS pixels through the shared viewport into a half-open Grid cell. */
export function hitTestGridCell(
  point: ClientPoint,
  rect: CanvasClientRect,
  viewport: Viewport,
  grid: Grid | null,
): GridCellHit | null {
  if (
    !grid ||
    !Number.isSafeInteger(grid.width) ||
    !Number.isSafeInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.cells.length !== grid.width * grid.height
  ) {
    return null
  }

  const screen = clientToCanvasScreen(point, rect)
  if (!screen) return null

  const world = screenToWorld(screen, viewport)
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null
  const gridX = world.x - GRID_AXIS_MARGIN
  const gridY = world.y - GRID_AXIS_MARGIN
  const worldWidth = grid.width * CELL_SIZE
  const worldHeight = grid.height * CELL_SIZE
  if (gridX < 0 || gridY < 0 || gridX >= worldWidth || gridY >= worldHeight) return null

  const column = Math.floor(gridX / CELL_SIZE)
  const row = Math.floor(gridY / CELL_SIZE)
  if (column < 0 || column >= grid.width || row < 0 || row >= grid.height) return null

  return { row, column, index: row * grid.width + column }
}
