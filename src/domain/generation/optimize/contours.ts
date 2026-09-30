import { getPaletteEntryByIndex } from '../../palette/accessors'
import { MARD_291_PALETTE } from '../../palette/mard291'
import { deltaE76 } from '../../palette/match'
import type { Palette } from '../../palette/types'
import { EMPTY } from '../../project/constants'
import type { GridFragmentAnalysis } from './fragments'

const MAX_PROTECTED_REGION_SIZE = 3
const MIN_CONTOUR_LIGHTNESS_DIFFERENCE = 12
const MIN_CONTOUR_DELTA_E76 = 18

/** Marks whole small regions before fragment merging; it never changes Grid colors. */
export function getProtectedFragmentRegionIds(
  fragments: readonly GridFragmentAnalysis[],
  palette: Palette = MARD_291_PALETTE,
): ReadonlySet<number> {
  const protectedRegionIds = new Set<number>()

  for (const fragment of fragments) {
    if (
      fragment.paletteIndex === EMPTY ||
      fragment.size < 1 ||
      fragment.size > MAX_PROTECTED_REGION_SIZE
    ) {
      continue
    }

    if (fragment.touchesGridEdge || fragment.neighborCounts.has(EMPTY)) {
      protectedRegionIds.add(fragment.regionId)
      continue
    }

    const source = getPaletteEntryByIndex(palette, fragment.paletteIndex)
    if (!source) {
      throw new RangeError(`Palette entry ${fragment.paletteIndex} is missing`)
    }

    for (const paletteIndex of fragment.neighborCounts.keys()) {
      const neighbor = getPaletteEntryByIndex(palette, paletteIndex)
      if (!neighbor) {
        throw new RangeError(`Palette entry ${paletteIndex} is missing`)
      }

      if (
        Math.abs(source.lab.l - neighbor.lab.l) >= MIN_CONTOUR_LIGHTNESS_DIFFERENCE ||
        deltaE76(source.lab, neighbor.lab) >= MIN_CONTOUR_DELTA_E76
      ) {
        protectedRegionIds.add(fragment.regionId)
        break
      }
    }
  }

  return protectedRegionIds
}
