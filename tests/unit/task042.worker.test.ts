import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGenerationRequest } from '../../src/domain/generation/request'
import {
  createGenerationWorkerRequest,
  parseGenerationWorkerResponse,
  type GenerationWorkerResponseMessage,
} from '../../src/domain/generation/worker-client'
import { createProject, type GenerationMode, type Grid } from '../../src/domain/project'
import type { GenerationRequest } from '../../src/domain/generation/request'
import type { GenerationResult } from '../../src/domain/generation/pipeline'
import type { RgbaImage } from '../../src/domain/generation/rasterize'
import * as basePipeline from '../../src/domain/generation/pipeline'
import * as optimized from '../../src/domain/generation/optimized'
import * as highFidelity from '../../src/domain/generation/high-fidelity'
import * as regions from '../../src/domain/generation/optimize/fragments'
import * as contours from '../../src/domain/generation/optimize/contours'
import * as merge from '../../src/domain/generation/fragment-merge'
import * as background from '../../src/domain/generation/optimize/background'
import * as resample from '../../src/domain/generation/resample'
import {
  createOptimizationContourFixture,
  createOptimizationDetailFixture,
} from '../../src/domain/generation/fixtures/optimized'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { DEFAULT_ALGORITHM_VERSION } from '../../src/domain/project/constants'
import { handleGenerationWorkerMessage } from '../../src/workers/generation.worker'

function createRequest(mode: GenerationMode = 'optimized'): GenerationRequest {
  return createGenerationRequest(
    createProject({
      source: {
        originalImage: new Blob(['original PNG'], { type: 'image/png' }),
        originalFileName: 'task042.png',
        mimeType: 'image/png',
        originalWidth: 8,
        originalHeight: 8,
      },
      crop: { x: 0, y: 0, width: 8, height: 8, rotation: 0, aspectRatio: 1 },
      widthBeads: 8,
      mode,
    }),
  )
}

function pixelsFromGrid(grid: Grid): RgbaImage {
  const data = new Uint8ClampedArray(grid.cells.length * 4)
  grid.cells.forEach((index, cell) => {
    if (index === 0) return
    const entry = MARD_291_PALETTE.entries.find((color) => color.paletteIndex === index)!
    data.set([entry.rgb.r, entry.rgb.g, entry.rgb.b, 255], cell * 4)
  })
  return { width: grid.width, height: grid.height, data }
}

function baseResult(grid: Grid): GenerationResult {
  return {
    grid,
    heightBeads: grid.height,
    paletteVersion: MARD_291_PALETTE_VERSION,
    algorithmVersion: DEFAULT_ALGORITHM_VERSION,
    diagnostics: {
      sourceSize: { width: 8, height: 8 },
      cropSize: { width: 8, height: 8 },
      elapsedMs: 0,
    },
  }
}

function generatedResult(response: GenerationWorkerResponseMessage): GenerationResult {
  expect(response.type).toBe('success')
  if (response.type !== 'success' || !response.result.generationResult) {
    throw new Error('expected a real generated Grid result')
  }
  return response.result.generationResult
}

