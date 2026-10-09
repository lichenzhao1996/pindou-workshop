import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../constants'
import { getPaletteEntryByColorId } from './accessors'
import { deltaE76 } from './match'
import type { Palette } from './types'

export interface SimilarPaletteColor {
  readonly paletteIndex: number
  readonly colorId: string
  readonly distance: number
}

export function findSimilarPaletteColors(
  palette: Palette,
  colorId: string,
  limit = 6,
): readonly SimilarPaletteColor[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return []
  }

  const source = getPaletteEntryByColorId(palette, colorId)
  if (!source) {
    return []
  }

  return palette.entries
    .filter(
      (entry) =>
        entry.colorId !== source.colorId &&
        Number.isInteger(entry.paletteIndex) &&
        entry.paletteIndex >= MIN_PALETTE_INDEX &&
        entry.paletteIndex <= MAX_PALETTE_INDEX,
    )
    .map((entry) => ({
      paletteIndex: entry.paletteIndex,
      colorId: entry.colorId,
      distance: deltaE76(source.lab, entry.lab),
    }))
    .sort((left, right) => left.distance - right.distance || left.paletteIndex - right.paletteIndex)
    .slice(0, limit)
}
