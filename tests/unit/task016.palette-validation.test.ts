import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE, assertValidPalette, validatePalette } from '../../src/domain/palette'
import type { Palette, PaletteEntry } from '../../src/domain/palette'

function cloneEntries(): PaletteEntry[] {
  return MARD_291_PALETTE.entries.map((entry) => ({
    ...entry,
    rgb: { ...entry.rgb },
    lab: { ...entry.lab },
  }))
}

function makePalette(
  update: (entries: PaletteEntry[], byColorId: Map<string, PaletteEntry>) => void = () => undefined,
): Palette {
  const entries = cloneEntries()
  const byColorId = new Map(entries.map((entry) => [entry.colorId, entry] as const))
  update(entries, byColorId)

  return {
    ...MARD_291_PALETTE,
    entries,
    byColorId,
  }
}

function expectInvalid(palette: unknown, path: string): void {
  const result = validatePalette(palette)

  expect(result.valid).toBe(false)
  expect(result.issues.some((issue) => issue.path === path)).toBe(true)
}

describe('Palette validation', () => {
  it('accepts the production MARD 291 Palette', () => {
    const result = validatePalette(MARD_291_PALETTE)

    expect(result).toEqual({ valid: true, issues: [] })
    expect(() => assertValidPalette(MARD_291_PALETTE)).not.toThrow()
  })

  it('rejects an incomplete entries array', () => {
    const palette = makePalette((entries) => entries.pop())

    expectInvalid(palette, 'entries')
  })

  it('rejects invalid source and an empty palette version', () => {
    const palette = makePalette()
    const invalidPalette = { ...palette, source: 'OTHER', paletteVersion: ' ' }

    expectInvalid(invalidPalette, 'source')
    expectInvalid(invalidPalette, 'paletteVersion')
  })

  it('rejects duplicate, missing, and out-of-range palette indexes', () => {
    expectInvalid(
      makePalette((entries) => {
        entries[1] = { ...entries[1], paletteIndex: entries[0].paletteIndex }
      }),
      'entries[1].paletteIndex',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], paletteIndex: 292 }
      }),
      'entries[0].paletteIndex',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], paletteIndex: 2 }
      }),
      'entries.paletteIndex',
    )
  })

  it('rejects duplicate or empty identity fields', () => {
    expectInvalid(
      makePalette((entries) => {
        entries[1] = { ...entries[1], colorId: entries[0].colorId }
      }),
      'entries[1].colorId',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[1] = { ...entries[1], displayCode: entries[0].displayCode }
      }),
      'entries[1].displayCode',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], colorId: '', displayCode: '', name: '', family: '' }
      }),
      'entries[0].colorId',
    )
  })

  it('rejects invalid RGB, HEX, and Lab values', () => {
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], rgb: { r: 256, g: 0, b: 0 } }
      }),
      'entries[0].rgb.r',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], hex: '#12345' }
      }),
      'entries[0].hex',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], hex: '#000000' }
      }),
      'entries[0].hex',
    )
    expectInvalid(
      makePalette((entries) => {
        entries[0] = { ...entries[0], lab: { l: Number.NaN, a: 0, b: Number.POSITIVE_INFINITY } }
      }),
      'entries[0].lab.l',
    )
  })

  it('rejects inconsistent byColorId maps', () => {
    expectInvalid(
      makePalette((_, byColorId) => {
        byColorId.delete('mard:a1')
      }),
      'byColorId',
    )
    expectInvalid(
      makePalette((entries, byColorId) => {
        byColorId.set('mard:extra', entries[0])
      }),
      'byColorId',
    )
    expectInvalid(
      makePalette((entries, byColorId) => {
        byColorId.delete('mard:a1')
        byColorId.set('wrong', entries[0])
      }),
      'byColorId.wrong',
    )
    expectInvalid(
      makePalette((entries, byColorId) => {
        byColorId.set('mard:a1', entries[1])
      }),
      'byColorId.mard:a1',
    )
  })
})
