import { describe, expect, it } from 'vitest'
import {
  MARD_291_PALETTE,
  groupPaletteEntriesByFamily,
  searchPalette,
  sortPaletteEntries,
} from '../../src/domain/palette'
import type { Palette } from '../../src/domain/palette/types'

describe('TASK-051–053 unified Palette browser data', () => {
  it('exposes exactly the 291 formal colors and never treats EMPTY as a selectable entry', () => {
    expect(MARD_291_PALETTE.entries).toHaveLength(291)
    expect(
      sortPaletteEntries(MARD_291_PALETTE.entries).map((entry) => entry.paletteIndex),
    ).toHaveLength(291)
    expect(MARD_291_PALETTE.entries.some((entry) => entry.paletteIndex === 0)).toBe(false)
    expect(
      MARD_291_PALETTE.entries.some(
        (entry) => entry.rgb.r === 255 && entry.rgb.g === 255 && entry.rgb.b === 255,
      ),
    ).toBe(true)
  })

  it('searches colorId, displayCode, and name with trimming, case-folding, and substring matching', () => {
    expect(
      searchPalette(MARD_291_PALETTE, '  MARD:A26 ').map((entry) => entry.displayCode),
    ).toEqual(['A26'])
    expect(searchPalette(MARD_291_PALETTE, ' zg1 ').map((entry) => entry.colorId)).toEqual([
      'mard:zg1',
    ])
    expect(searchPalette(MARD_291_PALETTE, 'A2').map((entry) => entry.displayCode)).toContain('A26')
    expect(searchPalette(MARD_291_PALETTE, 'does-not-exist')).toEqual([])
    expect(searchPalette(MARD_291_PALETTE, '   ')).toBe(MARD_291_PALETTE.entries)

    const base = MARD_291_PALETTE.entries[0]
    const distinctFieldsPalette: Palette = {
      ...MARD_291_PALETTE,
      entries: [{ ...base, colorId: 'mard:unique-id', displayCode: 'X91', name: 'Violet Bloom' }],
      byColorId: new Map(),
    }
    expect(searchPalette(distinctFieldsPalette, 'unique-id')).toHaveLength(1)
    expect(searchPalette(distinctFieldsPalette, 'x91')).toHaveLength(1)
    expect(searchPalette(distinctFieldsPalette, 'BLOOM')).toHaveLength(1)
  })

  it('sorts code results naturally and filters before family grouping', () => {
    const filtered = searchPalette(MARD_291_PALETTE, 'zg')
    const groups = groupPaletteEntriesByFamily(filtered)
    const entries = [...groups.values()].flat()

    expect(groups.size).toBe(1)
    expect([...groups.keys()]).toEqual(['series:ZG'])
    expect(entries.map((entry) => entry.displayCode)).toEqual([
      'ZG1',
      'ZG2',
      'ZG3',
      'ZG4',
      'ZG5',
      'ZG6',
      'ZG7',
      'ZG8',
    ])
    expect(
      sortPaletteEntries(searchPalette(MARD_291_PALETTE, 'A1')).map((entry) => entry.displayCode),
    ).toEqual(['A1', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19'])
  })
})
