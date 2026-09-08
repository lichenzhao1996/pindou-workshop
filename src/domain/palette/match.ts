import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../constants'
import type { LabColor, Palette, RgbColor } from './types'

export interface PaletteMatch {
  readonly paletteIndex: number
  readonly colorId: string
}

function assertRgbChannel(value: number, channel: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`RGB ${channel} must be an integer from 0 to 255`)
  }
}

function assertLabValue(value: number, channel: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Lab ${channel} must be a finite number`)
  }
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

function labCurve(value: number): number {
  const epsilon = 216 / 24389
  const kappa = 24389 / 27

  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116
}

export function rgbToLab(rgb: RgbColor): LabColor {
  assertRgbChannel(rgb.r, 'r')
  assertRgbChannel(rgb.g, 'g')
  assertRgbChannel(rgb.b, 'b')

  const red = srgbToLinear(rgb.r)
  const green = srgbToLinear(rgb.g)
  const blue = srgbToLinear(rgb.b)

  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883

  const fx = labCurve(x)
  const fy = labCurve(y)
  const fz = labCurve(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function labDistanceSquared(left: LabColor, right: LabColor): number {
  assertLabValue(left.l, 'l')
  assertLabValue(left.a, 'a')
  assertLabValue(left.b, 'b')
  assertLabValue(right.l, 'l')
  assertLabValue(right.a, 'a')
  assertLabValue(right.b, 'b')

  const deltaL = left.l - right.l
  const deltaA = left.a - right.a
  const deltaB = left.b - right.b

  return deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
}

export function deltaE76(left: LabColor, right: LabColor): number {
  return Math.sqrt(labDistanceSquared(left, right))
}

export function findNearestPaletteColorByLab(palette: Palette, input: LabColor): PaletteMatch {
  assertLabValue(input.l, 'l')
  assertLabValue(input.a, 'a')
  assertLabValue(input.b, 'b')

  let bestMatch: PaletteMatch | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (const entry of palette.entries) {
    if (
      !Number.isInteger(entry.paletteIndex) ||
      entry.paletteIndex < MIN_PALETTE_INDEX ||
      entry.paletteIndex > MAX_PALETTE_INDEX
    ) {
      continue
    }

    const distance = labDistanceSquared(input, entry.lab)
    if (
      bestMatch === undefined ||
      distance < bestDistance ||
      (distance === bestDistance && entry.paletteIndex < bestMatch.paletteIndex)
    ) {
      bestMatch = {
        paletteIndex: entry.paletteIndex,
        colorId: entry.colorId,
      }
      bestDistance = distance
    }
  }

  if (bestMatch === undefined) {
    throw new RangeError('Palette does not contain a valid color entry')
  }

  return bestMatch
}

export function findNearestPaletteColor(palette: Palette, rgb: RgbColor): PaletteMatch {
  return findNearestPaletteColorByLab(palette, rgbToLab(rgb))
}
