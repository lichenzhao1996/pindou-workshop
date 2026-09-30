import { describe, expect, it } from 'vitest'
import { mergeFragmentsConservatively } from '../../src/domain/generation/fragment-merge'
import { simplifyBackground } from '../../src/domain/generation/optimize/background'
import {
  analyzeGridFragments,
  type GridFragmentAnalysis,
} from '../../src/domain/generation/optimize/fragments'
import type { Palette, PaletteEntry } from '../../src/domain/palette'
import { createGrid, EMPTY, isValidGridCellValue, type Grid } from '../../src/domain/project'

function createPalette(): Palette {
  const lightness = { 1: 50, 2: 56, 3: 56.01, 4: 62, 5: 100, 6: 95, 7: 49 }
  const entries: PaletteEntry[] = Object.entries(lightness).map(([index, l]) => {
    const paletteIndex = Number(index)
    return {
      paletteIndex,
      colorId: `fixture:${paletteIndex}`,
      displayCode: `F${paletteIndex}`,
      name: paletteIndex === 5 ? 'White bead' : `Fixture ${paletteIndex}`,
      rgb: paletteIndex === 5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 },
      hex: paletteIndex === 5 ? '#FFFFFF' : '#000000',
      lab: { l, a: 0, b: 0 },
      family: 'fixture',
    }
  })
  return {
    source: 'MARD',
    paletteVersion: 'task-041-fixture',
    entries,
    byColorId: new Map(entries.map((entry) => [entry.colorId, entry] as const)),
  }
}

const palette = createPalette()

function fixture(width: number, height: number, cells: number[]): Grid {
  const grid = createGrid(width, height)
  grid.cells.set(cells)
  return grid
}

function simplify(
  grid: Grid,
  fragments: readonly GridFragmentAnalysis[] = analyzeGridFragments(grid, palette),
  inputPalette: Palette = palette,
): Grid {
  return simplifyBackground(grid, fragments, inputPalette)
}

function checker(width: number, height: number): number[] {
  return Array.from({ length: width * height }, (_, index) =>
    (Math.floor(index / width) + (index % width)) % 2 === 0 ? 4 : 5,
  )
}

