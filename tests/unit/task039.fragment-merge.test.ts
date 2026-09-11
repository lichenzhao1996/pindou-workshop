import { describe, expect, it } from 'vitest'
import {
  analyzeGridFragments,
  mergeFragmentsConservatively,
  type GridFragmentAnalysis,
} from '../../src/domain/generation'
import type { Palette, PaletteEntry } from '../../src/domain/palette'
import { createGrid, EMPTY, isValidGridCellValue, type Grid } from '../../src/domain/project'

function createPalette(lByPaletteIndex: Readonly<Record<number, number>>): Palette {
  const entries: PaletteEntry[] = Object.entries(lByPaletteIndex).map(([index, l]) => {
    const paletteIndex = Number(index)
    return {
      paletteIndex,
      colorId: `fixture:${paletteIndex}`,
      displayCode: `F${paletteIndex}`,
      name: `Fixture ${paletteIndex}`,
      rgb: { r: 0, g: 0, b: 0 },
      hex: '#000000',
      lab: { l, a: 0, b: 0 },
      family: 'fixture',
    }
  })

  return {
    source: 'MARD',
    paletteVersion: 'task-039-fixture',
    entries,
    byColorId: new Map(entries.map((entry) => [entry.colorId, entry] as const)),
  }
}

const palette = createPalette({
  1: 50,
  2: 58,
  3: 51,
  4: 58.01,
  5: 54,
  6: 54,
})

function createFixtureGrid(width: number, height: number, cells: number[]): Grid {
  const grid = createGrid(width, height)
  grid.cells.set(cells)
  return grid
}

function merge(grid: Grid, fragments = analyzeGridFragments(grid, palette)): Grid {
  return mergeFragmentsConservatively(grid, fragments, palette)
}

describe('TASK-039 conservative fragment merge', () => {
  it('merges an interior size-one region into a directly adjacent color at ΔE76 = 8', () => {
    const grid = createFixtureGrid(3, 3, [2, 2, 2, 2, 1, 2, 2, 2, 2])

    const result = merge(grid)

    expect(Array.from(result.cells)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2])
  })

  it('merges an interior size-two region', () => {
    const grid = createFixtureGrid(4, 4, [3, 3, 3, 3, 3, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3])

    const result = merge(grid)

    expect(Array.from(result.cells)).toEqual(new Array(16).fill(3))
  })

  it('conservatively processes size three but preserves size four', () => {
    const sizeThree = new Array(25).fill(2)
    sizeThree.splice(11, 3, 1, 1, 1)
    const sizeFour = new Array(25).fill(3)
    for (const index of [6, 7, 11, 12]) {
      sizeFour[index] = 1
    }

    const mergedSizeThree = merge(createFixtureGrid(5, 5, sizeThree))
    const preservedSizeFour = merge(createFixtureGrid(5, 5, sizeFour))

    expect(Array.from(mergedSizeThree.cells)).toEqual(new Array(25).fill(2))
    expect(Array.from(preservedSizeFour.cells)).toEqual(sizeFour)
  })

  it('preserves a fragment when every adjacent color exceeds ΔE76 8', () => {
    const grid = createFixtureGrid(3, 3, [4, 4, 4, 4, 1, 4, 4, 4, 4])

    expect(Array.from(merge(grid).cells)).toEqual(Array.from(grid.cells))
  })

  it('never merges EMPTY regions or selects EMPTY as a target', () => {
    const cells = new Array(25).fill(2)
    cells[12] = 1
    cells[7] = EMPTY
    cells[11] = EMPTY
    cells[13] = EMPTY
    const grid = createFixtureGrid(5, 5, cells)

    const result = merge(grid)

    expect(result.cells[12]).toBe(2)
    expect(result.cells[7]).toBe(EMPTY)
    expect(result.cells[11]).toBe(EMPTY)
    expect(result.cells[13]).toBe(EMPTY)
  })

  it('preserves any region that touches the Grid edge', () => {
    const grid = createFixtureGrid(3, 3, [2, 1, 2, 2, 2, 2, 2, 2, 2])

    expect(Array.from(merge(grid).cells)).toEqual(Array.from(grid.cells))
  })

  it('orders candidates by contact count, ΔE76, then paletteIndex deterministically', () => {
    const contactGrid = createFixtureGrid(3, 3, [2, 2, 2, 2, 1, 3, 2, 2, 2])
    const distanceGrid = createFixtureGrid(3, 3, [2, 2, 2, 3, 1, 3, 2, 2, 2])
    const indexGrid = createFixtureGrid(3, 3, [5, 5, 5, 6, 1, 6, 5, 5, 5])
    const indexFragments = analyzeGridFragments(indexGrid, palette)
    const reversedNeighborOrder: readonly GridFragmentAnalysis[] = indexFragments.map((fragment) =>
      fragment.paletteIndex === 1
        ? {
            ...fragment,
            neighborCounts: new Map([...fragment.neighborCounts].reverse()),
          }
        : fragment,
    )

    expect(merge(contactGrid).cells[4]).toBe(2)
    expect(merge(distanceGrid).cells[4]).toBe(3)
    expect(merge(indexGrid).cells[4]).toBe(5)
    expect(merge(indexGrid, reversedNeighborOrder).cells[4]).toBe(5)
  })

  it('uses one snapshot, preserves dimensions and legal values, and never mutates input', () => {
    const grid = createFixtureGrid(3, 3, [2, 2, 2, 2, 1, 2, 2, 2, 2])
    const before = grid.cells.slice()
    const fragments = analyzeGridFragments(grid, palette)

    const first = merge(grid, fragments)
    const second = merge(grid, [...fragments].reverse())

    expect(first).not.toBe(grid)
    expect(first.cells).not.toBe(grid.cells)
    expect(first.width).toBe(grid.width)
    expect(first.height).toBe(grid.height)
    expect(Array.from(first.cells)).toEqual(Array.from(second.cells))
    expect(Array.from(grid.cells)).toEqual(Array.from(before))
    expect(Array.from(first.cells).every(isValidGridCellValue)).toBe(true)
  })
})
