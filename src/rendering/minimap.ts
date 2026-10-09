import type { Grid } from '../domain/project/grid'
import { CELL_SIZE } from './cell-size'
import { GRID_AXIS_MARGIN, type CanvasSize, type Point, type Viewport } from './viewport'

export interface MiniMapRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface MiniMapGeometry {
  readonly scale: number
  readonly artwork: MiniMapRect
  readonly frame: MiniMapRect | null
}

export function deriveMiniMapGeometry(
  grid: Pick<Grid, 'width' | 'height'> | null,
  miniMapSize: CanvasSize,
  canvasSize: CanvasSize,
  viewport: Viewport,
): MiniMapGeometry | null {
  if (
    !grid ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    miniMapSize.width <= 0 ||
    miniMapSize.height <= 0
  ) {
    return null
  }

  const worldWidth = grid.width * CELL_SIZE
  const worldHeight = grid.height * CELL_SIZE
  const scale = Math.min(miniMapSize.width / worldWidth, miniMapSize.height / worldHeight)
  if (!Number.isFinite(scale) || scale <= 0) return null

  const artwork: MiniMapRect = {
    left: (miniMapSize.width - worldWidth * scale) / 2,
    top: (miniMapSize.height - worldHeight * scale) / 2,
    width: worldWidth * scale,
    height: worldHeight * scale,
  }
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1
  const visibleWorldLeft = -viewport.panX / zoom
  const visibleWorldTop = -viewport.panY / zoom
  const visibleWorldWidth = canvasSize.width > 0 ? canvasSize.width / zoom : 0
  const visibleWorldHeight = canvasSize.height > 0 ? canvasSize.height / zoom : 0
  const frameLeft = artwork.left + (visibleWorldLeft - GRID_AXIS_MARGIN) * scale
  const frameTop = artwork.top + (visibleWorldTop - GRID_AXIS_MARGIN) * scale
  const clippedLeft = Math.max(artwork.left, frameLeft)
  const clippedTop = Math.max(artwork.top, frameTop)
  const clippedRight = Math.min(artwork.left + artwork.width, frameLeft + visibleWorldWidth * scale)
  const clippedBottom = Math.min(
    artwork.top + artwork.height,
    frameTop + visibleWorldHeight * scale,
  )

  return {
    scale,
    artwork,
    frame:
      clippedRight > clippedLeft && clippedBottom > clippedTop
        ? {
            left: clippedLeft,
            top: clippedTop,
            width: clippedRight - clippedLeft,
            height: clippedBottom - clippedTop,
          }
        : null,
  }
}

/** Maps a valid MiniMap artwork point to the main Canvas world coordinate. */
export function miniMapPointToWorld(point: Point, geometry: MiniMapGeometry): Point | null {
  const { artwork, scale } = geometry
  if (
    point.x < artwork.left ||
    point.y < artwork.top ||
    point.x >= artwork.left + artwork.width ||
    point.y >= artwork.top + artwork.height
  ) {
    return null
  }
  return {
    x: GRID_AXIS_MARGIN + (point.x - artwork.left) / scale,
    y: GRID_AXIS_MARGIN + (point.y - artwork.top) / scale,
  }
}

export function centerViewportAtMiniMapPoint(
  point: Point,
  geometry: MiniMapGeometry,
  canvasSize: CanvasSize,
  viewport: Viewport,
): Viewport | null {
  const world = miniMapPointToWorld(point, geometry)
  if (!world || canvasSize.width <= 0 || canvasSize.height <= 0) return null
  return {
    zoom: viewport.zoom,
    panX: canvasSize.width / 2 - world.x * viewport.zoom,
    panY: canvasSize.height / 2 - world.y * viewport.zoom,
  }
}

/** Converts CSS-pixel drag movement on the MiniMap into main Canvas pan. */
export function panViewportByMiniMapDelta(
  viewport: Viewport,
  geometry: MiniMapGeometry,
  delta: Point,
): Viewport {
  return {
    zoom: viewport.zoom,
    panX: viewport.panX - (delta.x / geometry.scale) * viewport.zoom,
    panY: viewport.panY - (delta.y / geometry.scale) * viewport.zoom,
  }
}
