import { describe, expect, it } from 'vitest'
import {
  MARD_291_PALETTE,
  deltaE76,
  findNearestPaletteColor,
  findNearestPaletteColorByLab,
  getPaletteEntryByColorId,
  rgbToLab,
} from '../../src/domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../src/domain/constants'
import { EMPTY } from '../../src/domain/project'
import type { Palette } from '../../src/domain/palette'

describe('Palette color matching', () => {
  it('converts known sRGB values with the documented CIELAB D65 rule', () => {
    expect(rgbToLab({ r: 0, g: 0, b: 0 })).toEqual({ l: 0, a: 0, b: 0 })
    const white = rgbToLab({ r: 255, g: 255, b: 255 })
    const a1 = rgbToLab({ r: 250, g: 244, b: 200 })

    expect(white.l).toBeCloseTo(100.000004, 6)
    expect(white.a).toBeCloseTo(-0.000017, 6)
    expect(white.b).toBeCloseTo(0.000007, 6)
    expect(a1.l).toBeCloseTo(95.662558, 6)
    expect(a1.a).toBeCloseTo(-4.930453, 6)
    expect(a1.b).toBeCloseTo(21.971712, 6)
  })

  it('rejects invalid RGB channels and non-finite Lab values', () => {
    expect(() => rgbToLab({ r: -1, g: 0, b: 0 })).toThrow(RangeError)
    expect(() => rgbToLab({ r: 0, g: 256, b: 0 })).toThrow(RangeError)
    expect(() => rgbToLab({ r: 0.5, g: 0, b: 0 })).toThrow(RangeError)
    expect(() => deltaE76({ l: Number.NaN, a: 0, b: 0 }, { l: 0, a: 0, b: 0 })).toThrow(RangeError)
  })

  it('matches production RGB values to their own palette colors', () => {
    for (const entry of [
      MARD_291_PALETTE.entries[0],
      getPaletteEntryByColorId(MARD_291_PALETTE, 'mard:t1'),
      getPaletteEntryByColorId(MARD_291_PALETTE, 'mard:zg8'),
    ]) {
      if (!entry) {
        throw new Error('Expected production Palette entry is missing')
      }

      expect(findNearestPaletteColor(MARD_291_PALETTE, entry.rgb)).toEqual({
        paletteIndex: entry.paletteIndex,
        colorId: entry.colorId,
      })
    }
  })

  it('keeps production static Lab values consistent with RGB conversion', () => {
    for (const entry of MARD_291_PALETTE.entries) {
      const calculated = rgbToLab(entry.rgb)

      expect(calculated.l).toBeCloseTo(entry.lab.l, 6)
      expect(calculated.a).toBeCloseTo(entry.lab.a, 6)
      expect(calculated.b).toBeCloseTo(entry.lab.b, 6)
    }
  })

  it('returns stable legal results for boundary RGB values and repeated input', () => {
    for (const rgb of [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
    ]) {
      const first = findNearestPaletteColor(MARD_291_PALETTE, rgb)
      const second = findNearestPaletteColor(MARD_291_PALETTE, rgb)

      expect(first).toEqual(second)
      expect(first.paletteIndex).toBeGreaterThanOrEqual(MIN_PALETTE_INDEX)
      expect(first.paletteIndex).toBeLessThanOrEqual(MAX_PALETTE_INDEX)
      expect(getPaletteEntryByColorId(MARD_291_PALETTE, first.colorId)?.paletteIndex).toBe(
        first.paletteIndex,
      )
    }
  })

  it('uses the lowest paletteIndex as the deterministic tie-break', () => {
    const first = MARD_291_PALETTE.entries[0]
    const second = MARD_291_PALETTE.entries[1]
    const secondWithSameLab = { ...second, lab: { ...first.lab } }
    const tiePalette: Palette = {
      ...MARD_291_PALETTE,
      entries: [secondWithSameLab, first],
      byColorId: new Map([
        [first.colorId, first],
        [secondWithSameLab.colorId, secondWithSameLab],
      ]),
    }

    expect(findNearestPaletteColorByLab(tiePalette, first.lab)).toEqual({
      paletteIndex: first.paletteIndex,
      colorId: first.colorId,
    })
  })

  it('does not allow EMPTY to participate in matching', () => {
    const first = MARD_291_PALETTE.entries[0]
    const emptyEntry = { ...first, paletteIndex: EMPTY, colorId: 'empty-fixture' }
    const paletteWithEmpty: Palette = {
      ...MARD_291_PALETTE,
      entries: [emptyEntry, first],
      byColorId: new Map([
        [emptyEntry.colorId, emptyEntry],
        [first.colorId, first],
      ]),
    }

    expect(findNearestPaletteColorByLab(paletteWithEmpty, first.lab)).toEqual({
      paletteIndex: first.paletteIndex,
      colorId: first.colorId,
    })
  })

  it('is independent from entries array order', () => {
    const reorderedPalette: Palette = {
      ...MARD_291_PALETTE,
      entries: [...MARD_291_PALETTE.entries].reverse(),
    }
    const input = { r: 250, g: 244, b: 200 }

    expect(findNearestPaletteColor(reorderedPalette, input)).toEqual(
      findNearestPaletteColor(MARD_291_PALETTE, input),
    )
  })
})
