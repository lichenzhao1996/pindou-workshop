import { MARD_291_PALETTE, getPaletteEntryByIndex } from '../../../domain/palette'
import { BEAD_SIZE_MM } from '../../../domain/generation/config'
import { EMPTY } from '../../../domain/project/constants'
import type { Grid } from '../../../domain/project/grid'
import { assertSupportedExportPalette, type ExportSnapshot } from '../snapshot'
import { downloadBlob } from '../download'

export const EFFECT_PREVIEW_CELL_SIZE = 32
export const EFFECT_PREVIEW_PADDING = 32
export const EFFECT_PREVIEW_HEADER_HEIGHT = 76
export const MAX_EFFECT_PREVIEW_CANVAS_DIMENSION = 8192
export const MAX_EFFECT_PREVIEW_CANVAS_PIXELS = 16_000_000

export interface EffectPreviewLayout {
  readonly canvasWidth: number
  readonly canvasHeight: number
  readonly scale: number
  readonly cellSize: number
  readonly padding: number
  readonly headerHeight: number
}

export type EffectPreviewCanvasFactory = () => HTMLCanvasElement

export function deriveEffectPreviewLayout(
  grid: Pick<Grid, 'width' | 'height'>,
): EffectPreviewLayout {
  if (
    !Number.isSafeInteger(grid.width) ||
    grid.width <= 0 ||
    !Number.isSafeInteger(grid.height) ||
    grid.height <= 0
  ) {
    throw new RangeError('Effect preview requires positive safe Grid dimensions')
  }

  const baseWidth = grid.width * EFFECT_PREVIEW_CELL_SIZE + EFFECT_PREVIEW_PADDING * 2
  const baseHeight =
    grid.height * EFFECT_PREVIEW_CELL_SIZE +
    EFFECT_PREVIEW_PADDING * 2 +
    EFFECT_PREVIEW_HEADER_HEIGHT
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
    cellSize: EFFECT_PREVIEW_CELL_SIZE * scale,
    padding: EFFECT_PREVIEW_PADDING * scale,
    headerHeight: EFFECT_PREVIEW_HEADER_HEIGHT * scale,
  }
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

export function renderEffectPreviewCanvas(
  snapshot: ExportSnapshot,
  canvasFactory: EffectPreviewCanvasFactory = createCanvas,
): HTMLCanvasElement {
  assertSupportedExportPalette(snapshot)
  const grid = snapshot.grid
  const layout = deriveEffectPreviewLayout(grid)
  const canvas = canvasFactory()
  canvas.width = layout.canvasWidth
  canvas.height = layout.canvasHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  context.fillStyle = '#f4f1eb'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const centerX = canvas.width / 2
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#342f29'
  context.font = `600 ${Math.max(1, 21 * layout.scale)}px system-ui, sans-serif`
  context.fillText(
    snapshot.project.projectName,
    centerX,
    layout.padding + 17 * layout.scale,
    canvas.width - layout.padding * 2,
  )
  context.fillStyle = '#655e54'
  context.font = `${Math.max(1, 14 * layout.scale)}px system-ui, sans-serif`
  context.fillText(
    `${grid.width} × ${grid.height} 颗 · ${BEAD_SIZE_MM}mm 拼豆`,
    centerX,
    layout.padding + 49 * layout.scale,
    canvas.width - layout.padding * 2,
  )

  const boardX = layout.padding
  const boardY = layout.padding + layout.headerHeight
  const boardWidth = grid.width * layout.cellSize
  const boardHeight = grid.height * layout.cellSize
  context.fillStyle = '#d8d2c8'
  context.fillRect(boardX, boardY, boardWidth, boardHeight)

  for (let index = 0; index < grid.cells.length; index += 1) {
    const paletteIndex = grid.cells[index]!
    if (paletteIndex === EMPTY) continue
    const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
    if (!entry) throw new RangeError(`Export Grid contains invalid palette index ${paletteIndex}`)

    const column = index % grid.width
    const row = Math.floor(index / grid.width)
    const x = boardX + (column + 0.5) * layout.cellSize
    const y = boardY + (row + 0.5) * layout.cellSize
    const radius = layout.cellSize * 0.43

    context.save()
    context.shadowColor = 'rgba(45, 38, 29, 0.24)'
    context.shadowBlur = layout.cellSize * 0.1
    context.shadowOffsetY = layout.cellSize * 0.035
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = entry.hex
    context.fill()
    context.shadowColor = 'transparent'
    context.shadowBlur = 0
    context.shadowOffsetY = 0
    context.lineWidth = Math.max(0.35, layout.cellSize * 0.025)
    context.strokeStyle = 'rgba(44, 38, 32, 0.2)'
    context.stroke()
    context.beginPath()
    context.ellipse(
      x - radius * 0.08,
      y - radius * 0.34,
      radius * 0.52,
      radius * 0.18,
      -0.08,
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(255, 255, 255, 0.3)'
    context.fill()
    context.restore()
  }

  return canvas
}

export function createEffectPreviewPngBlob(
  snapshot: ExportSnapshot,
  canvasFactory: EffectPreviewCanvasFactory = createCanvas,
): Promise<Blob> {
  const canvas = renderEffectPreviewCanvas(snapshot, canvasFactory)
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas could not encode the effect preview as PNG'))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (error) {
      reject(error)
    }
  })
}

export async function downloadEffectPreviewPng(snapshot: ExportSnapshot): Promise<void> {
  const blob = await createEffectPreviewPngBlob(snapshot)
  downloadBlob(blob, `${snapshot.fileNameBase}.png`)
}
