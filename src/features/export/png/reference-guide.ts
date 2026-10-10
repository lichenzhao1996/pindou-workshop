import { getRelativeLuminance } from '../../../domain/palette/color'
import { MARD_291_PALETTE, getPaletteEntryByIndex } from '../../../domain/palette'
import { BEAD_SIZE_MM } from '../../../domain/generation/config'
import { EMPTY } from '../../../domain/project/constants'
import type { Grid } from '../../../domain/project/grid'
import { deriveUsedColorRowsFromStats } from '../../editor/color-management'
import { assertSupportedExportPalette, type ExportSnapshot } from '../snapshot'
import { downloadBlob } from '../download'
import {
  MAX_EFFECT_PREVIEW_CANVAS_DIMENSION,
  MAX_EFFECT_PREVIEW_CANVAS_PIXELS,
} from './effect-preview'

export const REFERENCE_PNG_CELL_SIZE = 32
export const REFERENCE_PNG_AXIS_MARGIN = 36
export const REFERENCE_PNG_LEFT_MARGIN = 44
export const REFERENCE_PNG_RIGHT_MARGIN = 32
export const REFERENCE_PNG_HEADER_HEIGHT = 88
export const REFERENCE_PNG_LEGEND_TITLE_HEIGHT = 42
export const REFERENCE_PNG_LEGEND_ROW_HEIGHT = 26
export const REFERENCE_PNG_LEGEND_MAX_COLUMNS = 4
export const REFERENCE_PNG_LEGEND_MIN_COLUMN_WIDTH = 220
export const REFERENCE_PNG_BOTTOM_MARGIN = 28

export interface ReferencePngLayout {
  readonly canvasWidth: number
  readonly canvasHeight: number
  readonly scale: number
  readonly cellSize: number
  readonly gridX: number
  readonly gridY: number
  readonly boardWidth: number
  readonly boardHeight: number
  readonly legendColumns: number
  readonly legendRows: number
  readonly legendY: number
}

export type ReferencePngCanvasFactory = () => HTMLCanvasElement

