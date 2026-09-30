import { MARD_291_PALETTE } from '../palette/mard291'
import type { Palette } from '../palette/types'
import { DEFAULT_ALGORITHM_VERSION } from '../project/constants'
import type { Grid } from '../project/grid'
import { mergeFragmentsConservatively } from './fragment-merge'
import { simplifyBackground } from './optimize/background'
import { getProtectedFragmentRegionIds } from './optimize/contours'
import { analyzeGridFragments } from './optimize/fragments'
import {
  generateGenerationResult,
  generateGenerationResultFromRgbaImage,
  type GenerationPipelineOptions,
  type GenerationResult,
} from './pipeline'
import type { RgbaImage } from './rasterize'
import type { GenerationRequest } from './request'

/** The frozen V1 parameters use the existing Project algorithmVersion, not a new schema. */
export const OPTIMIZED_ALGORITHM_VERSION = DEFAULT_ALGORITHM_VERSION

function assertOptimizedRequest(request: GenerationRequest): void {
  if (request.mode !== 'optimized') {
    throw new RangeError('拼豆优化生成请求必须使用 optimized 模式')
  }
  if (request.algorithmVersion !== OPTIMIZED_ALGORITHM_VERSION) {
    throw new RangeError(`Unsupported optimized algorithm version: ${request.algorithmVersion}`)
  }
}

/** One deterministic optimized pass; all stages read snapshots and preserve the input Grid. */
export function optimizeGrid(grid: Grid, palette: Palette = MARD_291_PALETTE): Grid {
  const fragments = analyzeGridFragments(grid, palette)
  const protectedRegionIds = getProtectedFragmentRegionIds(fragments, palette)

  // Filter only the source regions to process; their original direct-neighbor information
  // remains intact. TASK-039's public API, threshold and target ordering are unchanged.
  const mergeableFragments = fragments.filter(
    (fragment) => !protectedRegionIds.has(fragment.regionId),
  )
  const merged = mergeFragmentsConservatively(grid, mergeableFragments, palette)
  const mergedFragments = analyzeGridFragments(merged, palette)

  return simplifyBackground(merged, mergedFragments, palette)
}

function finishOptimizedGeneration(
  base: GenerationResult,
  options: GenerationPipelineOptions,
  startedAt: number,
): GenerationResult {
  const grid = optimizeGrid(base.grid, options.palette ?? MARD_291_PALETTE)
  return {
    ...base,
    grid,
    algorithmVersion: OPTIMIZED_ALGORITHM_VERSION,
    diagnostics: {
      ...base.diagnostics,
      // Timing is diagnostic only; no optimization decision reads the clock.
      elapsedMs: Math.max(0, Date.now() - startedAt),
    },
  }
}

/** Generates from the original confirmed crop, then runs the complete V1 optimized chain. */
export async function generateOptimizedGenerationResult(
  request: GenerationRequest,
  options: GenerationPipelineOptions = {},
): Promise<GenerationResult> {
  assertOptimizedRequest(request)
  const startedAt = Date.now()
  const base = await generateGenerationResult(request, options)
  return finishOptimizedGeneration(base, options, startedAt)
}

/** Worker entry: base → analyze → protect → merge → re-analyze → background simplify. */
export function generateOptimizedGenerationResultFromRgbaImage(
  request: GenerationRequest,
  rasterized: RgbaImage,
  options: GenerationPipelineOptions = {},
): GenerationResult {
  assertOptimizedRequest(request)
  const startedAt = Date.now()
  const base = generateGenerationResultFromRgbaImage(request, rasterized, options)
  return finishOptimizedGeneration(base, options, startedAt)
}
