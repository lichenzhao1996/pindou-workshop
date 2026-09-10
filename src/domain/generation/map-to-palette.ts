import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../constants'
import { EMPTY } from '../project/constants'
import { MARD_291_PALETTE } from '../palette/mard291'
import { findNearestPaletteColor } from '../palette/match'
import type { Palette } from '../palette/types'
import { normalizeRgbaImage } from './alpha'
import type { PreparedPixel, PreparedRgbaImage, RgbPixel } from './alpha'
import type { RgbaImage } from './rasterize'

export interface EmptyPalettePixel {
  readonly kind: 'empty'
  readonly paletteIndex: typeof EMPTY
  readonly colorId: null
}

export interface MappedPalettePixel {
  readonly kind: 'color'
  readonly paletteIndex: number
  readonly colorId: string
}

export type PaletteMappedPixel = EmptyPalettePixel | MappedPalettePixel

/** A palette-mapped image; this is not yet the mutable Project Grid. */
export interface PaletteMappedImage {
  readonly width: number
  readonly height: number
  readonly paletteVersion: string
  readonly pixels: readonly PaletteMappedPixel[]
}

function assertPreparedImage(image: PreparedRgbaImage): void {
  if (
    !Number.isSafeInteger(image.width) ||
    image.width <= 0 ||
    !Number.isSafeInteger(image.height) ||
    image.height <= 0 ||
    image.pixels.length !== image.width * image.height
  ) {
    throw new RangeError('prepared image dimensions and pixels are invalid')
  }
}

function mapRgbPixel(pixel: RgbPixel, palette: Palette): MappedPalettePixel {
  const match = findNearestPaletteColor(palette, pixel)
  if (
    !Number.isInteger(match.paletteIndex) ||
    match.paletteIndex < MIN_PALETTE_INDEX ||
    match.paletteIndex > MAX_PALETTE_INDEX ||
    !match.colorId
  ) {
    throw new RangeError('Palette matcher returned an invalid color')
  }

  return {
    kind: 'color',
    paletteIndex: match.paletteIndex,
    colorId: match.colorId,
  }
}

function mapPreparedPixel(pixel: PreparedPixel, palette: Palette): PaletteMappedPixel {
  if (pixel.kind === 'empty') {
    return {
      kind: 'empty',
      paletteIndex: EMPTY,
      colorId: null,
    }
  }

  return mapRgbPixel(pixel, palette)
}

/** Maps prepared Alpha pixels without sending EMPTY through the Palette matcher. */
export function mapPreparedRgbaImageToPalette(
  image: PreparedRgbaImage,
  palette: Palette = MARD_291_PALETTE,
): PaletteMappedImage {
  assertPreparedImage(image)

  return {
    width: image.width,
    height: image.height,
    paletteVersion: palette.paletteVersion,
    pixels: image.pixels.map((pixel) => mapPreparedPixel(pixel, palette)),
  }
}

/** Normalizes RGBA first, then maps the resulting RGB pixels to the same Palette. */
export function mapRgbaImageToPalette(
  image: RgbaImage,
  palette: Palette = MARD_291_PALETTE,
): PaletteMappedImage {
  return mapPreparedRgbaImageToPalette(normalizeRgbaImage(image), palette)
}
