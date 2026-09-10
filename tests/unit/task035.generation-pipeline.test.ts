import { describe, expect, it, vi } from 'vitest'
import {
  createGenerationWorkerClient,
  createGenerationWorkerRequest,
  generateGenerationResult,
  generateGenerationResultFromRgbaImage,
  createGridFromPaletteMappedImage,
  type GenerationResult,
  type GenerationWorkerLike,
  type GenerationWorkerResponseMessage,
  type RgbaImage,
} from '../../src/domain/generation'
import type { GenerationRequest } from '../../src/domain/generation'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { handleGenerationWorkerMessage } from '../../src/workers/generation.worker'

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
  mode: 'optimized',
  paletteVersion: MARD_291_PALETTE_VERSION,
  algorithmVersion: 'v1-basic',
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

function createResult(): GenerationResult {
  return {
    grid: { width: 1, height: 1, cells: new Uint16Array([0]) },
    heightBeads: 1,
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: 'v1-basic',
    diagnostics: {
      sourceSize: { width: 4, height: 3 },
      cropSize: { width: 4, height: 3 },
      elapsedMs: 0,
    },
  }
}

class FakeWorker implements GenerationWorkerLike {
  readonly posted: Parameters<GenerationWorkerLike['postMessage']>[0][] = []
  private readonly listeners = new Set<(event: unknown) => void>()

  addEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    if (type === 'message') {
      this.listeners.delete(listener)
    }
  }

  postMessage(message: Parameters<GenerationWorkerLike['postMessage']>[0]): void {
    this.posted.push(message)
  }

  terminate(): void {}

  emitMessage(data: GenerationWorkerResponseMessage): void {
    this.listeners.forEach((listener) => listener({ data }))
  }
}

describe('TASK-035 generation pipeline', () => {
  it('resamples, normalizes, maps and creates a legal target-size Grid', () => {
    const rasterized = createImage(4, 3)
    const resampler = vi.fn(() => createTargetImage())

    const result = generateGenerationResultFromRgbaImage(request, rasterized, {
      resample: resampler,
    })

    expect(resampler).toHaveBeenCalledWith(rasterized, request)
    expect(result.grid.width).toBe(64)
    expect(result.grid.height).toBe(48)
    expect(result.grid.cells).toBeInstanceOf(Uint16Array)
    expect(result.grid.cells[0]).toBe(0)
    expect(result.grid.cells[1]).toBe(278)
    expect(result.grid.cells[2]).toBeGreaterThanOrEqual(1)
    expect(result.grid.cells[2]).toBeLessThanOrEqual(291)
    expect(Array.from(result.grid.cells).every((cell) => cell >= 0 && cell <= 291)).toBe(true)
  })

  it('keeps the complete pipeline deterministic and does not mutate input pixels', () => {
    const rasterized = createImage(4, 3, [12, 34, 56, 255])
    const before = Array.from(rasterized.data)
    const resample = () => createTargetImage()

    const first = generateGenerationResultFromRgbaImage(request, rasterized, { resample })
    const second = generateGenerationResultFromRgbaImage(request, rasterized, { resample })

    expect(Array.from(first.grid.cells)).toEqual(Array.from(second.grid.cells))
    expect(Array.from(rasterized.data)).toEqual(before)
    expect(first.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
    expect(first.algorithmVersion).toBe('v1-basic')
    expect(first.diagnostics.sourceSize).toEqual({ width: 4, height: 3 })
    expect(first.diagnostics.cropSize).toEqual({ width: 4, height: 3 })
  })

  it('uses the decoded source and confirmed crop before the shared resampler', async () => {
    const decoded = createImage(4, 3)
    const target = createTargetImage()
    const decode = vi.fn(async () => decoded)
    const resample = vi.fn(() => target)

    const result = await generateGenerationResult(request, { decode, resample })

    expect(decode).toHaveBeenCalledWith(request.originalImage)
    expect(resample).toHaveBeenCalledWith(expect.objectContaining({ width: 4, height: 3 }), request)
    expect(result.grid.width).toBe(64)
    expect(result.grid.height).toBe(48)
    expect(result.diagnostics.sourceSize).toEqual({ width: 4, height: 3 })
  })

  it('rejects a request whose Palette version differs from the selected Palette', () => {
    expect(() =>
      generateGenerationResultFromRgbaImage(
        { ...request, paletteVersion: 'wrong-palette-version' },
        createImage(1, 1),
        { resample: () => createImage(1, 1) },
      ),
    ).toThrow(RangeError)
  })

  it('copies PaletteMappedImage values mechanically into the Grid without color metadata', async () => {
    const target = createTargetImage()
    const result = generateGenerationResultFromRgbaImage(request, createImage(4, 3), {
      resample: () => target,
      palette: MARD_291_PALETTE,
    })

    expect(result.grid.cells).toBeInstanceOf(Uint16Array)
    expect(result.grid.cells[0]).toBe(0)
    expect(result.grid.cells[1]).toBe(278)
    expect('colorId' in result.grid).toBe(false)
  })

  it('fails when a mapped pixel count does not match the declared image dimensions', () => {
    expect(() =>
      createGridFromPaletteMappedImage({
        width: 2,
        height: 1,
        paletteVersion: MARD_291_PALETTE_VERSION,
        pixels: [{ kind: 'empty', paletteIndex: 0, colorId: null }],
      }),
    ).toThrow(RangeError)
  })
})

describe('TASK-035 generation Worker flow', () => {
  it('delegates generate-grid to the domain pipeline and returns GenerationResult', () => {
    const rasterized = createImage(4, 3)
    const pipeline = vi.fn(() => createResult())
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, rasterized, 'generate-grid'),
      vi.fn(() => createTargetImage()),
      pipeline,
    )

    expect(pipeline).toHaveBeenCalledWith(request, rasterized)
    expect(response).toEqual({
      type: 'success',
      requestId: 1,
      result: { accepted: true, generationResult: createResult() },
    })
  })

  it('rejects generate-grid without rasterized RGBA input', () => {
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, undefined, 'generate-grid'),
    )

    expect(response).toEqual({
      type: 'error',
      requestId: 1,
      error: {
        code: 'INVALID_REQUEST',
        message: '生成 Grid 请求缺少 RGBA 输入',
      },
    })
  })

  it('sends generate-grid through the existing request and response protocol', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const rasterized = createImage(4, 3)
    const resultPromise = client.generateGrid(request, rasterized)

    expect(worker.posted).toEqual([
      createGenerationWorkerRequest(1, request, rasterized, 'generate-grid'),
    ])
    worker.emitMessage({
      type: 'success',
      requestId: 1,
      result: { accepted: true, generationResult: createResult() },
    })

    await expect(resultPromise).resolves.toEqual({
      accepted: true,
      generationResult: createResult(),
    })
    client.dispose()
  })
})
