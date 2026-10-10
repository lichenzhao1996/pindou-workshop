import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import {
  calculateSuggestedBeadCount,
  createGrid,
  createProject,
  deriveProjectStats,
} from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { deriveMaterialStatsView } from '../../src/features/editor/materials/material-stats-view'

const source: Source = {
  originalImage: new Blob(['task075-unit'], { type: 'image/png' }),
  originalFileName: 'materials.png',
  mimeType: 'image/png',
  originalWidth: 40,
  originalHeight: 30,
}

function projectWithGrid(values: readonly number[]): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid }
}

describe('TASK-075 suggested material quantities', () => {
  it.each([
    [0, 0],
    [1, 2],
    [2, 3],
    [10, 11],
    [19, 20],
    [20, 21],
    [21, 23],
    [40, 42],
    [100, 105],
    [100_000, 105_000],
  ])(
    'adds the fixed 5%% allowance to %i beads, rounding the extra up to %i',
    (actual, expected) => {
      expect(calculateSuggestedBeadCount(actual)).toBe(expected)
      expect(calculateSuggestedBeadCount(actual)).toBe(calculateSuggestedBeadCount(actual))
      expect(calculateSuggestedBeadCount(actual)).toBeGreaterThanOrEqual(actual)
    },
  )

  it('rejects invalid inputs and unsafe suggested results', () => {
    for (const invalid of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => calculateSuggestedBeadCount(invalid)).toThrow(RangeError)
    }
    expect(() => calculateSuggestedBeadCount(Number.MAX_SAFE_INTEGER)).toThrow(RangeError)
  })

  it('adds suggestions per used MARD color without changing actual stats, order, EMPTY or white', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const project = projectWithGrid([0, 2, 1, 2, white.paletteIndex, white.paletteIndex])
    const stats = deriveProjectStats(project)
    const beforeUsage = stats.usageByPaletteIndex.slice()
    const beforeIndices = [...stats.usedPaletteIndices]
    const beforeRevision = project.revision
    const view = deriveMaterialStatsView(stats)!

    expect(view.totalBeads).toBe(5)
    expect(view.usedColorCount).toBe(3)
    expect(
      view.rows.map(({ paletteIndex, entry, count, suggestedCount }) => [
        paletteIndex,
        entry.displayCode,
        entry.name,
        count,
        suggestedCount,
      ]),
    ).toEqual([
      [2, MARD_291_PALETTE.entries[1]!.displayCode, MARD_291_PALETTE.entries[1]!.name, 2, 3],
      [white.paletteIndex, white.displayCode, white.name, 2, 3],
      [1, MARD_291_PALETTE.entries[0]!.displayCode, MARD_291_PALETTE.entries[0]!.name, 1, 2],
    ])
    expect(view.rows.some(({ paletteIndex }) => paletteIndex === 0)).toBe(false)
    expect(stats.usageByPaletteIndex).toEqual(beforeUsage)
    expect(stats.usedPaletteIndices).toEqual(beforeIndices)
    expect(project.revision).toBe(beforeRevision)
    expect(view).not.toHaveProperty('suggestedTotalBeads')
  })

  it('keeps empty material views empty and does not mutate source stats', () => {
    const stats = deriveProjectStats(projectWithGrid([0, 0, 0]))
    const beforeUsage = stats.usageByPaletteIndex.slice()
    const view = deriveMaterialStatsView(stats)

    expect(view).toEqual({ totalBeads: 0, usedColorCount: 0, rows: [] })
    expect(deriveMaterialStatsView(null)).toBeNull()
    expect(stats.usageByPaletteIndex).toEqual(beforeUsage)
  })
})
