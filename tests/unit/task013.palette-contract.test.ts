import { describe, expect, it } from 'vitest'
import { getPaletteEntryByColorId, getPaletteEntryByIndex } from '../../src/domain/palette'
import type { Palette, PaletteEntry } from '../../src/domain/palette'

const firstEntry: PaletteEntry = {
  paletteIndex: 1,
  colorId: 'fixture-color-a',
  displayCode: 'MARD-TEST-A',
  name: '测试颜色 A',
  rgb: { r: 10, g: 20, b: 30 },
  hex: '#0A141E',
  lab: { l: 8, a: -1, b: -5 },
  family: '测试色系',
}

const secondEntry: PaletteEntry = {
  paletteIndex: 291,
  colorId: 'fixture-color-b',
  displayCode: 'MARD-TEST-B',
  name: '测试颜色 B',
  rgb: { r: 240, g: 230, b: 220 },
  hex: '#F0E6DC',
  lab: { l: 92, a: 2, b: 8 },
  family: '测试色系',
}

const palette: Palette = {
  source: 'MARD',
  paletteVersion: 'fixture-only',
  entries: [firstEntry, secondEntry],
  byColorId: new Map([
    [firstEntry.colorId, firstEntry],
    [secondEntry.colorId, secondEntry],
  ]),
}

describe('Palette contract', () => {
  it('expresses the MARD source and required entry metadata', () => {
    expect(palette.source).toBe('MARD')
    expect(palette.paletteVersion).toBe('fixture-only')
    expect(palette.entries).toHaveLength(2)
    expect(firstEntry).toMatchObject({
      paletteIndex: 1,
      colorId: 'fixture-color-a',
      displayCode: 'MARD-TEST-A',
      rgb: { r: 10, g: 20, b: 30 },
      lab: { l: 8, a: -1, b: -5 },
      family: '测试色系',
    })
  })

  it('reads entries through the colorId and palette index accessors', () => {
    expect(getPaletteEntryByColorId(palette, firstEntry.colorId)).toBe(firstEntry)
    expect(getPaletteEntryByIndex(palette, secondEntry.paletteIndex)).toBe(secondEntry)
    expect(getPaletteEntryByColorId(palette, 'missing')).toBeUndefined()
    expect(getPaletteEntryByIndex(palette, 0)).toBeUndefined()
    expect(getPaletteEntryByIndex(palette, 292)).toBeUndefined()
    expect(getPaletteEntryByIndex(palette, 1.5)).toBeUndefined()
  })

  it('keeps Grid-facing lookup values numeric and separate from display metadata', () => {
    const entry = getPaletteEntryByIndex(palette, 1)

    expect(entry?.paletteIndex).toBe(1)
    expect(entry?.colorId).toBe('fixture-color-a')
    expect(entry?.displayCode).toBe('MARD-TEST-A')
    expect(typeof entry?.rgb).toBe('object')
    expect(typeof entry?.hex).toBe('string')
  })

  it('enforces the 1-to-291 index contract even for malformed Palette entries', () => {
    const malformedEntry = {
      ...firstEntry,
      paletteIndex: 292,
      colorId: 'fixture-invalid-index',
    }
    const malformedPalette: Palette = {
      ...palette,
      entries: [...palette.entries, malformedEntry],
    }

    expect(getPaletteEntryByIndex(malformedPalette, 1)).toBe(firstEntry)
    expect(getPaletteEntryByIndex(malformedPalette, 291)).toBe(secondEntry)

    for (const invalidIndex of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 292, 293]) {
      expect(getPaletteEntryByIndex(malformedPalette, invalidIndex)).toBeUndefined()
    }
  })
})
