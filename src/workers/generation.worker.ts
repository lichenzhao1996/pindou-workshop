import {
  isGenerationWorkerRequestMessage,
  type GenerationWorkerErrorMessage,
  type GenerationWorkerResponseMessage,
  type GenerationWorkerRequestMessage,
} from '../domain/generation/worker-client'
import { resampleGenerationImage } from '../domain/generation/resample'
import type { GenerationRequest } from '../domain/generation/request'
import type { RgbaImage } from '../domain/generation/rasterize'

type GenerationResampler = (
  source: RgbaImage,
  request: Pick<GenerationRequest, 'widthBeads' | 'crop'>,
) => RgbaImage

function getRequestId(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const requestId = (value as { requestId?: unknown }).requestId
  return Number.isSafeInteger(requestId) && (requestId as number) > 0 ? (requestId as number) : null
}

export function handleGenerationWorkerMessage(
  value: unknown,
  resampler: GenerationResampler = resampleGenerationImage,
): GenerationWorkerResponseMessage {
  if (!isGenerationWorkerRequestMessage(value)) {
    const error: GenerationWorkerErrorMessage = {
      type: 'error',
      requestId: getRequestId(value),
      error: {
        code: 'INVALID_REQUEST',
        message: '生成 Worker 请求格式无效',
      },
    }
    return error
  }

  const request = value as GenerationWorkerRequestMessage
  if (request.rgbaImage !== undefined) {
    try {
      return {
        type: 'success',
        requestId: request.requestId,
        result: {
          accepted: true,
          resampledImage: resampler(request.rgbaImage, request.request),
        },
      }
    } catch (error) {
      return {
        type: 'error',
        requestId: request.requestId,
        error: {
          code: 'RESAMPLE_FAILED',
          message: error instanceof Error ? error.message : '图片重采样失败',
        },
      }
    }
  }

  return {
    type: 'success',
    requestId: request.requestId,
    result: { accepted: true },
  }
}

interface GenerationWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  postMessage(message: GenerationWorkerResponseMessage): void
}

const workerScope = globalThis as unknown as GenerationWorkerScope

if (typeof document === 'undefined' && typeof workerScope.addEventListener === 'function') {
  workerScope.addEventListener('message', (event) => {
    workerScope.postMessage(handleGenerationWorkerMessage(event.data))
  })
}