export function deriveReferencePngLayout(
  grid: Pick<Grid, 'width' | 'height'>,
  usedColorCount: number,
): ReferencePngLayout {
  if (
    !Number.isSafeInteger(grid.width) ||
    grid.width <= 0 ||
    !Number.isSafeInteger(grid.height) ||
    grid.height <= 0 ||
    !Number.isSafeInteger(usedColorCount) ||
    usedColorCount < 0
  ) {
    throw new RangeError('Reference PNG requires positive Grid dimensions and a valid color count')
  }

  const baseBoardWidth = grid.width * REFERENCE_PNG_CELL_SIZE
  const baseBoardHeight = grid.height * REFERENCE_PNG_CELL_SIZE
  const legendColumns = Math.max(
    1,
    Math.min(
      REFERENCE_PNG_LEGEND_MAX_COLUMNS,
      Math.floor(baseBoardWidth / REFERENCE_PNG_LEGEND_MIN_COLUMN_WIDTH),
    ),
  )
  const legendRows = Math.ceil(usedColorCount / legendColumns)
  const baseWidth = REFERENCE_PNG_LEFT_MARGIN + baseBoardWidth + REFERENCE_PNG_RIGHT_MARGIN
  const baseHeight =
    REFERENCE_PNG_HEADER_HEIGHT +
    REFERENCE_PNG_AXIS_MARGIN +
    baseBoardHeight +
    REFERENCE_PNG_LEGEND_TITLE_HEIGHT +
    legendRows * REFERENCE_PNG_LEGEND_ROW_HEIGHT +
    REFERENCE_PNG_BOTTOM_MARGIN
  const scale = Math.min(
    1,
    MAX_EFFECT_PREVIEW_CANVAS_DIMENSION / baseWidth,
    MAX_EFFECT_PREVIEW_CANVAS_DIMENSION / baseHeight,
    Math.sqrt(MAX_EFFECT_PREVIEW_CANVAS_PIXELS / (baseWidth * baseHeight)),
  )

  return {
    canvasWidth: Math.max(1, Math.floor(baseWidth * scale)),
    canvasHeight: Math.max(1, Math.floor(baseHeight * scale)),
    scale,
    cellSize: REFERENCE_PNG_CELL_SIZE * scale,
    gridX: REFERENCE_PNG_LEFT_MARGIN * scale,
    gridY: (REFERENCE_PNG_HEADER_HEIGHT + REFERENCE_PNG_AXIS_MARGIN) * scale,
    boardWidth: baseBoardWidth * scale,
    boardHeight: baseBoardHeight * scale,
    legendColumns,
    legendRows,
    legendY:
      (REFERENCE_PNG_HEADER_HEIGHT +
        REFERENCE_PNG_AXIS_MARGIN +
        baseBoardHeight +
        REFERENCE_PNG_LEGEND_TITLE_HEIGHT) *
      scale,
  }
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

function paletteTextColor(entry: NonNullable<ReturnType<typeof getPaletteEntryByIndex>>): string {
  return getRelativeLuminance(entry.rgb) < 0.55 ? '#ffffff' : '#292721'
}

function drawEmptyCell(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.fillStyle = '#f2efe9'
  context.fillRect(x, y, size, size)
  context.beginPath()
  context.moveTo(x + size * 0.28, y + size * 0.28)
  context.lineTo(x + size * 0.72, y + size * 0.72)
  context.moveTo(x + size * 0.72, y + size * 0.28)
  context.lineTo(x + size * 0.28, y + size * 0.72)
  context.strokeStyle = '#b6afa3'
  context.lineWidth = Math.max(0.7, size * 0.045)
  context.stroke()
}

export function renderReferencePngCanvas(
  snapshot: ExportSnapshot,
  canvasFactory: ReferencePngCanvasFactory = createCanvas,
): HTMLCanvasElement {
  assertSupportedExportPalette(snapshot)
  const grid = snapshot.grid
  const stats = snapshot.stats
  const rows = deriveUsedColorRowsFromStats(stats)
  const layout = deriveReferencePngLayout(grid, rows.length)
  const canvas = canvasFactory()
  canvas.width = layout.canvasWidth
  canvas.height = layout.canvasHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')
  context.scale(layout.scale, layout.scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.canvasWidth / layout.scale, layout.canvasHeight / layout.scale)

  const boardX = REFERENCE_PNG_LEFT_MARGIN
  const boardY = REFERENCE_PNG_HEADER_HEIGHT + REFERENCE_PNG_AXIS_MARGIN
  const cellSize = REFERENCE_PNG_CELL_SIZE
  const boardWidth = grid.width * cellSize
  const boardHeight = grid.height * cellSize

  context.textBaseline = 'middle'
  context.textAlign = 'center'
  context.fillStyle = '#292721'
  context.font = '600 22px sans-serif'
  context.fillText(
    snapshot.project.projectName,
    layout.canvasWidth / layout.scale / 2,
    26,
    boardWidth,
  )
  context.font = '14px sans-serif'
  context.fillStyle = '#514c44'
  context.fillText(
    `${grid.width} × ${grid.height} 颗 · ${BEAD_SIZE_MM}mm 拼豆 · ${stats.usedColorCount} 色 · ${stats.totalBeads} 颗`,
    layout.canvasWidth / layout.scale / 2,
    60,
    boardWidth,
  )

  context.fillStyle = '#d5d0c7'
  context.fillRect(boardX, boardY, boardWidth, boardHeight)
  for (let index = 0; index < grid.cells.length; index += 1) {
    const paletteIndex = grid.cells[index]!
    const column = index % grid.width
    const row = Math.floor(index / grid.width)
    const x = boardX + column * cellSize
    const y = boardY + row * cellSize

    if (paletteIndex === EMPTY) {
      drawEmptyCell(context, x, y, cellSize)
      continue
    }

    const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
    if (!entry) throw new RangeError(`Export Grid contains invalid palette index ${paletteIndex}`)
    context.fillStyle = entry.hex
    context.fillRect(x, y, cellSize, cellSize)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = paletteTextColor(entry)
    context.font = '600 12px sans-serif'
    context.fillText(entry.displayCode, x + cellSize / 2, y + cellSize / 2, cellSize - 2)
  }

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#514c44'
  context.font = '10px sans-serif'
  for (let column = 0; column < grid.width; column += 1) {
    context.fillText(String(column), boardX + (column + 0.5) * cellSize, boardY - 18, cellSize - 1)
  }
  context.textAlign = 'right'
  for (let row = 0; row < grid.height; row += 1) {
    context.fillText(String(row), boardX - 6, boardY + (row + 0.5) * cellSize, 36)
  }

  for (let column = 0; column <= grid.width; column += 1) {
    context.beginPath()
    context.moveTo(boardX + column * cellSize, boardY)
    context.lineTo(boardX + column * cellSize, boardY + boardHeight)
    context.strokeStyle = column % 10 === 0 ? '#302e2b' : 'rgba(54, 51, 46, 0.55)'
    context.lineWidth = column % 10 === 0 ? 2 : 0.8
    context.stroke()
  }
  for (let row = 0; row <= grid.height; row += 1) {
    context.beginPath()
    context.moveTo(boardX, boardY + row * cellSize)
    context.lineTo(boardX + boardWidth, boardY + row * cellSize)
    context.strokeStyle = row % 10 === 0 ? '#302e2b' : 'rgba(54, 51, 46, 0.55)'
    context.lineWidth = row % 10 === 0 ? 2 : 0.8
    context.stroke()
  }

  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillStyle = '#292721'
  context.font = '600 18px sans-serif'
  context.fillText(`使用色号清单（${stats.usedColorCount} 色）`, boardX, boardY + boardHeight + 24)
  const legendColumnWidth = boardWidth / layout.legendColumns
  context.font = '12px sans-serif'
  for (const [rowIndex, row] of rows.entries()) {
    const column = Math.floor(rowIndex / layout.legendRows)
    const rowInColumn = rowIndex % layout.legendRows
    const x = boardX + column * legendColumnWidth
    const y =
      boardY +
      boardHeight +
      REFERENCE_PNG_LEGEND_TITLE_HEIGHT +
      rowInColumn * REFERENCE_PNG_LEGEND_ROW_HEIGHT
    context.fillStyle = row.entry.hex
    context.fillRect(x, y - 7, 14, 14)
    context.strokeStyle = '#5c574f'
    context.lineWidth = 0.7
    context.strokeRect(x, y - 7, 14, 14)
    context.fillStyle = '#292721'
    context.fillText(
      `${row.entry.displayCode} ${row.entry.name}  ${row.count} 颗`,
      x + 20,
      y,
      Math.max(1, legendColumnWidth - 24),
    )
  }

  if (stats.usedColorCount === 0) {
    context.fillStyle = '#514c44'
    context.font = '12px sans-serif'
    context.fillText('当前没有实际使用的颜色。', boardX, boardY + boardHeight + 62)
  }
  context.fillStyle = '#6c665d'
  context.font = '11px sans-serif'
  context.fillText(
    '坐标从 0 开始；浅灰斜线表示空格（EMPTY），不是白色拼豆。',
    boardX,
    canvas.height / layout.scale - 12,
  )

  return canvas
}

export function createReferencePngBlob(
  snapshot: ExportSnapshot,
  canvasFactory: ReferencePngCanvasFactory = createCanvas,
): Promise<Blob> {
  const canvas = renderReferencePngCanvas(snapshot, canvasFactory)
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas could not encode the reference guide as PNG'))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (error) {
      reject(error)
    }
  })
}

export async function downloadReferencePng(
  snapshot: ExportSnapshot,
  canvasFactory: ReferencePngCanvasFactory = createCanvas,
): Promise<void> {
  const blob = await createReferencePngBlob(snapshot, canvasFactory)
  downloadBlob(blob, `${snapshot.fileNameBase}.png`)
}
