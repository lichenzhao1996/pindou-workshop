import { EMPTY } from '../domain/project/constants'
import type { Grid } from '../domain/project/grid'
import { getRelativeLuminance } from '../domain/palette/color'
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
  showLabels?: boolean
  highlightedPaletteIndex?: number | null
  colorReplacement?: {
    sourcePaletteIndex: number
    targetPaletteIndex: number
  } | null
  sourcePreview?: CanvasImageSource | null
  interactions?: {
    previewCell?: CellOverlay | null
    selectedCell?: CellOverlay | null
    hoveredCell?: CellOverlay | null
  }
  interactionColors?: CanvasInteractionColors
}

export interface CellOverlay {
  readonly row: number
  readonly column: number
}

export interface CanvasInteractionColors {
  readonly preview: string
  readonly selected: string
  readonly hovered: string
}

export interface BeadCanvasRenderSummary {
  beads: number
  normalLines: number
  majorLines: number
  coordinates: number
  labels: number
  previews: number
  selections: number
  hovers: number
  invalidCells: number
  highlightedBeads: number
  dimmedBeads: number
  replacementBeads: number
}

const EMPTY_BACKGROUND = '#e8edf2'
const NORMAL_GRID = '#b9c2cc'
const MAJOR_GRID = '#667085'
const COORDINATE_TEXT = '#344054'
const LOW_ZOOM_THRESHOLD = 0.42
const COORDINATE_SPACING_PX = 28
const LABEL_SCREEN_THRESHOLD = 18
const LABEL_FONT_SIZE = Math.max(8, Math.min(12, CELL_SIZE * 0.42))
const LABEL_PADDING = 2
const DARK_LABEL = '#1f2933'
const LIGHT_LABEL = '#ffffff'
const DEFAULT_INTERACTION_COLORS: CanvasInteractionColors = {
  preview: '#2563eb',
  selected: '#2563eb',
  hovered: '#1f2933',
}

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
    labels: 0,
    previews: 0,
    selections: 0,
    hovers: 0,
    invalidCells: 0,
    highlightedBeads: 0,
    dimmedBeads: 0,
    replacementBeads: 0,
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

  if (options.sourcePreview) {
    context.drawImage(
      options.sourcePreview,
      GRID_AXIS_MARGIN,
      GRID_AXIS_MARGIN,
      grid.width * CELL_SIZE,
      grid.height * CELL_SIZE,
    )
    return summary
  }

  const visible = getVisibleGridRange(grid, options.size, options.viewport)
  const colors = new Array<string | undefined>(292)
  const entries = new Array<(typeof palette.entries)[number] | undefined>(292)
  for (const entry of palette.entries) {
    if (
      Number.isInteger(entry.paletteIndex) &&
      entry.paletteIndex >= 1 &&
      entry.paletteIndex <= 291
    ) {
      const { r, g, b } = entry.rgb
      colors[entry.paletteIndex] = `rgb(${r} ${g} ${b})`
      entries[entry.paletteIndex] = entry
    }
  }

  const highlighted = options.highlightedPaletteIndex ?? null
  const replacement = options.colorReplacement
  context.save()
  try {
    for (let row = visible.startRow; row < visible.endRow; row += 1) {
      for (let column = visible.startColumn; column < visible.endColumn; column += 1) {
        const value = grid.cells[row * grid.width + column]
        if (value === EMPTY) continue
        if (!Number.isInteger(value) || value < 1 || value > 291 || !colors[value]) {
          summary.invalidCells += 1
          continue
        }

        const displayIndex =
          replacement && value === replacement.sourcePaletteIndex
            ? replacement.targetPaletteIndex
            : value
        if (!colors[displayIndex]) {
          summary.invalidCells += 1
          continue
        }
        if (replacement && value === replacement.sourcePaletteIndex) summary.replacementBeads += 1
        if (highlighted !== null) {
          if (displayIndex === highlighted) summary.highlightedBeads += 1
          else summary.dimmedBeads += 1
          context.globalAlpha = displayIndex === highlighted ? 1 : 0.24
        } else {
          context.globalAlpha = 1
        }
        context.fillStyle = colors[displayIndex]!
        context.fillRect(
          GRID_AXIS_MARGIN + column * CELL_SIZE,
          GRID_AXIS_MARGIN + row * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE,
        )
        summary.beads += 1
      }
    }
  } finally {
    context.restore()
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

  const cellScreenSize = CELL_SIZE * zoom
  if (options.showLabels && cellScreenSize >= LABEL_SCREEN_THRESHOLD) {
    const maxScreenWidth = Math.max(0, cellScreenSize - LABEL_PADDING * 2)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let row = visible.startRow; row < visible.endRow; row += 1) {
      for (let column = visible.startColumn; column < visible.endColumn; column += 1) {
        const paletteIndex = grid.cells[row * grid.width + column]
        const displayIndex =
          replacement && paletteIndex === replacement.sourcePaletteIndex
            ? replacement.targetPaletteIndex
            : paletteIndex
        const entry = entries[displayIndex]
        if (paletteIndex === EMPTY || !entry || !colors[displayIndex]) continue

        context.font = `${LABEL_FONT_SIZE / zoom}px sans-serif`
        const measuredTextWidth = context.measureText(entry.displayCode).width * zoom
        const fitRatio =
          measuredTextWidth > maxScreenWidth && measuredTextWidth > 0
            ? maxScreenWidth / measuredTextWidth
            : 1
        const fontSize = Math.max(8, Math.min(LABEL_FONT_SIZE, LABEL_FONT_SIZE * fitRatio))
        context.fillStyle = getRelativeLuminance(entry.rgb) >= 0.55 ? DARK_LABEL : LIGHT_LABEL
        context.font = `${fontSize / zoom}px sans-serif`
        context.fillText(
          entry.displayCode,
          GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
          GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
          maxScreenWidth / zoom,
        )
        summary.labels += 1
      }
    }
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

  const interactions = options.interactions
  if (interactions) {
    const interactionColors = options.interactionColors ?? DEFAULT_INTERACTION_COLORS
    const drawCell = (cell: CellOverlay | null | undefined, strokeStyle: string) => {
      if (
        !cell ||
        cell.row < 0 ||
        cell.row >= grid.height ||
        cell.column < 0 ||
        cell.column >= grid.width
      ) {
        return false
      }

      const left = GRID_AXIS_MARGIN + cell.column * CELL_SIZE
      const top = GRID_AXIS_MARGIN + cell.row * CELL_SIZE
      context.strokeStyle = strokeStyle
      context.lineWidth = 2 / zoom
      context.beginPath()
      context.moveTo(left, top)
      context.lineTo(left + CELL_SIZE, top)
      context.lineTo(left + CELL_SIZE, top + CELL_SIZE)
      context.lineTo(left, top + CELL_SIZE)
      context.lineTo(left, top)
      context.stroke()
      return true
    }

    const preview = interactions.previewCell
    if (
      preview &&
      preview.row >= 0 &&
      preview.row < grid.height &&
      preview.column >= 0 &&
      preview.column < grid.width
    ) {
      context.fillStyle = interactionColors.preview
      context.globalAlpha = 0.14
      context.fillRect(
        GRID_AXIS_MARGIN + preview.column * CELL_SIZE,
        GRID_AXIS_MARGIN + preview.row * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
      )
      context.globalAlpha = 1
      summary.previews += 1
    }
    if (drawCell(interactions.selectedCell, interactionColors.selected)) summary.selections += 1
    if (drawCell(interactions.hoveredCell, interactionColors.hovered)) summary.hovers += 1
  }

  return summary
}
