import type { Grid } from '../domain/project/grid'

export const CELL_SIZE = 24
export const GRID_AXIS_MARGIN = CELL_SIZE
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
export const ZOOM_FACTOR = 1.25
export const MAX_CANVAS_DIMENSION = 8192
export const MAX_CANVAS_PIXELS = 16_000_000

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

export interface CanvasSize {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface GridSize {
  width: number
  height: number
}

export interface VisibleGridRange {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
}

export interface CanvasBackingSize extends CanvasSize {
  dpr: number
}

export function clampZoom(zoom: number): number {
  const finiteZoom = Number.isFinite(zoom) ? zoom : 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteZoom))
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  }
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  const zoom = clampZoom(viewport.zoom)
  return {
    x: (point.x - viewport.panX) / zoom,
    y: (point.y - viewport.panY) / zoom,
  }
}

export function zoomViewportAt(viewport: Viewport, nextZoom: number, anchor: Point): Viewport {
  const before = screenToWorld(anchor, viewport)
  const zoom = clampZoom(nextZoom)

  return {
    zoom,
    panX: anchor.x - before.x * zoom,
    panY: anchor.y - before.y * zoom,
  }
}

export function centerViewport(grid: GridSize, size: CanvasSize, zoom: number): Viewport {
  const nextZoom = clampZoom(zoom)
  const worldWidth = (grid.width * CELL_SIZE + GRID_AXIS_MARGIN) * nextZoom
  const worldHeight = (grid.height * CELL_SIZE + GRID_AXIS_MARGIN) * nextZoom

  return {
    zoom: nextZoom,
    panX: (size.width - worldWidth) / 2,
    panY: (size.height - worldHeight) / 2,
  }
}

export function fitViewport(grid: GridSize, size: CanvasSize, padding = CELL_SIZE): Viewport {
  if (grid.width <= 0 || grid.height <= 0 || size.width <= 0 || size.height <= 0) {
    return centerViewport(grid, size, MIN_ZOOM)
  }

  const availableWidth = Math.max(0, size.width - padding * 2)
  const availableHeight = Math.max(0, size.height - padding * 2)
  const worldWidth = grid.width * CELL_SIZE + GRID_AXIS_MARGIN
  const worldHeight = grid.height * CELL_SIZE + GRID_AXIS_MARGIN
  const zoom = clampZoom(Math.min(availableWidth / worldWidth, availableHeight / worldHeight))

  return centerViewport(grid, size, zoom)
}

export function getVisibleGridRange(
  grid: GridSize,
  size: CanvasSize,
  viewport: Viewport,
): VisibleGridRange {
  if (grid.width <= 0 || grid.height <= 0 || size.width <= 0 || size.height <= 0) {
    return { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }
  }

  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport)
  const bottomRight = screenToWorld({ x: size.width, y: size.height }, viewport)
  const startColumn = Math.max(
    0,
    Math.min(grid.width, Math.floor((topLeft.x - GRID_AXIS_MARGIN) / CELL_SIZE)),
  )
  const endColumn = Math.max(
    startColumn,
    Math.min(grid.width, Math.ceil((bottomRight.x - GRID_AXIS_MARGIN) / CELL_SIZE)),
  )
  const startRow = Math.max(
    0,
    Math.min(grid.height, Math.floor((topLeft.y - GRID_AXIS_MARGIN) / CELL_SIZE)),
  )
  const endRow = Math.max(
    startRow,
    Math.min(grid.height, Math.ceil((bottomRight.y - GRID_AXIS_MARGIN) / CELL_SIZE)),
  )

  return { startRow, endRow, startColumn, endColumn }
}

export function getCanvasBackingSize(
  size: CanvasSize,
  devicePixelRatio: number,
): CanvasBackingSize {
  if (size.width <= 0 || size.height <= 0) {
    return { width: 0, height: 0, dpr: 1 }
  }

  const requestedDpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const pixelLimitDpr = Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height))
  const dimensionLimitDpr = Math.min(
    MAX_CANVAS_DIMENSION / size.width,
    MAX_CANVAS_DIMENSION / size.height,
  )
  const dpr = Math.min(requestedDpr, pixelLimitDpr, dimensionLimitDpr)

  return {
    width: Math.max(1, Math.floor(size.width * dpr)),
    height: Math.max(1, Math.floor(size.height * dpr)),
    dpr,
  }
}

export function gridSize(grid: Grid): GridSize {
  return { width: grid.width, height: grid.height }
}
