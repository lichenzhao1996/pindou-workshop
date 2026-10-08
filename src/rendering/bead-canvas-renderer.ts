import { EMPTY } from '../domain/project/constants'
import type { Grid } from '../domain/project/grid'
import type { Palette } from '../domain/palette/types'
import {
  CELL_SIZE,
  getVisibleGridRange,
  GRID_AXIS_MARGIN,
  type CanvasSize,
  type Viewport,
} from './viewport'

export interface BeadCanvasRenderOptions {
  viewport: Viewport
  size: CanvasSize
  dpr: number
}

export interface BeadCanvasRenderSummary {
  beads: number
  normalLines: number
  majorLines: number
  coordinates: number
  invalidCells: number
}

const EMPTY_BACKGROUND = '#e8edf2'
const NORMAL_GRID = '#b9c2cc'
const MAJOR_GRID = '#667085'
const COORDINATE_TEXT = '#344054'
const LOW_ZOOM_THRESHOLD = 0.42
const COORDINATE_SPACING_PX = 28

/** Draws a read-only Grid snapshot. EMPTY uses the canvas ground and never a palette entry. */
export function renderBeadGrid(
  context: CanvasRenderingContext2D,
  grid: Grid | null,
  palette: Palette,
  options: BeadCanvasRenderOptions,
): BeadCanvasRenderSummary {
  const summary: BeadCanvasRenderSummary = {
    beads: 0,
    normalLines: 0,
    majorLines: 0,
    coordinates: 0,
    invalidCells: 0,
  }
  const canvas = context.canvas

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = EMPTY_BACKGROUND
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (
    !grid ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.cells.length !== grid.width * grid.height ||
    options.size.width <= 0 ||
    options.size.height <= 0
  ) {
    return summary
  }

  const zoom = options.viewport.zoom
  const dpr = options.dpr
  context.setTransform(
    dpr * zoom,
    0,
    0,
    dpr * zoom,
    dpr * options.viewport.panX,
    dpr * options.viewport.panY,
  )

  const visible = getVisibleGridRange(grid, options.size, options.viewport)
  const colors = new Array<string | undefined>(292)
  for (const entry of palette.entries) {
    if (
      Number.isInteger(entry.paletteIndex) &&
      entry.paletteIndex >= 1 &&
      entry.paletteIndex <= 291
    ) {
      const { r, g, b } = entry.rgb
      colors[entry.paletteIndex] = `rgb(${r} ${g} ${b})`
    }
  }

  for (let row = visible.startRow; row < visible.endRow; row += 1) {
    for (let column = visible.startColumn; column < visible.endColumn; column += 1) {
      const value = grid.cells[row * grid.width + column]
      if (value === EMPTY) continue
      if (!Number.isInteger(value) || value < 1 || value > 291 || !colors[value]) {
        summary.invalidCells += 1
        continue
      }

      context.fillStyle = colors[value]!
      context.fillRect(
        GRID_AXIS_MARGIN + column * CELL_SIZE,
        GRID_AXIS_MARGIN + row * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
      )
      summary.beads += 1
    }
  }

  const firstColumnLine = Math.max(0, visible.startColumn)
  const lastColumnLine = Math.min(grid.width, visible.endColumn)
  const firstRowLine = Math.max(0, visible.startRow)
  const lastRowLine = Math.min(grid.height, visible.endRow)
  const showFineGrid = zoom >= LOW_ZOOM_THRESHOLD

  if (showFineGrid) {
    context.strokeStyle = NORMAL_GRID
    context.lineWidth = 1 / zoom
    for (let column = firstColumnLine; column <= lastColumnLine; column += 1) {
      if (column % 10 === 0) continue
      const x = GRID_AXIS_MARGIN + column * CELL_SIZE
      context.beginPath()
      context.moveTo(x, GRID_AXIS_MARGIN + firstRowLine * CELL_SIZE)
      context.lineTo(x, GRID_AXIS_MARGIN + lastRowLine * CELL_SIZE)
      context.stroke()
      summary.normalLines += 1
    }
    for (let row = firstRowLine; row <= lastRowLine; row += 1) {
      if (row % 10 === 0) continue
      const y = GRID_AXIS_MARGIN + row * CELL_SIZE
      context.beginPath()
      context.moveTo(GRID_AXIS_MARGIN + firstColumnLine * CELL_SIZE, y)
      context.lineTo(GRID_AXIS_MARGIN + lastColumnLine * CELL_SIZE, y)
      context.stroke()
      summary.normalLines += 1
    }
  }

  context.strokeStyle = MAJOR_GRID
  context.lineWidth = Math.max(1.5, 1.6 / zoom)
  const firstMajorColumn = Math.ceil(firstColumnLine / 10) * 10
  for (let column = firstMajorColumn; column <= lastColumnLine; column += 10) {
    const x = GRID_AXIS_MARGIN + column * CELL_SIZE
    context.beginPath()
    context.moveTo(x, GRID_AXIS_MARGIN + firstRowLine * CELL_SIZE)
    context.lineTo(x, GRID_AXIS_MARGIN + lastRowLine * CELL_SIZE)
    context.stroke()
    summary.majorLines += 1
  }
  const firstMajorRow = Math.ceil(firstRowLine / 10) * 10
  for (let row = firstMajorRow; row <= lastRowLine; row += 10) {
    const y = GRID_AXIS_MARGIN + row * CELL_SIZE
    context.beginPath()
    context.moveTo(GRID_AXIS_MARGIN + firstColumnLine * CELL_SIZE, y)
    context.lineTo(GRID_AXIS_MARGIN + lastColumnLine * CELL_SIZE, y)
    context.stroke()
    summary.majorLines += 1
  }

  const labelStep = Math.max(1, Math.ceil(COORDINATE_SPACING_PX / (CELL_SIZE * zoom)))
  context.fillStyle = COORDINATE_TEXT
  context.font = `${12 / zoom}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let column = visible.startColumn; column < visible.endColumn; column += 1) {
    if (column % labelStep !== 0) continue
    context.fillText(
      String(column),
      GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
      GRID_AXIS_MARGIN / 2,
    )
    summary.coordinates += 1
  }
  for (let row = visible.startRow; row < visible.endRow; row += 1) {
    if (row % labelStep !== 0) continue
    context.fillText(String(row), GRID_AXIS_MARGIN / 2, GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE)
    summary.coordinates += 1
  }

  return summary
}
