import { describe, expect, it } from 'vitest'
import {
  createGenerationWorkerClient,
  createGenerationWorkerRequest,
  GenerationRequestCancelledError,
  GenerationRequestSupersededError,
  GenerationWorkerError,
  parseGenerationWorkerResponse,
  type GenerationWorkerLike,
  type GenerationWorkerResponseMessage,
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

class FakeWorker implements GenerationWorkerLike {
  readonly posted: Parameters<GenerationWorkerLike['postMessage']>[0][] = []
  terminated = false
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

  terminate(): void {
    this.terminated = true
  }

  emitMessage(data: GenerationWorkerResponseMessage): void {
    this.listeners.message.forEach((listener) => listener({ data }))
  }

  emitError(message: string): void {
    this.listeners.error.forEach((listener) => listener({ message }))
  }
}

describe('TASK-032 generation Worker protocol', () => {
  it('creates a versioned request and resolves a successful response', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)

    const resultPromise = client.generate(request)

    expect(worker.posted).toEqual([createGenerationWorkerRequest(1, request)])
    worker.emitMessage({
      type: 'success',
      requestId: 1,
      result: { accepted: true },
    })

    await expect(resultPromise).resolves.toEqual({ accepted: true })
    client.dispose()
  })

  it('parses valid responses and rejects malformed protocol data', () => {
    expect(
      parseGenerationWorkerResponse({
        type: 'success',
        requestId: 3,
        result: { accepted: true },
      }),
    ).toEqual({ type: 'success', requestId: 3, result: { accepted: true } })
    expect(
      parseGenerationWorkerResponse({
        type: 'error',
        requestId: 3,
        error: { code: 'FAILED', message: 'failed' },
      }),
    ).toEqual({
      type: 'error',
      requestId: 3,
      error: { code: 'FAILED', message: 'failed' },
    })
    expect(parseGenerationWorkerResponse({ type: 'success', requestId: 0 })).toBeNull()
  })

  it('rejects a worker error response without changing request state', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const resultPromise = client.generate(request)

    worker.emitMessage({
      type: 'error',
      requestId: 1,
      error: { code: 'DECODE_FAILED', message: '图片处理失败' },
    })

    await expect(resultPromise).rejects.toMatchObject({
      name: 'GenerationWorkerError',
      code: 'DECODE_FAILED',
      message: '图片处理失败',
    })
    client.dispose()
  })

  it('rejects the previous request and ignores its late response', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const firstPromise = client.generate(request)
    const secondPromise = client.generate({ ...request, mode: 'high-fidelity' })

    await expect(firstPromise).rejects.toBeInstanceOf(GenerationRequestSupersededError)
    expect(worker.posted.map((message) => message.requestId)).toEqual([1, 2])

    worker.emitMessage({ type: 'success', requestId: 1, result: { accepted: true } })
    worker.emitMessage({ type: 'success', requestId: 2, result: { accepted: true } })

    await expect(secondPromise).resolves.toEqual({ accepted: true })
    client.dispose()
  })

  it('cancels a pending request and terminates on runtime error', async () => {
    const worker = new FakeWorker()
    const client = createGenerationWorkerClient(() => worker)
    const cancelledPromise = client.generate(request)
    client.cancel()
    await expect(cancelledPromise).rejects.toBeInstanceOf(GenerationRequestCancelledError)

    const failedPromise = client.generate(request)
    worker.emitError('Worker crashed')
    await expect(failedPromise).rejects.toMatchObject({
      code: 'WORKER_RUNTIME_ERROR',
      message: 'Worker crashed',
    })
    expect(worker.terminated).toBe(true)
  })

  it('returns a protocol error for an invalid worker message', () => {
    expect(handleGenerationWorkerMessage({ type: 'generate', requestId: 0 })).toEqual({
      type: 'error',
      requestId: null,
      error: {
        code: 'INVALID_REQUEST',
        message: '生成 Worker 请求格式无效',
      },
    })
  })

  it('accepts a structured-cloneable GenerationRequest without involving a Store', () => {
    const response = handleGenerationWorkerMessage({
      type: 'generate',
      requestId: 7,
      request,
    })

    expect(response).toEqual({
      type: 'success',
      requestId: 7,
      result: { accepted: true },
    })
  })

  it('throws for an invalid request version', () => {
    expect(() => createGenerationWorkerRequest(0, request)).toThrow(RangeError)
    expect(() => createGenerationWorkerRequest(Number.POSITIVE_INFINITY, request)).toThrow(
      RangeError,
    )
  })

  it('exposes the shared worker error type for runtime failures', () => {
    expect(new GenerationWorkerError('TEST', 'test')).toMatchObject({
      name: 'GenerationWorkerError',
      code: 'TEST',
      message: 'test',
    })
  })
})