function observeStages() {
  return {
    optimized: vi.spyOn(optimized, 'generateOptimizedGenerationResultFromRgbaImage'),
    highFidelity: vi.spyOn(highFidelity, 'generateHighFidelityGenerationResultFromRgbaImage'),
    analyze: vi.spyOn(regions, 'analyzeGridFragments'),
    protect: vi.spyOn(contours, 'getProtectedFragmentRegionIds'),
    merge: vi.spyOn(merge, 'mergeFragmentsConservatively'),
    background: vi.spyOn(background, 'simplifyBackground'),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TASK-042 real Worker optimized dispatch', () => {
  it('runs analyze, protect, merge, re-analyze and background with the actual algorithms', () => {
    const grid = createOptimizationDetailFixture()
    const before = grid.cells.slice()
    const base = baseResult(grid)
    const baseSpy = vi
      .spyOn(basePipeline, 'generateGenerationResultFromRgbaImage')
      .mockReturnValue(base)
    const stages = observeStages()
    const request = createRequest()
    const pixels = pixelsFromGrid(grid)

    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(42, request, pixels, 'generate-grid'),
    )
    const result = generatedResult(response)

    expect(stages.optimized).toHaveBeenCalledExactlyOnceWith(request, pixels)
    expect(stages.highFidelity).not.toHaveBeenCalled()
    expect(baseSpy).toHaveBeenCalledOnce()
    expect(stages.analyze).toHaveBeenCalledTimes(2)
    expect(stages.protect).toHaveBeenCalledOnce()
    expect(stages.merge).toHaveBeenCalledOnce()
    expect(stages.background).toHaveBeenCalledOnce()
    const order = [
      baseSpy.mock.invocationCallOrder[0],
      stages.analyze.mock.invocationCallOrder[0],
      stages.protect.mock.invocationCallOrder[0],
      stages.merge.mock.invocationCallOrder[0],
      stages.analyze.mock.invocationCallOrder[1],
      stages.background.mock.invocationCallOrder[0],
    ]
    expect(order).toEqual([...order].sort((left, right) => left - right))
    const merged = stages.merge.mock.results[0]!.value
    const freshAnalysis = stages.analyze.mock.results[1]!.value
    expect(stages.analyze).toHaveBeenNthCalledWith(2, merged, MARD_291_PALETTE)
    expect(stages.background).toHaveBeenCalledWith(merged, freshAnalysis, MARD_291_PALETTE)
    expect(grid.cells[27]).toBe(2)
    expect(result.grid.cells[27]).toBe(1)
    expect(grid.cells).toEqual(before)
    expect(result.grid.cells).not.toBe(grid.cells)
    expect(result.grid).toMatchObject({ width: 8, height: 8 })
    expect(result.heightBeads).toBe(8)
    expect(result.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
    expect(result.algorithmVersion).toBe(DEFAULT_ALGORITHM_VERSION)
    expect(response.requestId).toBe(42)
    expect(parseGenerationWorkerResponse(response)).toEqual(response)
  })

  it('does not merge a contour-protected interior fragment even when its neighbor color is close', () => {
    const grid = createOptimizationContourFixture()
    const before = grid.cells.slice()
    vi.spyOn(basePipeline, 'generateGenerationResultFromRgbaImage').mockReturnValue(
      baseResult(grid),
    )
    const stages = observeStages()
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(43, createRequest(), pixelsFromGrid(grid), 'generate-grid'),
    )
    const result = generatedResult(response)

    const firstAnalysis = stages.analyze.mock.results[0]!.value
    const fragment = firstAnalysis.find((region) => region.paletteIndex === 2)!
    const protectedIds = stages.protect.mock.results[0]!.value
    expect(protectedIds.has(fragment.regionId)).toBe(true)
    expect(stages.merge.mock.calls[0]![1]).not.toContain(fragment)
    expect(result.grid.cells[27]).toBe(2)
    expect(result.grid.cells[28]).toBe(0)
    expect(result.grid.cells[0]).toBe(0)
    expect(result.grid.cells).toEqual(before)
    expect(grid.cells).toEqual(before)
  })

  it('keeps high-fidelity on base MARD Grid and bypasses every optimized stage', () => {
    const grid = createOptimizationDetailFixture()
    const base = baseResult(grid)
    const baseSpy = vi
      .spyOn(basePipeline, 'generateGenerationResultFromRgbaImage')
      .mockReturnValue(base)
    const stages = observeStages()
    const request = createRequest('high-fidelity')
    const pixels = pixelsFromGrid(grid)
    const result = generatedResult(
      handleGenerationWorkerMessage(
        createGenerationWorkerRequest(44, request, pixels, 'generate-grid'),
      ),
    )

    expect(stages.highFidelity).toHaveBeenCalledExactlyOnceWith(request, pixels)
    expect(baseSpy).toHaveBeenCalledOnce()
    expect(stages.optimized).not.toHaveBeenCalled()
    expect(stages.analyze).not.toHaveBeenCalled()
    expect(stages.protect).not.toHaveBeenCalled()
    expect(stages.merge).not.toHaveBeenCalled()
    expect(stages.background).not.toHaveBeenCalled()
    expect(result).toBe(base)
    expect(result.grid.cells[27]).toBe(2)
  })

  it('maps real MARD RGBA pixels and produces a deterministic optimized versus high-fidelity difference', () => {
    const grid = createOptimizationDetailFixture()
    const pixels = pixelsFromGrid(grid)
    const before = pixels.data.slice()
    // This fixture already has the exact target dimensions. Only the Canvas boundary
    // is replaced with an identity resample; mapping and all optimization stages are real.
    vi.spyOn(resample, 'resampleGenerationImage').mockImplementation((image, request) => {
      expect(image.width).toBe(request.widthBeads)
      expect(image.height).toBe(8)
      return { ...image, data: image.data.slice() }
    })
    const optimizedRequest = createRequest()
    const optimizedResult = generatedResult(
      handleGenerationWorkerMessage(
        createGenerationWorkerRequest(45, optimizedRequest, pixels, 'generate-grid'),
      ),
    )
    const highFidelityResult = generatedResult(
      handleGenerationWorkerMessage(
        createGenerationWorkerRequest(46, createRequest('high-fidelity'), pixels, 'generate-grid'),
      ),
    )
    const repeated = generatedResult(
      handleGenerationWorkerMessage(
        createGenerationWorkerRequest(47, optimizedRequest, pixels, 'generate-grid'),
      ),
    )

    expect(highFidelityResult.grid.cells).toEqual(grid.cells)
    expect(highFidelityResult.grid.cells[27]).toBe(2)
    expect(optimizedResult.grid.cells[27]).toBe(1)
    expect(optimizedResult.grid.cells).not.toEqual(highFidelityResult.grid.cells)
    expect(repeated.grid.cells).toEqual(optimizedResult.grid.cells)
    expect(pixels.data).toEqual(before)
    for (const result of [optimizedResult, highFidelityResult, repeated]) {
      expect(result.grid.cells).toBeInstanceOf(Uint16Array)
      expect(result.grid.cells).toHaveLength(64)
      expect(result.grid.cells.every((index) => index >= 0 && index <= 291)).toBe(true)
      expect(result.grid).toMatchObject({ width: 8, height: 8 })
      expect(result.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
      expect(result.algorithmVersion).toBe(DEFAULT_ALGORITHM_VERSION)
      expect(result.diagnostics.sourceSize).toEqual({ width: 8, height: 8 })
      expect(result.diagnostics.cropSize).toEqual({ width: 8, height: 8 })
      expect(Number.isFinite(result.diagnostics.elapsedMs)).toBe(true)
      expect(result.diagnostics.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(Object.keys(result.diagnostics).sort()).toEqual([
        'cropSize',
        'elapsedMs',
        'sourceSize',
      ])
    }
  })

  it('reports an unknown optimized algorithm version through the existing error protocol', () => {
    const request = { ...createRequest(), algorithmVersion: 'unknown-version' }
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(
        48,
        request,
        pixelsFromGrid(createOptimizationDetailFixture()),
        'generate-grid',
      ),
    )

    expect(response).toMatchObject({
      type: 'error',
      requestId: 48,
      error: { code: 'GENERATION_FAILED' },
    })
    expect(parseGenerationWorkerResponse(response)).toEqual(response)
  })

  it('reports a palette mismatch without manufacturing a successful Grid', () => {
    const request = { ...createRequest(), paletteVersion: 'wrong-palette' }
    const pixels = pixelsFromGrid(createOptimizationDetailFixture())
    const before = pixels.data.slice()
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(49, request, pixels, 'generate-grid'),
    )

    expect(response).toMatchObject({
      type: 'error',
      requestId: 49,
      error: { code: 'GENERATION_FAILED' },
    })
    expect(response).not.toHaveProperty('result')
    expect(pixels.data).toEqual(before)
  })

  it('reports a real optimization validation failure without mutating the supplied base Grid', () => {
    const grid = createOptimizationDetailFixture()
    grid.cells[27] = 292
    const before = grid.cells.slice()
    vi.spyOn(basePipeline, 'generateGenerationResultFromRgbaImage').mockReturnValue(
      baseResult(grid),
    )
    const response = handleGenerationWorkerMessage(
      createGenerationWorkerRequest(
        50,
        createRequest(),
        pixelsFromGrid(createOptimizationDetailFixture()),
        'generate-grid',
      ),
    )

    expect(response).toMatchObject({
      type: 'error',
      requestId: 50,
      error: { code: 'GENERATION_FAILED' },
    })
    expect(response).not.toHaveProperty('result')
    expect(grid.cells).toEqual(before)
  })
})
