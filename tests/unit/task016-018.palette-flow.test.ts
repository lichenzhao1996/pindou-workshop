import { describe, expect, it } from 'vitest'
import {
  MARD_291_PALETTE,
  assertValidPalette,
  findNearestPaletteColor,
  findSimilarPaletteColors,
  getPaletteEntryByIndex,
  searchPalette,
} from '../../src/domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../src/domain/constants'

describe('Palette validation and query flow', () => {
  it('uses one validated Palette for matching, searching, and recommendations', () => {
    expect(() => assertValidPalette(MARD_291_PALETTE)).not.toThrow()

    const match = findNearestPaletteColor(MARD_291_PALETTE, {
      r: 250,
      g: 244,
      b: 200,
    })
    const searchResults = searchPalette(MARD_291_PALETTE, match.colorId)
    const recommendations = findSimilarPaletteColors(MARD_291_PALETTE, match.colorId, 3)

    expect(searchResults.map((entry) => entry.colorId)).toContain(match.colorId)
    expect(recommendations).toHaveLength(3)
    expect(
      recommendations.every(
        (recommendation) =>
          recommendation.paletteIndex >= MIN_PALETTE_INDEX &&
          recommendation.paletteIndex <= MAX_PALETTE_INDEX &&
          getPaletteEntryByIndex(MARD_291_PALETTE, recommendation.paletteIndex)?.colorId ===
            recommendation.colorId,
      ),
    ).toBe(true)
  })
})
