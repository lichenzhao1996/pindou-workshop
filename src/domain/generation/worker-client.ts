import type { GenerationRequest } from './request'
import type { RgbaImage } from './rasterize'

export interface GenerationWorkerRequestMessage {
  readonly type: 'generate'
  readonly requestId: number
  readonly request: GenerationRequest
  readonly rgbaImage?: RgbaImage
}

export interface GenerationWorkerAcceptedResult {
  readonly accepted: true
  readonly resampledImage?: RgbaImage
}

export interface GenerationWorkerSuccessMessage {
  readonly type: 'success'
  readonly requestId: number
  readonly result: GenerationWorkerAcceptedResult
}

export interface GenerationWorkerErrorPayload {
  readonly code: string
  readonly message: string
}

export interface GenerationWorkerErrorMessage {
  readonly type: 'error'
  readonly requestId: number | null
  readonly error: GenerationWorkerErrorPayload
}

export type GenerationWorkerResponseMessage =
  GenerationWorkerSuccessMessage | GenerationWorkerErrorMessage

export interface GenerationWorkerLike {
  addEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void
  removeEventListener(type: 'message' | 'error', listener: (event: unknown) => void): void
  postMessage(message: GenerationWorkerRequestMessage): void
  terminate(): void
}

export type GenerationWorkerFactory = () => GenerationWorkerLike

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

export function createGenerationWorkerRequest(
  requestId: number,
  request: GenerationRequest,
  rgbaImage?: RgbaImage,
): GenerationWorkerRequestMessage {
  if (!isPositiveRequestId(requestId)) {
    throw new RangeError('generation worker requestId must be a positive safe integer')
  }

  return rgbaImage === undefined
    ? {
        type: 'generate',
        requestId,
        request,
      }
    : {
        type: 'generate',
        requestId,
        request,
        rgbaImage,
      }
}

function isRgbaImage(value: unknown): value is RgbaImage {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.width) &&
    (value.width as number) > 0 &&
    Number.isSafeInteger(value.height) &&
    (value.height as number) > 0 &&
    value.data instanceof Uint8ClampedArray &&
    value.data.length === (value.width as number) * (value.height as number) * 4
  )
}

export function isGenerationWorkerRequestMessage(
  value: unknown,
): value is GenerationWorkerRequestMessage {
  return (
    isRecord(value) &&
    value.type === 'generate' &&
    isPositiveRequestId(value.requestId) &&
    isRecord(value.request) &&
    (value.rgbaImage === undefined || isRgbaImage(value.rgbaImage))
  )
}

function parseErrorPayload(value: unknown): GenerationWorkerErrorPayload | null {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') {
    return null
  }

  return {
    code: value.code,
    message: value.message,
  }
}

export function parseGenerationWorkerResponse(
  value: unknown,
): GenerationWorkerResponseMessage | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.type === 'success' && isPositiveRequestId(value.requestId)) {
    if (!isRecord(value.result) || value.result.accepted !== true) {
      return null
    }

    if (value.result.resampledImage !== undefined) {
      if (!isRgbaImage(value.result.resampledImage)) {
        return null
      }

      return {
        type: 'success',
        requestId: value.requestId,
        result: { accepted: true, resampledImage: value.result.resampledImage },
      }
    }

    return {
      type: 'success',
      requestId: value.requestId,
      result: { accepted: true },
    }
  }

  if (value.type === 'error') {
    const requestId = value.requestId === null ? null : value.requestId
    if (requestId !== null && !isPositiveRequestId(requestId)) {
      return null
    }

    const error = parseErrorPayload(value.error)
    if (!error) {
      return null
    }

    return {
      type: 'error',
      requestId,
      error,
    }
  }

  return null
}

export class GenerationWorkerError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'GenerationWorkerError'
    this.code = code
  }
}

export class GenerationRequestSupersededError extends GenerationWorkerError {
  constructor() {
    super('REQUEST_SUPERSEDED', '生成请求已被更新的请求替代')
    this.name = 'GenerationRequestSupersededError'
  }
}

