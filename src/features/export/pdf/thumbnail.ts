import { MARD_291_PALETTE, getPaletteEntryByIndex } from '../../../domain/palette'
import { EMPTY } from '../../../domain/project/constants'
import type { Grid } from '../../../domain/project/grid'
import type { ExportSnapshot } from '../snapshot'
import { assertSupportedExportPalette } from '../snapshot'
import type { PdfGridRange } from './pagination'

export interface PdfThumbnailRangeRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const PDF_GRID_THUMBNAIL_MAX_EDGE = 128

/** Returns the page range as normalized top-left-origin geometry in the full-Grid thumbnail. */
export function derivePdfThumbnailRangeRect(
  grid: Pick<Grid, 'width' | 'height'>,
  range: Pick<PdfGridRange, 'rowStart' | 'rowEndExclusive' | 'columnStart' | 'columnEndExclusive'>,
): PdfThumbnailRangeRect {
  if (!Number.isSafeInteger(grid.width) || grid.width <= 0) {
    throw new RangeError('PDF thumbnail requires a positive Grid width')
  }
  if (!Number.isSafeInteger(grid.height) || grid.height <= 0) {
    throw new RangeError('PDF thumbnail requires a positive Grid height')
  }
  if (
    !Number.isSafeInteger(range.rowStart) ||
    !Number.isSafeInteger(range.rowEndExclusive) ||
    !Number.isSafeInteger(range.columnStart) ||
    !Number.isSafeInteger(range.columnEndExclusive) ||
    range.rowStart < 0 ||
    range.columnStart < 0 ||
    range.rowEndExclusive <= range.rowStart ||
    range.columnEndExclusive <= range.columnStart ||
    range.rowEndExclusive > grid.height ||
    range.columnEndExclusive > grid.width
  ) {
    throw new RangeError('PDF thumbnail range must be a non-empty half-open Grid rectangle')
  }

  return {
    x: range.columnStart / grid.width,
    y: range.rowStart / grid.height,
    width: (range.columnEndExclusive - range.columnStart) / grid.width,
    height: (range.rowEndExclusive - range.rowStart) / grid.height,
  }
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PDF Grid thumbnail could not be encoded as PNG'))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (error) {
      reject(error)
    }
  })
}

/** Draws a low-resolution image from the immutable Grid snapshot; EMPTY has a distinct neutral tone. */
export async function createPdfGridThumbnailPng(
  snapshot: ExportSnapshot,
  canvasFactory: () => HTMLCanvasElement = createCanvas,
): Promise<Uint8Array> {
  assertSupportedExportPalette(snapshot)
  const grid = snapshot.grid
  if (grid.cells.length !== grid.width * grid.height) {
    throw new RangeError('PDF thumbnail Grid dimensions are inconsistent')
  }

  const scale = Math.min(1, PDF_GRID_THUMBNAIL_MAX_EDGE / Math.max(grid.width, grid.height))
  const width = Math.max(1, Math.round(grid.width * scale))
  const height = Math.max(1, Math.round(grid.height * scale))
  const canvas = canvasFactory()
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('PDF Grid thumbnail Canvas 2D context is unavailable')

  const image = context.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.min(grid.height - 1, Math.floor((y + 0.5) / scale))
    for (let x = 0; x < width; x += 1) {
      const sourceColumn = Math.min(grid.width - 1, Math.floor((x + 0.5) / scale))
      const paletteIndex = grid.cells[sourceRow * grid.width + sourceColumn]!
      const offset = (y * width + x) * 4
      if (paletteIndex === EMPTY) {
        image.data[offset] = 238
        image.data[offset + 1] = 234
        image.data[offset + 2] = 226
      } else {
        const entry = getPaletteEntryByIndex(MARD_291_PALETTE, paletteIndex)
        if (!entry) throw new RangeError(`PDF Grid contains invalid palette index ${paletteIndex}`)
        image.data[offset] = entry.rgb.r
        image.data[offset + 1] = entry.rgb.g
        image.data[offset + 2] = entry.rgb.b
      }
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const blob = await encodeCanvas(canvas)
  return new Uint8Array(await blob.arrayBuffer())
}
