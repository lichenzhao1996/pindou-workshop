import { describe, expect, it } from 'vitest'
import { mergeFragmentsConservatively } from '../../src/domain/generation/fragment-merge'
import { getProtectedFragmentRegionIds } from '../../src/domain/generation/optimize/contours'
import {
  analyzeGridFragments,
  type GridFragmentAnalysis,
} from '../../src/domain/generation/optimize/fragments'
import { getPaletteEntryByColorId } from '../../src/domain/palette/accessors'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { deltaE76 } from '../../src/domain/palette/match'
import type { LabColor, Palette, PaletteEntry } from '../../src/domain/palette/types'
import { EMPTY } from '../../src/domain/project/constants'
import { createGrid, type Grid } from '../../src/domain/project/grid'

function createPalette(labs: Readonly<Record<number, LabColor>>): Palette {
  const entries: PaletteEntry[] = Object.entries(labs).map(([index, lab]) => {
    const paletteIndex = Number(index)
    return {
      paletteIndex,
      colorId: `fixture:${paletteIndex}`,
      displayCode: `F${paletteIndex}`,
      name: `Fixture ${paletteIndex}`,
      rgb: { r: 0, g: 0, b: 0 },
      hex: '#000000',
      lab,
      family: 'fixture',
    }
  })

  return {
    source: 'MARD',
    paletteVersion: 'task-040-fixture',
    entries,
    byColorId: new Map(entries.map((entry) => [entry.colorId, entry])),
  }
}

const palette = createPalette({
  1: { l: 50, a: 0, b: 0 },
  2: { l: 51, a: 0, b: 0 },
  3: { l: 62, a: 0, b: 0 },
  4: { l: 50, a: 18, b: 0 },
  5: { l: 61.99, a: 0, b: 0 },
  6: { l: 50, a: 17.99, b: 0 },
  7: { l: 38, a: 0, b: 0 },
})

function gridWithRegion(cellIndices: readonly number[], background = 2): Grid {
  const grid = createGrid(5, 5)
  grid.cells.fill(background)
  for (const index of cellIndices) {
    grid.cells[index] = 1
  }
  return grid
}

function sourceRegion(fragments: readonly GridFragmentAnalysis[]): GridFragmentAnalysis {
  const region = fragments.find((fragment) => fragment.paletteIndex === 1)
  if (!region) {
    throw new Error('The fixture must contain a source region')
  }
  return region
}

function isSourceProtected(grid: Grid): boolean {
  const fragments = analyzeGridFragments(grid, palette)
  return getProtectedFragmentRegionIds(fragments, palette).has(sourceRegion(fragments).regionId)
}

