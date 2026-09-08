import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../constants'
import type { Palette, PaletteEntry } from './types'

export function getPaletteEntryByColorId(
  palette: Palette,
  colorId: string,
): PaletteEntry | undefined {
  if (!colorId) {
    return undefined
  }

  return palette.byColorId.get(colorId)
}

export function getPaletteEntryByIndex(
  palette: Palette,
  paletteIndex: number,
): PaletteEntry | undefined {
  if (
    !Number.isInteger(paletteIndex) ||
    paletteIndex < MIN_PALETTE_INDEX ||
    paletteIndex > MAX_PALETTE_INDEX
  ) {
    return undefined
  }

  return palette.entries.find((entry) => entry.paletteIndex === paletteIndex)
}