describe('TASK-041 conservative background simplification', () => {
  it.each([0, 2, 4, 10, 14, 20, 22, 24])(
    'does nothing when border cell %i is EMPTY, including side middles and corners',
    (emptyIndex) => {
      const cells = new Array(25).fill(1)
      cells[12] = 2
      cells[emptyIndex] = EMPTY
      const grid = fixture(5, 5, cells)

      const result = simplify(grid)

      expect(Array.from(result.cells)).toEqual(cells)
      expect(result).not.toBe(grid)
      expect(result.cells).not.toBe(grid.cells)
    },
  )

  it('does not choose a larger region that touches only one distinct outer side', () => {
    const cells = new Array(49).fill(4)
    for (let row = 0; row < 6; row += 1) {
      for (let column = 1; column < 6; column += 1) {
        cells[row * 7 + column] = 1
      }
    }
    cells[24] = 7
    const grid = fixture(7, 7, cells)
    const fragments = analyzeGridFragments(grid, palette)

    expect(fragments.find((fragment) => fragment.paletteIndex === 1)?.size).toBe(29)
    expect(simplify(grid, fragments).cells[24]).toBe(7)
  })

  it('requires 25% of all Grid cells, not just the non-EMPTY cells', () => {
    const cells = new Array(36).fill(EMPTY)
    for (let index = 0; index < cells.length; index += 1) {
      const row = Math.floor(index / 6)
      const column = index % 6
      if (row === 0 || row === 5 || column === 0 || column === 5) {
        cells[index] = (row + column) % 2 === 0 ? 4 : 5
      }
    }
    for (const index of [0, 1, 2, 3, 6, 12]) {
      cells[index] = 1
    }
    cells[14] = 7
    const grid = fixture(6, 6, cells)

    expect(cells.filter((cell) => cell !== EMPTY)).toHaveLength(21)
    expect(Array.from(simplify(grid).cells)).toEqual(cells)
  })

  it('includes a primary region occupying exactly 25% of the Grid', () => {
    const cells = checker(4, 4)
    for (const index of [0, 1, 4, 5]) {
      cells[index] = 1
    }
    cells[10] = 7

    expect(simplify(fixture(4, 4, cells)).cells[10]).toBe(1)
  })

  it('returns no-op for equally largest eligible regions, without a palette-index tie-break', () => {
    const cells = checker(4, 4)
    for (const index of [0, 1, 4, 5]) {
      cells[index] = 1
    }
    for (const index of [10, 11, 14, 15]) {
      cells[index] = 2
    }
    cells[2] = 7
    const grid = fixture(4, 4, cells)
    const fragments = analyzeGridFragments(grid, palette)

    expect(Array.from(simplify(grid, fragments).cells)).toEqual(cells)
    expect(Array.from(simplify(grid, [...fragments].reverse()).cells)).toEqual(cells)
  })

  it('chooses the uniquely largest eligible region instead of the first eligible region', () => {
    const cells = checker(4, 4)
    for (const index of [0, 1, 4, 5]) {
      cells[index] = 1
    }
    for (const index of [7, 10, 11, 14, 15]) {
      cells[index] = 2
    }
    cells[2] = 7
    const result = simplify(fixture(4, 4, cells))

    expect([0, 1, 4, 5].map((index) => result.cells[index])).toEqual([2, 2, 2, 2])
    expect(result.cells[2]).toBe(7)
  })

  it.each([1, 2, 3, 4, 5, 6])('simplifies a close non-EMPTY region of size %i', (size) => {
    const cells = new Array(81).fill(1)
    const indices = Array.from({ length: size }, (_, offset) => (offset + 1) * 9 + 3)
    for (const index of indices) {
      cells[index] = 2
    }

    expect(Array.from(simplify(fixture(9, 9, cells)).cells)).toEqual(new Array(81).fill(1))
  })

  it('preserves a close region of size seven', () => {
    const cells = new Array(81).fill(1)
    for (let row = 1; row <= 7; row += 1) {
      cells[row * 9 + 3] = 2
    }

    expect(Array.from(simplify(fixture(9, 9, cells)).cells)).toEqual(cells)
  })

  it('includes ΔE76 = 6 but rejects a distance greater than six', () => {
    const atLimit = fixture(3, 3, [1, 1, 1, 1, 2, 1, 1, 1, 1])
    const outsideLimit = fixture(3, 3, [1, 1, 1, 1, 3, 1, 1, 1, 1])

    expect(simplify(atLimit).cells[4]).toBe(1)
    expect(simplify(outsideLimit).cells[4]).toBe(3)
  })

  it('preserves interior EMPTY without disabling otherwise eligible simplification', () => {
    const cells = new Array(25).fill(1)
    cells[6] = 2
    cells[12] = EMPTY

    const result = simplify(fixture(5, 5, cells))

    expect(result.cells[6]).toBe(1)
    expect(result.cells[12]).toBe(EMPTY)
  })

  it('treats a white background as a real bead color, never EMPTY', () => {
    const cells = new Array(25).fill(5)
    cells[12] = 6

    const result = simplify(fixture(5, 5, cells))

    expect(Array.from(result.cells)).toEqual(new Array(25).fill(5))
    expect(Array.from(result.cells)).not.toContain(EMPTY)
  })

  it('does not chain through an intermediate close fragment or reselect the background', () => {
    const cells = new Array(49).fill(1)
    cells[24] = 2
    cells[25] = 4
    const grid = fixture(7, 7, cells)

    const result = simplify(grid)

    expect(result.cells[24]).toBe(1)
    expect(result.cells[25]).toBe(4)
  })

  it('compares to the primary background without inventing an adjacency requirement', () => {
    const cells = new Array(81).fill(1)
    for (let row = 3; row <= 5; row += 1) {
      for (let column = 3; column <= 5; column += 1) {
        cells[row * 9 + column] = 4
      }
    }
    cells[40] = 2
    const grid = fixture(9, 9, cells)
    const fragments = analyzeGridFragments(grid, palette)

    expect(
      fragments.find((fragment) => fragment.paletteIndex === 2)?.neighboringPaletteIndices,
    ).toEqual([4])
    expect(simplify(grid, fragments).cells[40]).toBe(1)
  })

  it('uses caller re-analysis after fragment merging instead of the old region sizes', () => {
    const cells = checker(4, 4)
    for (const index of [0, 1, 4, 5]) {
      cells[index] = 1
    }
    for (const index of [10, 11, 14, 15]) {
      cells[index] = 2
    }
    cells[6] = 7
    const grid = fixture(4, 4, cells)
    const originalAnalysis = analyzeGridFragments(grid, palette)
    const merged = mergeFragmentsConservatively(grid, originalAnalysis, palette)
    const mergedAnalysis = analyzeGridFragments(merged, palette)

    expect(Array.from(simplify(grid, originalAnalysis).cells)).toEqual(cells)
    expect(merged.cells[6]).toBe(1)
    const result = simplify(merged, mergedAnalysis)
    expect([10, 11, 14, 15].map((index) => result.cells[index])).toEqual([1, 1, 1, 1])
  })

  it('is deterministic regardless of fragment and Palette-entry order', () => {
    const cells = new Array(49).fill(1)
    cells[16] = 2
    cells[24] = 4
    cells[32] = 7
    const grid = fixture(7, 7, cells)
    const fragments = analyzeGridFragments(grid, palette)
    const reversedPalette = { ...palette, entries: [...palette.entries].reverse() }

    const first = simplify(grid, fragments)
    const second = simplify(grid, [...fragments].reverse(), reversedPalette)
    const repeated = simplify(grid, fragments)

    expect(Array.from(second.cells)).toEqual(Array.from(first.cells))
    expect(Array.from(repeated.cells)).toEqual(Array.from(first.cells))
  })

  it('preserves input Grid and analysis while returning a legal independent Grid', () => {
    const cells = new Array(25).fill(1)
    cells[12] = 2
    const grid = fixture(5, 5, cells)
    const fragments = analyzeGridFragments(grid, palette)
    const before = structuredClone(fragments)

    const result = simplify(grid, fragments)

    expect(result).not.toBe(grid)
    expect(result.cells).not.toBe(grid.cells)
    expect(result.width).toBe(5)
    expect(result.height).toBe(5)
    expect(Array.from(result.cells).every(isValidGridCellValue)).toBe(true)
    expect(Array.from(grid.cells)).toEqual(cells)
    expect(fragments).toEqual(before)
  })

  it('returns an independent no-op Grid for a pure background', () => {
    const grid = fixture(3, 3, new Array(9).fill(1))

    const result = simplify(grid)

    expect(result).not.toBe(grid)
    expect(result.cells).not.toBe(grid.cells)
    expect(Array.from(result.cells)).toEqual(Array.from(grid.cells))
  })
})
