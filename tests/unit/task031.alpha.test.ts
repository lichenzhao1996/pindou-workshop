import { describe, expect, it } from 'vitest'
import {
  compositeAlphaOverWhite,
  normalizeRgbaImage,
  type RgbaPixel,
} from '../../src/domain/generation'

describe('TASK-031 alpha normalization', () => {
  it.each([
    [0, 0, 0, 0],
    [255, 0, 255, 0],
  ] as const)('classifies alpha=0 as empty and ignores RGB (%i, %i, %i)', (r, g, b, alpha) => {
    expect(compositeAlphaOverWhite({ r, g, b, alpha })).toEqual({ kind: 'empty' })
  })

  it('keeps opaque RGB unchanged', () => {
    expect(compositeAlphaOverWhite({ r: 12, g: 34, b: 56, alpha: 255 })).toEqual({
      kind: 'rgb',
      r: 12,
      g: 34,
      b: 56,
    })
  })

  it('keeps opaque white as a real RGB pixel', () => {
    expect(compositeAlphaOverWhite({ r: 255, g: 255, b: 255, alpha: 255 })).toEqual({
      kind: 'rgb',
      r: 255,
      g: 255,
      b: 255,
    })
  })

  it('composites semi-transparent black over white with Math.round', () => {
    expect(compositeAlphaOverWhite({ r: 0, g: 0, b: 0, alpha: 128 })).toEqual({
      kind: 'rgb',
      r: 127,
      g: 127,
      b: 127,
    })
  })

  it('composites semi-transparent red over white', () => {
    expect(compositeAlphaOverWhite({ r: 255, g: 0, b: 0, alpha: 128 })).toEqual({
      kind: 'rgb',
      r: 255,
      g: 127,
      b: 127,
    })
  })

  it.each([
    [1, 254],
    [254, 1],
  ] as const)('treats alpha=%i as a real pixel, not empty', (alpha, expected) => {
    expect(compositeAlphaOverWhite({ r: 0, g: 0, b: 0, alpha })).toEqual({
      kind: 'rgb',
      r: expected,
      g: expected,
      b: expected,
    })
  })

  it('normalizes a complete image in stable order without mutating input data', () => {
    const imageData = new Uint8ClampedArray([255, 0, 255, 0, 12, 34, 56, 255, 0, 0, 0, 128])
    const image = { width: 3, height: 1, data: imageData }
    const before = Array.from(imageData)

    expect(normalizeRgbaImage(image)).toEqual({
      width: 3,
      height: 1,
      pixels: [
        { kind: 'empty' },
        { kind: 'rgb', r: 12, g: 34, b: 56 },
        { kind: 'rgb', r: 127, g: 127, b: 127 },
      ],
    })
    expect(Array.from(imageData)).toEqual(before)
  })

  it('preserves dimensions and returns deterministic results', () => {
    const image = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([0, 0, 0, 0, 20, 40, 60, 1, 70, 80, 90, 254, 255, 255, 255, 255]),
    }

    const first = normalizeRgbaImage(image)
    const second = normalizeRgbaImage(image)

    expect(first.width).toBe(2)
    expect(first.height).toBe(2)
    expect(first).toEqual(second)
  })

  it('rejects non-byte pixel channels', () => {
    expect(() => compositeAlphaOverWhite({ r: 0, g: 0, b: 0, alpha: 256 } as RgbaPixel)).toThrow(
      RangeError,
    )
  })
})