export class GenerationRequestCancelledError extends GenerationWorkerError {
  constructor() {
    super('REQUEST_CANCELLED', '生成请求已取消')
    this.name = 'GenerationRequestCancelledError'
  }
}

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value
  }

  return new Error(fallbackMessage)
}

function createDefaultGenerationWorker(): GenerationWorkerLike {
  if (typeof Worker === 'undefined') {
    throw new GenerationWorkerError('WORKER_UNAVAILABLE', '当前环境不支持 Web Worker')
  }

  return new Worker(new URL('../../workers/generation.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as GenerationWorkerLike
}

interface PendingRequest {
  readonly requestId: number
  readonly resolve: (result: GenerationWorkerAcceptedResult) => void
  readonly reject: (error: Error) => void
}

export class GenerationWorkerClient {
  private readonly workerFactory: GenerationWorkerFactory
  private worker: GenerationWorkerLike | null = null
  private pending: PendingRequest | null = null
  private nextRequestId = 0

  private readonly handleMessage = (event: unknown): void => {
    const messageEvent = event as { data?: unknown }
    const response = parseGenerationWorkerResponse(messageEvent.data)
    if (!response || !this.pending || response.requestId !== this.pending.requestId) {
      return
    }

    const pending = this.pending
    this.pending = null

    if (response.type === 'success') {
      pending.resolve(response.result)
      return
    }

    pending.reject(new GenerationWorkerError(response.error.code, response.error.message))
  }

  private readonly handleError = (event: unknown): void => {
    const errorEvent = event as { message?: unknown }
    const message = typeof errorEvent.message === 'string' ? errorEvent.message : 'Worker 执行失败'
    const pending = this.pending
    this.pending = null
    this.disposeWorker()
    pending?.reject(new GenerationWorkerError('WORKER_RUNTIME_ERROR', message))
  }

  constructor(workerFactory: GenerationWorkerFactory = createDefaultGenerationWorker) {
    this.workerFactory = workerFactory
  }

  generate(
    request: GenerationRequest,
    rgbaImage?: RgbaImage,
  ): Promise<GenerationWorkerAcceptedResult> {
    let worker: GenerationWorkerLike
    try {
      worker = this.ensureWorker()
    } catch (error) {
      return Promise.reject(
        new GenerationWorkerError(
          'WORKER_UNAVAILABLE',
          toError(error, '当前环境不支持 Web Worker').message,
        ),
      )
    }

    this.pending?.reject(new GenerationRequestSupersededError())
    this.pending = null

    const requestId = ++this.nextRequestId
    const message = createGenerationWorkerRequest(requestId, request, rgbaImage)

    return new Promise<GenerationWorkerAcceptedResult>((resolve, reject) => {
      this.pending = { requestId, resolve, reject }
      try {
        worker.postMessage(message)
      } catch (error) {
        if (this.pending?.requestId === requestId) {
          this.pending = null
        }
        reject(
          new GenerationWorkerError(
            'POST_MESSAGE_FAILED',
            toError(error, 'Worker 请求发送失败').message,
          ),
        )
      }
    })
  }

  cancel(): void {
    const pending = this.pending
    this.pending = null
    pending?.reject(new GenerationRequestCancelledError())
  }

  dispose(): void {
    const pending = this.pending
    this.pending = null
    pending?.reject(new GenerationWorkerError('CLIENT_DISPOSED', '生成 Worker 客户端已释放'))
    this.disposeWorker()
  }

  private ensureWorker(): GenerationWorkerLike {
    if (this.worker) {
      return this.worker
    }

    const worker = this.workerFactory()
    worker.addEventListener('message', this.handleMessage)
    worker.addEventListener('error', this.handleError)
    this.worker = worker
    return worker
  }

  private disposeWorker(): void {
    if (!this.worker) {
      return
    }

    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.removeEventListener('error', this.handleError)
    this.worker.terminate()
    this.worker = null
  }
}

export function createGenerationWorkerClient(
  workerFactory?: GenerationWorkerFactory,
): GenerationWorkerClient {
  return new GenerationWorkerClient(workerFactory)
}
