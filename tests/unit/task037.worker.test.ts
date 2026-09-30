import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGenerationRequest,
  createGenerationWorkerClient,
  createGenerationWorkerRequest,
  GenerationRequestSupersededError,
  type GenerationRequest,
  type GenerationResult,
  type GenerationWorkerLike,
  type RgbaImage,
} from '../../src/domain/generation'
import * as highFidelity from '../../src/domain/generation/high-fidelity'
import * as pipeline from '../../src/domain/generation/pipeline'
import { createProject, type GenerationMode } from '../../src/domain/project'
import { handleGenerationWorkerMessage } from '../../src/workers/generation.worker'

function createRequest(mode: GenerationMode = 'optimized'): GenerationRequest {
  return createGenerationRequest(
    createProject({
      source: {
        originalImage: new Blob(['original-image'], { type: 'image/png' }),
        originalFileName: 'task037.png',
        mimeType: 'image/png',
        originalWidth: 2,
        originalHeight: 2,
      },
      crop: { x: 0, y: 0, width: 2, height: 2, rotation: 0, aspectRatio: 1 },
      widthBeads: 8,
      mode,
    }),
  )
}

function createPixels(): RgbaImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255]),
  }
}

function createResult(request: GenerationRequest): GenerationResult {
  return pipeline.generateGenerationResultFromRgbaImage(request, createPixels(), {
    resample: () => ({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) }),
  })
}

class FakeWorker implements GenerationWorkerLike {
  readonly posted: Parameters<GenerationWorkerLike['postMessage']>[0][] = []
  private readonly listeners = {
    message: new Set<(event: unknown) => void>(),
    error: new Set<(event: unknown) => void>(),
  }

  addEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    this.listeners[type].add(listener)
  }

  removeEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void {
    this.listeners[type].delete(listener)
  }

  postMessage(message: Parameters<GenerationWorkerLike['postMessage']>[0]): void {
    this.posted.push(message)
  }

  terminate(): void {}

  emitMessage(data: unknown): void {
    this.listeners.message.forEach((listener) => listener({ data }))
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TASK-037 Worker mode dispatch', () => {
  it('dispatches high-fidelity to the existing TASK-036 wrapper', () => {
    const request = createRequest('high-fidelity')
    const highFidelityPipeline = vi
      .spyOn(highFidelity, 'generateHighFidelityGenerationResultFromRgbaImage')
      .mockReturnValue(createResult(request))
    const pixels = createPixels()

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, pixels, 'generate-grid'),
    )

    expect(highFidelityPipeline).toHaveBeenCalledWith(request, pixels)
    expect(response).toMatchObject({
      type: 'success',
      requestId: 1,
      result: { generationResult: { grid: { width: 8, height: 8 } } },
    })
  })

  it('keeps optimized on the provisional TASK-035 base pipeline', () => {
    const request = createRequest()
    const result = createResult(request)
    const basePipeline = vi
      .spyOn(pipeline, 'generateGenerationResultFromRgbaImage')
      .mockReturnValue(result)
    const highFidelityPipeline = vi.spyOn(
      highFidelity,
      'generateHighFidelityGenerationResultFromRgbaImage',
    )
    const pixels = createPixels()

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, pixels, 'generate-grid'),
    )

    expect(basePipeline).toHaveBeenCalledWith(request, pixels)
    expect(highFidelityPipeline).not.toHaveBeenCalled()
    expect(response.type).toBe('success')
  })

  it('rejects unsupported runtime modes instead of silently generating a base Grid', () => {
    const request = { ...createRequest(), mode: 'unsupported' } as unknown as GenerationRequest

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, createPixels(), 'generate-grid'),
    )

    expect(response).toMatchObject({
      type: 'error',
      requestId: 1,
      error: { code: 'GENERATION_FAILED' },
    })
  })

  it('preserves the existing injectable pipeline seam', () => {
    const request = createRequest('high-fidelity')
    const pixels = createPixels()
    const result = createResult(request)
    const injectedPipeline = vi.fn(() => result)

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(1, request, pixels, 'generate-grid'),
      undefined,
      injectedPipeline,
    )

    expect(injectedPipeline).toHaveBeenCalledWith(request, pixels)
    expect(response).toEqual({
      type: 'success',
      requestId: 1,
      result: { accepted: true, generationResult: result },
    })
  })
})

describe('TASK-037 Worker response validation', () => {
  it('rejects a malformed generation result for the current request without remaining pending', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const pending = client.generateGrid(createRequest(), createPixels())

    worker.emitMessage({
      type: 'success',
      requestId: 1,
      result: { accepted: true, generationResult: { grid: { cells: [] } } },
    })

    await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    client.dispose()
  })

  it('rejects a malformed error associated with the current request', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const pending = client.generateGrid(createRequest(), createPixels())

    worker.emitMessage({ type: 'error', requestId: 1, error: { code: 'FAILED' } })

    await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    client.dispose()
  })

  it('ignores malformed superseded responses without disturbing the latest request', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const first = client.generate(createRequest())
    const latest = client.generate(createRequest())

    await expect(first).rejects.toBeInstanceOf(GenerationRequestSupersededError)
    worker.emitMessage({ type: 'success', requestId: 1, result: { accepted: false } })
    worker.emitMessage({ type: 'success', requestId: 2, result: { accepted: true } })

    await expect(latest).resolves.toEqual({ accepted: true })
    client.dispose()
  })

  it('preserves the legacy accepted-only response for non-Grid protocol requests', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const pending = client.generate(createRequest())

    worker.emitMessage({ type: 'success', requestId: 1, result: { accepted: true } })

    await expect(pending).resolves.toEqual({ accepted: true })
    client.dispose()
  })

  it('allows retry after rejecting an invalid current response', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const request = createRequest()
    const pixels = createPixels()
    const invalid = client.generateGrid(request, pixels)
    worker.emitMessage({ type: 'success', requestId: 1, result: { accepted: false } })
    await expect(invalid).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })

    const retried = client.generateGrid(request, pixels)
    const response = handleGenerationWorkerMessage(worker.posted[1], undefined, createResult)
    worker.emitMessage(response)

    await expect(retried).resolves.toMatchObject({
      accepted: true,
      generationResult: { grid: { width: 8, height: 8 } },
    })
    client.dispose()
  })
})
