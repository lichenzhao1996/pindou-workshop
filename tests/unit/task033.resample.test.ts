import { describe, expect, it, vi } from 'vitest'
import {
  createGenerationWorkerClient,
  createGenerationWorkerRequest,
  type GenerationWorkerLike,
  type GenerationWorkerResponseMessage,
  resampleGenerationImage,
  resampleRgbaImage,
  type ResampleCanvas,
  type ResampleCanvasContext,
  type ResampleCanvasFactory,
  type RgbaImage,
} from '../../src/domain/generation'
import { handleGenerationWorkerMessage } from '../../src/workers/generation.worker'
import type { GenerationRequest } from '../../src/domain/generation'

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
  paletteVersion: 'palette-v1',
  algorithmVersion: 'algorithm-v1',
}

function createImage(width: number, height: number, values: number[] = []): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  data.set(values)
  return { width, height, data }
}

interface CanvasHarness {
  factory: ResampleCanvasFactory
  canvases: Array<{
    canvas: ResampleCanvas
    context: ResampleCanvasContext
    drawCalls: Parameters<ResampleCanvasContext['drawImage']>[]
  }>
}

function createCanvasHarness(output: Uint8ClampedArray): CanvasHarness {
  const canvases: CanvasHarness['canvases'] = []
  const factory: ResampleCanvasFactory = (width, height) => {
    const drawCalls: Parameters<ResampleCanvasContext['drawImage']>[] = []
    const context: ResampleCanvasContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      createImageData(imageWidth, imageHeight) {
        return { data: new Uint8ClampedArray(imageWidth * imageHeight * 4) }
      },
      putImageData() {},
      drawImage(...args) {
        drawCalls.push(args)
      },
      getImageData() {
        return { data: new Uint8ClampedArray(output) }
      },
    }
    const canvas: ResampleCanvas = {
      width,
      height,
      getContext() {
        return context
      },
    }
    canvases.push({ canvas, context, drawCalls })
    return canvas
  }

  return { factory, canvases }
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

describe('TASK-033 RGBA resampling', () => {
  it('uses Canvas 2D drawImage with exact target dimensions and preserves RGBA data', () => {
    const source = createImage(2, 2, [255, 255, 255, 255, 0, 0, 0, 0])
    const sourceData = Array.from(source.data)
    const output = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0])
    const harness = createCanvasHarness(output)

    const result = resampleRgbaImage(source, 1, 2, harness.factory)

    expect(result).toEqual({ width: 1, height: 2, data: output })
    expect(result.data).not.toBe(output)
    expect(result.data.length).toBe(1 * 2 * 4)
    expect(Array.from(source.data)).toEqual(sourceData)
    expect(harness.canvases).toHaveLength(2)
    expect(harness.canvases[1].context.imageSmoothingEnabled).toBe(true)
    expect(harness.canvases[1].context.imageSmoothingQuality).toBe('high')
    expect(harness.canvases[1].drawCalls).toEqual([
      [harness.canvases[0].canvas, 0, 0, 2, 2, 0, 0, 1, 2],
    ])
  })

  it('derives the target height from the existing generation dimensions', () => {
    const source = createImage(4, 3)
    const harness = createCanvasHarness(new Uint8ClampedArray(64 * 48 * 4))

    const result = resampleGenerationImage(source, request, harness.factory)

    expect(result.width).toBe(64)
    expect(result.height).toBe(48)
    expect(harness.canvases[1].drawCalls[0]).toEqual([
      harness.canvases[0].canvas,
      0,
      0,
      4,
      3,
      0,
      0,
      64,
      48,
    ])
  })

  it.each([
    [8, 6],
    [256, 192],
  ])('supports the configured boundary width %i with derived height %i', (width, height) => {
    const harness = createCanvasHarness(new Uint8ClampedArray(width * height * 4))

    const result = resampleGenerationImage(
      createImage(4, 3),
      { ...request, widthBeads: width },
      harness.factory,
    )

    expect(result.width).toBe(width)
    expect(result.height).toBe(height)
    expect(result.data.length).toBe(width * height * 4)
  })

  it('supports a one-cell target and does not apply rotation a second time', () => {
    const harness = createCanvasHarness(new Uint8ClampedArray(4))

    const oneCell = resampleRgbaImage(createImage(3, 2), 1, 1, harness.factory)
    const rotated = resampleGenerationImage(
      createImage(4, 3),
      {
        ...request,
        crop: { ...request.crop, rotation: 90 },
      },
      createCanvasHarness(new Uint8ClampedArray(64 * 85 * 4)).factory,
    )

    expect(oneCell.width).toBe(1)
    expect(oneCell.height).toBe(1)
    expect(rotated.width).toBe(64)
    expect(rotated.height).toBe(85)
  })

  it('does not create a second alpha or palette interpretation', () => {
    const source = createImage(1, 2, [255, 255, 255, 255, 0, 0, 0, 0])
    const output = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0])
    const result = resampleRgbaImage(source, 1, 2, createCanvasHarness(output).factory)

    expect(Array.from(result.data)).toEqual(Array.from(output))
    expect(Array.from(result.data.slice(0, 4))).toEqual([255, 255, 255, 255])
    expect(Array.from(result.data.slice(4, 8))).toEqual([0, 0, 0, 0])
  })

  it('rejects malformed RGBA input and invalid target dimensions', () => {
    const factory = createCanvasHarness(new Uint8ClampedArray(4)).factory

    expect(() =>
      resampleRgbaImage({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, 1, 1, factory),
    ).toThrow(RangeError)
    expect(() => resampleRgbaImage(createImage(1, 1), 0, 1, factory)).toThrow(RangeError)
    expect(() => resampleRgbaImage(createImage(1, 1), 1.5, 1, factory)).toThrow(RangeError)
  })
})

describe('TASK-033 Worker resampling flow', () => {
  it('passes RgbaImage to the domain resampler and returns its result', () => {
    const source = createImage(4, 3)
    const output = createImage(64, 48)
    const resampler = vi.fn(() => output)

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, source),
      resampler,
    )

    expect(resampler).toHaveBeenCalledWith(source, request)
    expect(response).toEqual({
      type: 'success',
      requestId: 1,
      result: { accepted: true, resampledImage: output },
    })
  })

  it('sends the source RgbaImage through the existing Worker client protocol', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const source = createImage(4, 3)
    const output = createImage(64, 48)
    const resultPromise = client.generate(request, source)

    expect(worker.posted).toEqual([createGenerationWorkerRequest(1, request, source)])
    worker.emitMessage({
      type: 'success',
      requestId: 1,
      result: { accepted: true, resampledImage: output },
    })

    await expect(resultPromise).resolves.toEqual({ accepted: true, resampledImage: output })
    client.dispose()
  })
})