describe('TASK-040 contour protection', () => {
  it.each([[0], [0, 1], [0, 1, 2]])('protects a Grid-edge region of cells %j', (...indices) => {
    expect(isSourceProtected(gridWithRegion(indices))).toBe(true)
  })

  it('protects an interior small region adjacent to EMPTY', () => {
    const grid = gridWithRegion([12])
    grid.cells[7] = EMPTY

    expect(isSourceProtected(grid)).toBe(true)
  })

  it('does not protect an EMPTY region even when it touches the border', () => {
    const grid = gridWithRegion([12])
    grid.cells[0] = EMPTY
    const fragments = analyzeGridFragments(grid, palette)
    const emptyRegion = fragments.find((fragment) => fragment.paletteIndex === EMPTY)!

    expect(getProtectedFragmentRegionIds(fragments, palette).has(emptyRegion.regionId)).toBe(false)
  })

  it.each([3, 7])('includes absolute ΔL = 12 against paletteIndex %i', (neighbor) => {
    expect(isSourceProtected(gridWithRegion([12], neighbor))).toBe(true)
  })

  it('includes ΔE76 = 18 even with zero lightness difference', () => {
    expect(isSourceProtected(gridWithRegion([12], 4))).toBe(true)
  })

  it.each([2, 5, 6])(
    'preserves the unprotected state below both thresholds against %i',
    (color) => {
      expect(isSourceProtected(gridWithRegion([12], color))).toBe(false)
    },
  )

  it.each([4, 5, 6, 7])('does not apply the small-region rule to size %i', (size) => {
    const grid = gridWithRegion(
      Array.from({ length: size }, (_, index) => index),
      3,
    )

    expect(isSourceProtected(grid)).toBe(false)
  })

  it('marks the whole size-three region when only one cell has an EMPTY neighbor', () => {
    const grid = gridWithRegion([11, 12, 13])
    grid.cells[8] = EMPTY
    const fragments = analyzeGridFragments(grid, palette)
    const protectedRegionIds = getProtectedFragmentRegionIds(fragments, palette)
    const result = mergeFragmentsConservatively(
      grid,
      fragments.filter((fragment) => !protectedRegionIds.has(fragment.regionId)),
      palette,
    )

    expect(protectedRegionIds.has(sourceRegion(fragments).regionId)).toBe(true)
    expect([result.cells[11], result.cells[12], result.cells[13]]).toEqual([1, 1, 1])
  })

  it('checks every direct neighbor rather than only the main adjacent color', () => {
    const grid = gridWithRegion([12])
    grid.cells[7] = 3
    const fragments = analyzeGridFragments(grid, palette)
    const region = sourceRegion(fragments)

    expect(region.mainNeighborPaletteIndex).toBe(2)
    expect(region.mainNeighborLabDistance).toBe(1)
    expect(getProtectedFragmentRegionIds(fragments, palette).has(region.regionId)).toBe(true)
  })

  it('does not use high-contrast colors that are not directly adjacent', () => {
    const grid = gridWithRegion([12])
    grid.cells[0] = 3

    expect(isSourceProtected(grid)).toBe(false)
  })

  it('treats production white as an ordinary non-EMPTY color with actual Lab distances', () => {
    const white = getPaletteEntryByColorId(MARD_291_PALETTE, 'mard:t1')!
    const similar = MARD_291_PALETTE.entries.find(
      (entry) =>
        entry.paletteIndex !== white.paletteIndex &&
        Math.abs(entry.lab.l - white.lab.l) < 12 &&
        deltaE76(entry.lab, white.lab) < 18,
    )!
    const grid = createGrid(5, 5)
    grid.cells.fill(similar.paletteIndex)
    grid.cells[12] = white.paletteIndex
    const fragments = analyzeGridFragments(grid)
    const whiteRegion = fragments.find((fragment) => fragment.paletteIndex === white.paletteIndex)!

    expect(white.rgb).toEqual({ r: 255, g: 255, b: 255 })
    expect(white.paletteIndex).not.toBe(EMPTY)
    expect(getProtectedFragmentRegionIds(fragments).has(whiteRegion.regionId)).toBe(false)

    grid.cells[7] = EMPTY
    const adjacentToEmpty = analyzeGridFragments(grid)
    const exposedWhite = adjacentToEmpty.find(
      (fragment) => fragment.paletteIndex === white.paletteIndex,
    )!
    expect(getProtectedFragmentRegionIds(adjacentToEmpty).has(exposedWhite.regionId)).toBe(true)
    expect(grid.cells[12]).toBe(white.paletteIndex)
  })

  it('is deterministic across region and neighbor order without mutating Grid or analysis', () => {
    const grid = gridWithRegion([12])
    grid.cells[7] = 3
    const cellsBefore = grid.cells.slice()
    const fragments = analyzeGridFragments(grid, palette)
    const before = structuredClone(fragments)
    const reordered = [...fragments].reverse().map((fragment) => ({
      ...fragment,
      neighborCounts: new Map([...fragment.neighborCounts].reverse()),
    }))

    const first = getProtectedFragmentRegionIds(fragments, palette)
    expect(getProtectedFragmentRegionIds(fragments, palette)).toEqual(first)
    expect(getProtectedFragmentRegionIds(reordered, palette)).toEqual(first)
    expect(fragments).toEqual(before)
    expect(grid.cells).toEqual(cellsBefore)
  })

  it('does not introduce replacement colors when there are no adjacent targets', () => {
    const grid = createGrid(1, 1)
    grid.cells[0] = 1
    const fragments = analyzeGridFragments(grid, palette)

    expect(getProtectedFragmentRegionIds(fragments, palette)).toEqual(new Set([0]))
    expect(grid.cells[0]).toBe(1)
  })

  it('keeps contour protection separate from merging through the existing TASK-039 API', () => {
    const grid = gridWithRegion([12])
    grid.cells[7] = EMPTY
    const fragments = analyzeGridFragments(grid, palette)
    const protectedRegionIds = getProtectedFragmentRegionIds(fragments, palette)

    expect(mergeFragmentsConservatively(grid, fragments, palette).cells[12]).toBe(2)
    expect(
      mergeFragmentsConservatively(
        grid,
        fragments.filter((fragment) => !protectedRegionIds.has(fragment.regionId)),
        palette,
      ).cells[12],
    ).toBe(1)
  })
})
