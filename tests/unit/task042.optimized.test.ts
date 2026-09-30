import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateOptimizedGenerationResult,
  generateOptimizedGenerationResultFromRgbaImage,
  optimizeGrid,
  OPTIMIZED_ALGORITHM_VERSION,
} from '../../src/domain/generation/optimized'
import { generateHighFidelityGenerationResultFromRgbaImage } from '../../src/domain/generation/high-fidelity'
import {
  createOptimizationContourFixture,
  createOptimizationDetailFixture,
} from '../../src/domain/generation/fixtures/optimized'
import * as fragments from '../../src/domain/generation/optimize/fragments'
import * as contours from '../../src/domain/generation/optimize/contours'
import * as merge from '../../src/domain/generation/fragment-merge'
import * as background from '../../src/domain/generation/optimize/background'
import * as pipeline from '../../src/domain/generation/pipeline'
import type { GenerationRequest } from '../../src/domain/generation/request'
import type { RgbaImage } from '../../src/domain/generation/rasterize'
import { getPaletteEntryByIndex } from '../../src/domain/palette/accessors'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import type { Palette, PaletteEntry } from '../../src/domain/palette/types'
import { createGrid, EMPTY, isValidGridCellValue } from '../../src/domain/project'

function createRequest(): GenerationRequest {
  return {
    originalImage: new Blob(['original'], { type: 'image/png' }),
    crop: { x: 0, y: 0, width: 8, height: 8, rotation: 0, aspectRatio: 1 },
    widthBeads: 8,
    mode: 'optimized',
    paletteVersion: MARD_291_PALETTE.paletteVersion,
    algorithmVersion: OPTIMIZED_ALGORITHM_VERSION,
  }
}

function createDetailPixels(): RgbaImage {
  const grid = createOptimizationDetailFixture()
  const data = new Uint8ClampedArray(grid.cells.length * 4)
  grid.cells.forEach((value, index) => {
    const entry = getPaletteEntryByIndex(MARD_291_PALETTE, value)!
    data.set([entry.rgb.r, entry.rgb.g, entry.rgb.b, 255], index * 4)
  })
  return { width: grid.width, height: grid.height, data }
}

