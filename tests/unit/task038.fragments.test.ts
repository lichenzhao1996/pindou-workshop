import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, type Grid } from '../../src/domain/project'
import { analyzeGridFragments } from '../../src/domain/generation'

function createFixtureGrid(width: number, height: number, cells: number[]): Grid {
  const grid = createGrid(width, height)
  grid.cells.set(cells)
  return grid
}

describe('TASK-038 four-neighbor fragment analysis', () => {
  it('identifies size bands, adjacent colors, contact counts and grid edges', () => {
    const grid = createFixtureGrid(4, 3, [2, 1, 3, 2, 4, 3, 4, 2, 4, 4, 5, 2])

    const fragments = analyzeGridFragments(grid, MARD_291_PALETTE)
    const sizeOne = fragments.find((fragment) => fragment.paletteIndex === 1 && fragment.size === 1)
    const sizeFour = fragments.find((fragment) => fragment.paletteIndex === 4)

    expect(sizeOne).toMatchObject({
      sizeBand: '1',
      touchesGridEdge: true,
      mainNeighborPaletteIndex: 3,
      mainNeighborContactCount: 2,
    })
    expect(sizeOne?.neighborContactCount).toBeGreaterThan(0)
    expect(sizeOne?.mainNeighborLabDistance).toEqual(expect.any(Number))
    expect(sizeFour).toMatchObject({ size: 3, sizeBand: '3', touchesGridEdge: true })
  })

  it('does not connect diagonal cells', () => {
    const grid = createFixtureGrid(2, 2, [1, 2, 2, 1])

    const fragments = analyzeGridFragments(grid, MARD_291_PALETTE)

    expect(fragments.filter((fragment) => fragment.paletteIndex === 1)).toHaveLength(2)
    expect(fragments.filter((fragment) => fragment.paletteIndex === 2)).toHaveLength(2)
    expect(fragments.every((fragment) => fragment.size === 1)).toBe(true)
  })

  it('keeps EMPTY as a distinct analyzed value and never selects it as a merge target', () => {
    const grid = createFixtureGrid(3, 1, [0, 1, 0])

    const fragments = analyzeGridFragments(grid, MARD_291_PALETTE)
    const colored = fragments.find((fragment) => fragment.paletteIndex === 1)

    expect(fragments.filter((fragment) => fragment.paletteIndex === 0)).toHaveLength(2)
    expect(colored?.neighboringPaletteIndices).toEqual([0])
    expect(colored?.mainNeighborPaletteIndex).toBeNull()
    expect(colored?.mainNeighborLabDistance).toBeNull()
  })

  it('does not modify the input cells and uses a deterministic tie-break for main color', () => {
    const grid = createFixtureGrid(3, 3, [2, 1, 3, 1, 1, 1, 4, 1, 5])
    const before = grid.cells.slice()

    const first = analyzeGridFragments(grid, MARD_291_PALETTE)
    const second = analyzeGridFragments(grid, MARD_291_PALETTE)
    const center = first.find((fragment) => fragment.paletteIndex === 1)

    expect(Array.from(grid.cells)).toEqual(Array.from(before))
    expect(second).toEqual(first)
    expect(center?.mainNeighborPaletteIndex).toBe(2)
  })
})
