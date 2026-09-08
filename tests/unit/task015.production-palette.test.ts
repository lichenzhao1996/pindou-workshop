import { describe, expect, it } from 'vitest'
import {
  MARD_291_PALETTE,
  MARD_291_PALETTE_SOURCE,
  MARD_291_PALETTE_VERSION,
  getPaletteEntryByColorId,
  getPaletteEntryByIndex,
} from '../../src/domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../src/domain/constants'
import { DEFAULT_PALETTE_VERSION, EMPTY } from '../../src/domain/project'
import type { Palette, PaletteEntry } from '../../src/domain/palette'

const expectedFamilies = new Set([
  'series:A',
  'series:B',
  'series:C',
  'series:D',
  'series:E',
  'series:F',
  'series:G',
  'series:H',
  'series:M',
  'series:P',
  'series:Q',
  'series:R',
  'series:T',
  'series:Y',
  'series:ZG',
])

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}

describe('production MARD 291 Palette', () => {
  it('loads the fixed local source with stable provenance', () => {
    expect(MARD_291_PALETTE.source).toBe('MARD')
    expect(MARD_291_PALETTE_VERSION).toBe(
      'MARD-291-community-maxcleme-beadcolors-29229889daab404fb30531d4bb785fd73f7f58e3-import-v1',
    )
    expect(MARD_291_PALETTE.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
    expect(DEFAULT_PALETTE_VERSION).toBe(MARD_291_PALETTE_VERSION)
    expect(MARD_291_PALETTE_SOURCE).toMatchObject({
      repository: 'maxcleme/beadcolors',
      commit: '29229889daab404fb30531d4bb785fd73f7f58e3',
      sourcePath: 'raw/mard.csv',
      license: 'MIT',
      importVersion: 'task015-v1',
    })
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, MIN_PALETTE_INDEX)?.displayCode).toBe('A1')
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, MAX_PALETTE_INDEX)?.displayCode).toBe('ZG8')
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, EMPTY)).toBeUndefined()
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, MAX_PALETTE_INDEX + 1)).toBeUndefined()
  })

  it('contains exactly 291 entries with explicit continuous palette indexes', () => {
    const indexes = MARD_291_PALETTE.entries.map((entry) => entry.paletteIndex)

    expect(MARD_291_PALETTE.entries).toHaveLength(291)
    expect(new Set(indexes).size).toBe(291)
    expect(indexes).toEqual(
      Array.from(
        { length: MAX_PALETTE_INDEX - MIN_PALETTE_INDEX + 1 },
        (_, index) => index + MIN_PALETTE_INDEX,
      ),
    )
  })

  it('provides stable identity fields and deterministic product families', () => {
    const colorIds = MARD_291_PALETTE.entries.map((entry) => entry.colorId)
    const displayCodes = MARD_291_PALETTE.entries.map((entry) => entry.displayCode)

    expect(new Set(colorIds).size).toBe(291)
    expect(new Set(displayCodes).size).toBe(291)
    expect(MARD_291_PALETTE.byColorId.size).toBe(291)

    for (const entry of MARD_291_PALETTE.entries) {
      expect(entry.colorId).toBe(`mard:${entry.displayCode.toLowerCase()}`)
      expect(entry.displayCode).not.toBe('')
      expect(entry.name).toBe(entry.displayCode)
      expect(expectedFamilies.has(entry.family)).toBe(true)
      expect(MARD_291_PALETTE.byColorId.get(entry.colorId)).toBe(entry)
    }
  })

  it('keeps RGB, derived HEX, and derived Lab data valid and consistent', () => {
    for (const entry of MARD_291_PALETTE.entries) {
      const { r, g, b } = entry.rgb

      expect(Number.isInteger(r) && r >= 0 && r <= 255).toBe(true)
      expect(Number.isInteger(g) && g >= 0 && g <= 255).toBe(true)
      expect(Number.isInteger(b) && b >= 0 && b <= 255).toBe(true)
      expect(entry.hex).toBe(`#${toHex(r)}${toHex(g)}${toHex(b)}`)
      expect(Number.isFinite(entry.lab.l)).toBe(true)
      expect(Number.isFinite(entry.lab.a)).toBe(true)
      expect(Number.isFinite(entry.lab.b)).toBe(true)
    }
  })

  it('keeps lookup identity independent from entries array order', () => {
    const reorderedEntries: readonly PaletteEntry[] = [...MARD_291_PALETTE.entries].reverse()
    const reorderedPalette: Palette = {
      ...MARD_291_PALETTE,
      entries: reorderedEntries,
      byColorId: new Map(reorderedEntries.map((entry) => [entry.colorId, entry] as const)),
    }

    expect(getPaletteEntryByIndex(reorderedPalette, 1)).toBe(
      getPaletteEntryByIndex(MARD_291_PALETTE, 1),
    )
    expect(getPaletteEntryByIndex(reorderedPalette, 291)).toBe(
      getPaletteEntryByIndex(MARD_291_PALETTE, 291),
    )
    expect(getPaletteEntryByColorId(reorderedPalette, 'mard:a1')).toBe(
      getPaletteEntryByColorId(MARD_291_PALETTE, 'mard:a1'),
    )
  })

  it('keeps real white separate from EMPTY', () => {
    const white = getPaletteEntryByColorId(MARD_291_PALETTE, 'mard:t1')

    expect(EMPTY).toBe(0)
    expect(white?.paletteIndex).toBeGreaterThanOrEqual(MIN_PALETTE_INDEX)
    expect(white?.rgb).toEqual({ r: 255, g: 255, b: 255 })
    expect(getPaletteEntryByIndex(MARD_291_PALETTE, EMPTY)).toBeUndefined()
  })
})
