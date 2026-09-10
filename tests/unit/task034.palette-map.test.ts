import { describe, expect, it } from 'vitest'
import { mapPreparedRgbaImageToPalette, mapRgbaImageToPalette } from '../../src/domain/generation'
import { findNearestPaletteColor, MARD_291_PALETTE } from '../../src/domain/palette'
import type { Palette } from '../../src/domain/palette'
import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../src/domain/project'

function createRgbaImage(data: number[], width = data.length / 4, height = 1) {
  return { width, height, data: new Uint8ClampedArray(data) }
}

describe('TASK-034 palette mapping', () => {
  it('maps alpha=0 pixels to EMPTY and ignores hidden RGB', () => {
    const result = mapRgbaImageToPalette(createRgbaImage([255, 0, 255, 0, 0, 0, 0, 0], 2))

    expect(result.pixels).toEqual([
      { kind: 'empty', paletteIndex: EMPTY, colorId: null },
      { kind: 'empty', paletteIndex: EMPTY, colorId: null },
    ])
  })

  it('maps an exact production white pixel to the real white Palette entry', () => {
    const result = mapRgbaImageToPalette(createRgbaImage([255, 255, 255, 255]))

    expect(result.pixels).toEqual([{ kind: 'color', paletteIndex: 278, colorId: 'mard:t1' }])
    expect(result.pixels[0]).not.toMatchObject({ paletteIndex: EMPTY })
  })

  it('maps semi-transparent RGB after white compositing', () => {
    const result = mapRgbaImageToPalette(createRgbaImage([0, 0, 0, 128]))
    const expected = findNearestPaletteColor(MARD_291_PALETTE, { r: 127, g: 127, b: 127 })

    expect(result.pixels).toEqual([
      { kind: 'color', paletteIndex: expected.paletteIndex, colorId: expected.colorId },
    ])
  })

  it.each([1, 64, 254, 255])('keeps alpha=%i as a real color pixel', (alpha) => {
    const result = mapRgbaImageToPalette(createRgbaImage([0, 0, 0, alpha]))

    expect(result.pixels[0].kind).toBe('color')
  })

  it('preserves dimensions, pixel order, Palette version, and input data', () => {
    const source = createRgbaImage(
      [255, 0, 255, 0, 255, 255, 255, 255, 12, 34, 56, 255, 0, 0, 0, 128],
      2,
      2,
    )
    const before = Array.from(source.data)

    const first = mapRgbaImageToPalette(source)
    const second = mapRgbaImageToPalette(source)

    expect(first.width).toBe(2)
    expect(first.height).toBe(2)
    expect(first.paletteVersion).toBe(MARD_291_PALETTE.paletteVersion)
    expect(first).toEqual(second)
    expect(Array.from(source.data)).toEqual(before)
  })

  it('does not call the matcher for an EMPTY prepared pixel', () => {
    const emptyOnlyPalette: Palette = {
      source: 'MARD',
      paletteVersion: 'fixture',
      entries: [],
      byColorId: new Map(),
    }

    expect(
      mapPreparedRgbaImageToPalette(
        { width: 1, height: 1, pixels: [{ kind: 'empty' }] },
        emptyOnlyPalette,
      ),
    ).toEqual({
      width: 1,
      height: 1,
      paletteVersion: 'fixture',
      pixels: [{ kind: 'empty', paletteIndex: EMPTY, colorId: null }],
    })
  })

  it('returns only legal Palette indices for colored pixels', () => {
    const result = mapRgbaImageToPalette(
      createRgbaImage([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255], 3),
    )

    for (const pixel of result.pixels) {
      if (pixel.kind === 'color') {
        expect(pixel.paletteIndex).toBeGreaterThanOrEqual(MIN_PALETTE_INDEX)
        expect(pixel.paletteIndex).toBeLessThanOrEqual(MAX_PALETTE_INDEX)
      } else {
        expect(pixel.paletteIndex).toBe(EMPTY)
      }
    }
  })
})
