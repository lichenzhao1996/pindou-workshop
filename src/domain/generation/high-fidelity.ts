import {
  generateGenerationResult,
  generateGenerationResultFromRgbaImage,
  type GenerationPipelineOptions,
  type GenerationResult,
} from './pipeline'
import type { GenerationRequest } from './request'
import type { RgbaImage } from './rasterize'

function assertHighFidelityRequest(request: GenerationRequest): void {
  if (request.mode !== 'high-fidelity') {
    throw new RangeError('高清还原生成请求必须使用 high-fidelity 模式')
  }
}

/** Runs the V1 high-fidelity baseline without a second image or Grid pipeline. */
export function generateHighFidelityGenerationResult(
  request: GenerationRequest,
  options: GenerationPipelineOptions = {},
): Promise<GenerationResult> {
  assertHighFidelityRequest(request)
  return generateGenerationResult(request, options)
}

/** Runs the high-fidelity baseline from pixels already rasterized for the Worker. */
export function generateHighFidelityGenerationResultFromRgbaImage(
  request: GenerationRequest,
  rasterized: RgbaImage,
  options: GenerationPipelineOptions = {},
): GenerationResult {
  assertHighFidelityRequest(request)
  return generateGenerationResultFromRgbaImage(request, rasterized, options)
}
