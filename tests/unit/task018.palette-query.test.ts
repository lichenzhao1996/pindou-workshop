import { describe, expect, it } from 'vitest'
import {
  MARD_291_PALETTE,
  filterPaletteByFamily,
  findSimilarPaletteColors,
  getPaletteEntryByColorId,
  groupPaletteByFamily,
  searchPalette,
  sortPaletteEntries,
} from '../../src/domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../src/domain/constants'

describe('Palette query helpers', () => {
  it('searches colorId, displayCode, and name case-insensitively', () => {
    expect(searchPalette(MARD_291_PALETTE, 'MARD:A26').map((entry) => entry.displayCode)).toEqual([
      'A26',
    ])
    expect(searchPalette(MARD_291_PALETTE, 'zg1').map((entry) => entry.colorId)).toEqual([
      'mard:zg1',
    ])
    expect(searchPalette(MARD_291_PALETTE, 'A26').map((entry) => entry.name)).toEqual(['A26'])
    expect(searchPalette(MARD_291_PALETTE, 'does-not-exist')).toEqual([])
    expect(searchPalette(MARD_291_PALETTE, '   ')).toBe(MARD_291_PALETTE.entries)
  })

  it('groups every entry by family without duplication', () => {
    const groups = groupPaletteByFamily(MARD_291_PALETTE)
    const groupedEntries = [...groups.values()].flat()

    expect(groups.size).toBe(15)
    expect(groupedEntries).toHaveLength(291)
    expect(new Set(groupedEntries.map((entry) => entry.paletteIndex)).size).toBe(291)
    expect(
      filterPaletteByFamily(MARD_291_PALETTE, 'SERIES:ZG').map((entry) => entry.displayCode),
    ).toEqual(['ZG1', 'ZG2', 'ZG3', 'ZG4', 'ZG5', 'ZG6', 'ZG7', 'ZG8'])
  })

  it('sorts by MARD display code using a deterministic natural order', () => {
    const entries = [
      MARD_291_PALETTE.entries[9],
      MARD_291_PALETTE.entries[1],
      MARD_291_PALETTE.entries[0],
    ]

    expect(sortPaletteEntries(entries).map((entry) => entry.displayCode)).toEqual([
      'A1',
      'A2',
      'A10',
    ])
    expect(entries.map((entry) => entry.displayCode)).toEqual(['A10', 'A2', 'A1'])
  })

  it('returns stable nearby colors from the same Palette', () => {
    const first = findSimilarPaletteColors(MARD_291_PALETTE, 'mard:a1', 6)
    const second = findSimilarPaletteColors(MARD_291_PALETTE, 'mard:a1', 6)

    expect(first).toEqual(second)
    expect(first).toHaveLength(6)
    expect(first.every((entry) => entry.colorId !== 'mard:a1')).toBe(true)
    expect(first.every((entry) => entry.paletteIndex >= MIN_PALETTE_INDEX)).toBe(true)
    expect(first.every((entry) => entry.paletteIndex <= MAX_PALETTE_INDEX)).toBe(true)
    expect(first.every((entry) => Number.isFinite(entry.distance))).toBe(true)
    expect(first.map((entry) => entry.distance)).toEqual(
      [...first]
        .sort((left, right) => left.distance - right.distance)
        .map((entry) => entry.distance),
    )
    expect(getPaletteEntryByColorId(MARD_291_PALETTE, first[0].colorId)?.paletteIndex).toBe(
      first[0].paletteIndex,
    )
    expect(findSimilarPaletteColors(MARD_291_PALETTE, 'missing-color')).toEqual([])
    expect(findSimilarPaletteColors(MARD_291_PALETTE, 'mard:a1', 0)).toEqual([])
  })
})