function createTopologyPalette(): Palette {
  const entries: PaletteEntry[] = [50, 55, 57].map((l, index) => ({
    paletteIndex: index + 1,
    colorId: `fixture:${index + 1}`,
    displayCode: `F${index + 1}`,
    name: `Fixture ${index + 1}`,
    rgb: { r: 0, g: 0, b: 0 },
    hex: '#000000',
    lab: { l, a: 0, b: 0 },
    family: 'fixture',
  }))
  return {
    source: 'MARD',
    paletteVersion: 'task042-topology',
    entries,
    byColorId: new Map(entries.map((entry) => [entry.colorId, entry])),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TASK-042 frozen optimized orchestration', () => {
  it('locks analyze → protect → merge → re-analyze → background in the real pass', () => {
    const calls: string[] = []
    const analyze = fragments.analyzeGridFragments
    const protect = contours.getProtectedFragmentRegionIds
    const mergeFragments = merge.mergeFragmentsConservatively
    const simplify = background.simplifyBackground
    const analysisSpy = vi
      .spyOn(fragments, 'analyzeGridFragments')
      .mockImplementation((...args) => {
        calls.push(calls.length === 0 ? 'analyze' : 're-analyze')
        return analyze(...args)
      })
    vi.spyOn(contours, 'getProtectedFragmentRegionIds').mockImplementation((...args) => {
      calls.push('protect')
      return protect(...args)
    })
    const mergeSpy = vi
      .spyOn(merge, 'mergeFragmentsConservatively')
      .mockImplementation((...args) => {
        calls.push('merge')
        return mergeFragments(...args)
      })
    const backgroundSpy = vi
      .spyOn(background, 'simplifyBackground')
      .mockImplementation((...args) => {
        calls.push('background')
        return simplify(...args)
      })
    const grid = createOptimizationDetailFixture()

    const result = optimizeGrid(grid)

    expect(calls).toEqual(['analyze', 'protect', 'merge', 're-analyze', 'background'])
    const mergedGrid = mergeSpy.mock.results[0].value
    const postMergeAnalysis = analysisSpy.mock.results[1].value
    expect(analysisSpy.mock.calls[1][0]).toBe(mergedGrid)
    expect(backgroundSpy).toHaveBeenCalledWith(mergedGrid, postMergeAnalysis, MARD_291_PALETTE)
    expect(postMergeAnalysis).toHaveLength(1)
    expect(postMergeAnalysis[0].size).toBe(64)
    expect(result.cells[27]).toBe(1)
  })

  it('excludes a protected size-one region before TASK-039 can merge it', () => {
    const grid = createOptimizationContourFixture()
    const analysis = fragments.analyzeGridFragments(grid)
    const detail = analysis.find((region) => region.cellIndices.includes(27))!
    // This close-color point is otherwise eligible under the unchanged TASK-039 contract.
    expect(merge.mergeFragmentsConservatively(grid, analysis).cells[27]).toBe(1)
    const mergeSpy = vi.spyOn(merge, 'mergeFragmentsConservatively')

    const result = optimizeGrid(grid)

    expect(contours.getProtectedFragmentRegionIds(analysis).has(detail.regionId)).toBe(true)
    expect(mergeSpy.mock.calls[0][1].some((region) => region.regionId === detail.regionId)).toBe(
      false,
    )
    expect(result.cells[27]).toBe(2)
    expect(result.cells[28]).toBe(EMPTY)
  })

  it('uses new topology: a size-six region grown to seven by merge is not background-simplified', () => {
    const palette = createTopologyPalette()
    const grid = createGrid(8, 8)
    grid.cells.fill(1)
    const detailCells = [18, 19, 20, 26, 28, 36]
    detailCells.forEach((index) => {
      grid.cells[index] = 2
    })
    grid.cells[27] = 3
    const oldAnalysis = fragments.analyzeGridFragments(grid, palette)
    expect(oldAnalysis.find((region) => region.paletteIndex === 2)?.size).toBe(6)

    const result = optimizeGrid(grid, palette)

    expect(result.cells[27]).toBe(2)
    expect(detailCells.every((index) => result.cells[index] === 2)).toBe(true)
    expect(
      fragments.analyzeGridFragments(result, palette).find((region) => region.paletteIndex === 2)
        ?.size,
    ).toBe(7)
  })

  it('keeps high-fidelity entirely outside every optimization stage', () => {
    const analysisSpy = vi.spyOn(fragments, 'analyzeGridFragments')
    const protectionSpy = vi.spyOn(contours, 'getProtectedFragmentRegionIds')
    const mergeSpy = vi.spyOn(merge, 'mergeFragmentsConservatively')
    const backgroundSpy = vi.spyOn(background, 'simplifyBackground')
    const pixels = createDetailPixels()

    const result = generateHighFidelityGenerationResultFromRgbaImage(
      { ...createRequest(), mode: 'high-fidelity' },
      pixels,
      { resample: () => pixels },
    )

    expect(result.grid.cells[27]).toBe(2)
    for (const spy of [analysisSpy, protectionSpy, mergeSpy, backgroundSpy]) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('produces a deterministic mode difference on a fixed production MARD pixel fixture', () => {
    const request = createRequest()
    const pixels = createDetailPixels()
    const options = { resample: () => pixels }

    const optimized = generateOptimizedGenerationResultFromRgbaImage(request, pixels, options)
    const highFidelity = generateHighFidelityGenerationResultFromRgbaImage(
      { ...request, mode: 'high-fidelity' },
      pixels,
      options,
    )

    expect(optimized.grid.cells[27]).toBe(1)
    expect(highFidelity.grid.cells[27]).toBe(2)
    expect(Array.from(optimized.grid.cells)).not.toEqual(Array.from(highFidelity.grid.cells))
    expect(optimized.grid.cells.every((index) => index === 1)).toBe(true)
  })

  it('can retain identical values on an already uniform base Grid, without mutating it', () => {
    const grid = createOptimizationDetailFixture()
    grid.cells.fill(1)

    const result = optimizeGrid(grid)

    expect(result.cells).toEqual(grid.cells)
    expect(result).not.toBe(grid)
    expect(result.cells).not.toBe(grid.cells)
  })

  it('preserves all EMPTY positions and never turns ordinary Palette colors into EMPTY', () => {
    const grid = createOptimizationContourFixture()
    const result = optimizeGrid(grid)

    grid.cells.forEach((value, index) => {
      expect(result.cells[index] === EMPTY).toBe(value === EMPTY)
    })
  })

  it('keeps dimensions, Uint16Array encoding and every index legal', () => {
    const grid = createOptimizationDetailFixture()
    const result = optimizeGrid(grid)

    expect(result.width).toBe(grid.width)
    expect(result.height).toBe(grid.height)
    expect(result.cells).toBeInstanceOf(Uint16Array)
    expect(result.cells.length).toBe(grid.width * grid.height)
    expect(result.cells.every(isValidGridCellValue)).toBe(true)
  })

  it('does not mutate source Grid or source pixels', () => {
    const grid = createOptimizationDetailFixture()
    const cells = grid.cells.slice()
    optimizeGrid(grid)
    expect(grid.cells).toEqual(cells)
    const pixels = createDetailPixels()
    const before = pixels.data.slice()
    generateOptimizedGenerationResultFromRgbaImage(createRequest(), pixels, {
      resample: () => pixels,
    })
    expect(pixels.data).toEqual(before)
  })

  it('is deterministic across repeated execution and Palette entry ordering', () => {
    const grid = createOptimizationDetailFixture()
    const reversedPalette = {
      ...MARD_291_PALETTE,
      entries: [...MARD_291_PALETTE.entries].reverse(),
    }

    expect(optimizeGrid(grid).cells).toEqual(optimizeGrid(grid).cells)
    expect(optimizeGrid(grid, reversedPalette).cells).toEqual(optimizeGrid(grid).cells)
  })

  it('records the existing v1 algorithm, Palette identity and complete diagnostics', () => {
    const pixels = createDetailPixels()
    const result = generateOptimizedGenerationResultFromRgbaImage(createRequest(), pixels, {
      resample: () => pixels,
    })

    expect(result.algorithmVersion).toBe('v1')
    expect(result.paletteVersion).toBe(MARD_291_PALETTE.paletteVersion)
    expect(result.heightBeads).toBe(result.grid.height)
    expect(result.diagnostics.sourceSize).toEqual({ width: 8, height: 8 })
    expect(result.diagnostics.cropSize).toEqual({ width: 8, height: 8 })
    expect(Number.isFinite(result.diagnostics.elapsedMs)).toBe(true)
    expect(result.diagnostics.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('starts the async path from the request original image and confirmed crop', async () => {
    const request = createRequest()
    const pixels = createDetailPixels()
    const decode = vi.fn(async () => pixels)
    const resample = vi.fn(() => pixels)

    const result = await generateOptimizedGenerationResult(request, { decode, resample })

    expect(decode).toHaveBeenCalledWith(request.originalImage)
    expect(resample).toHaveBeenCalledWith(expect.objectContaining({ width: 8, height: 8 }), request)
    expect(result.grid.cells[27]).toBe(1)
  })

  it('rejects high-fidelity requests rather than accidentally optimizing them', async () => {
    const request = { ...createRequest(), mode: 'high-fidelity' as const }
    const decode = vi.fn()
    await expect(generateOptimizedGenerationResult(request, { decode })).rejects.toThrow(RangeError)
    expect(decode).not.toHaveBeenCalled()
    expect(() =>
      generateOptimizedGenerationResultFromRgbaImage(request, createDetailPixels()),
    ).toThrow(RangeError)
  })

  it('rejects unsupported algorithm labels before running the base or optimization chain', () => {
    const baseSpy = vi.spyOn(pipeline, 'generateGenerationResultFromRgbaImage')
    expect(() =>
      generateOptimizedGenerationResultFromRgbaImage(
        { ...createRequest(), algorithmVersion: 'future-version' },
        createDetailPixels(),
      ),
    ).toThrow(/Unsupported optimized algorithm version/)
    expect(baseSpy).not.toHaveBeenCalled()
  })

  it('keeps Grid decisions independent of time and does not invoke random', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
    const random = vi.spyOn(Math, 'random')
    const pixels = createDetailPixels()
    const first = generateOptimizedGenerationResultFromRgbaImage(createRequest(), pixels, {
      resample: () => pixels,
    })
    clock.mockReturnValue(999999)
    const second = generateOptimizedGenerationResultFromRgbaImage(createRequest(), pixels, {
      resample: () => pixels,
    })

    expect(first.grid.cells).toEqual(second.grid.cells)
    expect(random).not.toHaveBeenCalled()
  })
})
