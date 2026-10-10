import { MARD_291_PALETTE } from '../palette/mard291'
import type { Palette } from '../palette/types'
import { assertValidGridCellValue, createGrid, type Grid } from '../project/grid'
import { mapRgbaImageToPalette, type PaletteMappedImage } from './map-to-palette'
import {
  decodeImageBlob,
  rasterizeRgbaImage,
  type ImageRgbaDecoder,
  type RgbaImage,
} from './rasterize'
import { resampleGenerationImage } from './resample'
import type { GenerationRequest } from './request'

export interface GenerationSize {
  readonly width: number
  readonly height: number
}

export interface GenerationDiagnostics {
  readonly sourceSize: GenerationSize
  readonly cropSize: GenerationSize
  readonly elapsedMs: number
}

export interface GenerationResult {
  readonly grid: Grid
  readonly heightBeads: number
  readonly paletteVersion: string
  readonly algorithmVersion: string
  readonly diagnostics: GenerationDiagnostics
}

export type GenerationResampler = (
  source: RgbaImage,
  request: Pick<GenerationRequest, 'widthBeads' | 'crop'>,
) => RgbaImage

export interface GenerationPipelineOptions {
  readonly decode?: ImageRgbaDecoder
  readonly palette?: Palette
  readonly resample?: GenerationResampler
}

function assertPaletteVersion(request: GenerationRequest, palette: Palette): void {
  if (request.paletteVersion !== palette.paletteVersion) {
    throw new RangeError(
      `Generation request Palette version ${request.paletteVersion} does not match ${palette.paletteVersion}`,
    )
  }
}

/** Converts the traceable mapping result into the single formal Grid representation. */
export function createGridFromPaletteMappedImage(mapped: PaletteMappedImage): Grid {
  if (mapped.pixels.length !== mapped.width * mapped.height) {
    throw new RangeError('Palette mapped pixel count must equal image dimensions')
  }

  const grid = createGrid(mapped.width, mapped.height)

  mapped.pixels.forEach((pixel, index) => {
    assertValidGridCellValue(pixel.paletteIndex)
    grid.cells[index] = pixel.paletteIndex
  })

  return grid
}

function buildGenerationResult(
  request: GenerationRequest,
  rasterized: RgbaImage,
  sourceSize: GenerationSize,
  options: GenerationPipelineOptions,
  startedAt: number,
): GenerationResult {
  const palette = options.palette ?? MARD_291_PALETTE
  assertPaletteVersion(request, palette)

  const resampler = options.resample ?? resampleGenerationImage
  const resampled = resampler(rasterized, request)
  const mapped = mapRgbaImageToPalette(resampled, palette)
  const grid = createGridFromPaletteMappedImage(mapped)

  return {
    grid,
    heightBeads: grid.height,
    paletteVersion: mapped.paletteVersion,
    algorithmVersion: request.algorithmVersion,
    diagnostics: {
      sourceSize,
      cropSize: rasterized.cropSize ?? { width: rasterized.width, height: rasterized.height },
      elapsedMs: Math.max(0, Date.now() - startedAt),
    },
  }
}

/** Runs the complete pure generation chain from a decoded source image. */
export async function generateGenerationResult(
  request: GenerationRequest,
  options: GenerationPipelineOptions = {},
): Promise<GenerationResult> {
  const startedAt = Date.now()
  const decoder = options.decode ?? decodeImageBlob
  const decoded = await decoder(request.originalImage)
  const rasterized = rasterizeRgbaImage(decoded, request.crop)

  return buildGenerationResult(
    request,
    rasterized,
    { width: decoded.width, height: decoded.height },
    options,
    startedAt,
  )
}

/** Runs the generation chain when the Worker already received rasterized crop pixels. */
export function generateGenerationResultFromRgbaImage(
  request: GenerationRequest,
  rasterized: RgbaImage,
  options: GenerationPipelineOptions = {},
): GenerationResult {
  const startedAt = Date.now()

  return buildGenerationResult(
    request,
    rasterized,
    rasterized.sourceSize ?? { width: rasterized.width, height: rasterized.height },
    options,
    startedAt,
  )
}
