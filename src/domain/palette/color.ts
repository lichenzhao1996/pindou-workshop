import type { RgbColor } from './types'

/** Converts an 8-bit sRGB channel to linear-light intensity. */
export function srgbChannelToLinear(channel: number): number {
  if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
    throw new RangeError('sRGB channel must be an integer from 0 to 255')
  }

  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

/** Relative luminance using the WCAG sRGB coefficients. */
export function getRelativeLuminance(rgb: RgbColor): number {
  return (
    srgbChannelToLinear(rgb.r) * 0.2126 +
    srgbChannelToLinear(rgb.g) * 0.7152 +
    srgbChannelToLinear(rgb.b) * 0.0722
  )
}
