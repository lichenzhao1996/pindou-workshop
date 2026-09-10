import { describe, expect, it, vi } from 'vitest'
import {
  generateGenerationResultFromRgbaImage,
  generateHighFidelityGenerationResult,
  generateHighFidelityGenerationResultFromRgbaImage,
  type GenerationRequest,
  type RgbaImage,
} from '../../src/domain/generation'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'

const request: GenerationRequest = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  crop: {
    x: 0,
    y: 0,
    width: 4,
    height: 3,
    rotation: 0,
    aspectRatio: 4 / 3,
  },
  widthBeads: 64,
  mode: 'high-fidelity',
  paletteVersion: MARD_291_PALETTE_VERSION,
  algorithmVersion: 'high-fidelity-v1',
}

function createImage(width: number, height: number, values: number[] = []): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  data.set(values)
  return { width, height, data }
}

function createTargetImage(): RgbaImage {
  const image = createImage(64, 48)
  image.data.fill(0)
  image.data.set([255, 255, 255, 255], 4)
  image.data.set([0, 0, 0, 128], 8)
  return image
}

describe('TASK-036 high-fidelity baseline', () => {
  it('reuses the base pipeline and produces a legal target-size Grid', () => {
    const rasterized = createImage(4, 3)
    const resampler = vi.fn(() => createTargetImage())

    const highFidelity = generateHighFidelityGenerationResultFromRgbaImage(request, rasterized, {
      resample: resampler,
      palette: MARD_291_PALETTE,
    })
    const base = generateGenerationResultFromRgbaImage(request, rasterized, {
      resample: () => createTargetImage(),
      palette: MARD_291_PALETTE,
    })

    expect(resampler).toHaveBeenCalledWith(rasterized, request)
    expect(highFidelity.grid.width).toBe(64)
    expect(highFidelity.grid.height).toBe(48)
    expect(highFidelity.grid.cells).toBeInstanceOf(Uint16Array)
    expect(Array.from(highFidelity.grid.cells)).toEqual(Array.from(base.grid.cells))
    expect(highFidelity.algorithmVersion).toBe('high-fidelity-v1')
  })

  it('keeps EMPTY, white, and semi-transparent pixels on the shared Alpha path', () => {
    const result = generateHighFidelityGenerationResultFromRgbaImage(request, createImage(4, 3), {
      resample: createTargetImage,
      palette: MARD_291_PALETTE,
    })

    expect(result.grid.cells[0]).toBe(0)
    expect(result.grid.cells[1]).toBe(278)
    expect(result.grid.cells[2]).toBeGreaterThanOrEqual(1)
    expect(result.grid.cells[2]).toBeLessThanOrEqual(291)
  })

  it('does not perform neighborhood optimization, dithering, or sharpening', () => {
    const rasterized = createImage(4, 3, [12, 34, 56, 255])
    const before = Array.from(rasterized.data)
    const result = generateHighFidelityGenerationResultFromRgbaImage(request, rasterized, {
      resample: () => createTargetImage(),
    })

    expect(result.grid.cells.length).toBe(64 * 48)
    expect(Array.from(rasterized.data)).toEqual(before)
  })

  it('requires the high-fidelity mode and does not add an optimized fallback', () => {
    expect(() =>
      generateHighFidelityGenerationResultFromRgbaImage(
        { ...request, mode: 'optimized' },
        createImage(1, 1),
        { resample: () => createImage(64, 48) },
      ),
    ).toThrow(RangeError)
  })

  it('starts from the original request image and confirmed CropState', async () => {
    const decoded = createImage(4, 3)
    const decode = vi.fn(async () => decoded)
    const resample = vi.fn(() => createTargetImage())

    const result = await generateHighFidelityGenerationResult(request, { decode, resample })

    expect(decode).toHaveBeenCalledWith(request.originalImage)
    expect(resample).toHaveBeenCalledWith(expect.objectContaining({ width: 4, height: 3 }), request)
    expect(result.grid.width).toBe(64)
    expect(result.grid.height).toBe(48)
  })
})
