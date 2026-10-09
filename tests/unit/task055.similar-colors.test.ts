import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE, findSimilarPaletteColors } from '../../src/domain/palette'
import type { Palette } from '../../src/domain/palette/types'

describe('TASK-055 similar MARD colors', () => {
  it('returns at most six legal candidates, excludes itself, and orders by ΔE76 then palette index', () => {
    const source = MARD_291_PALETTE.entries[0]
    const result = findSimilarPaletteColors(MARD_291_PALETTE, source.colorId)

    expect(result).toHaveLength(6)
    expect(result.some((candidate) => candidate.colorId === source.colorId)).toBe(false)
    expect(
      result.every((candidate) => candidate.paletteIndex >= 1 && candidate.paletteIndex <= 291),
    ).toBe(true)
    expect(result).toEqual(
      [...result].sort(
        (left, right) => left.distance - right.distance || left.paletteIndex - right.paletteIndex,
      ),
    )
    expect(findSimilarPaletteColors(MARD_291_PALETTE, 'unknown')).toEqual([])
  })

  it('breaks equal ΔE76 distances by paletteIndex without applying a distance cutoff', () => {
    const [source, firstCandidate, secondCandidate] = MARD_291_PALETTE.entries
    const distantLab = { l: 500, a: 500, b: 500 }
    const tiedPalette: Palette = {
      ...MARD_291_PALETTE,
      entries: [
        source,
        { ...firstCandidate, paletteIndex: 18, lab: distantLab },
        { ...secondCandidate, paletteIndex: 3, lab: distantLab },
      ],
      byColorId: new Map([[source.colorId, source]]),
    }

    expect(
      findSimilarPaletteColors(tiedPalette, source.colorId, 6).map((entry) => entry.paletteIndex),
    ).toEqual([3, 18])
    expect(findSimilarPaletteColors(tiedPalette, source.colorId, 6)[0].distance).toBeGreaterThan(
      100,
    )
  })
})
