import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { deriveUsedColorRowsFromStats } from '../../src/features/editor/color-management'
import { deriveMaterialStatsView } from '../../src/features/editor/materials/material-stats-view'

const source: Source = {
  originalImage: new Blob(['task074-unit'], { type: 'image/png' }),
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

describe('TASK-074 material stats view', () => {
  it('projects the formal ProjectStats into MARD rows and actual material totals', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const stats = deriveProjectStats(projectWithGrid([0, 1, 1, 2, white.paletteIndex]))
    const view = deriveMaterialStatsView(stats)!

    expect(view.totalBeads).toBe(4)
    expect(view.usedColorCount).toBe(3)
    expect(
      view.rows.map(({ paletteIndex, entry, count }) => [
        paletteIndex,
        entry.displayCode,
        entry.name,
        count,
      ]),
    ).toEqual([
      [1, 'A1', MARD_291_PALETTE.entries[0]!.name, 2],
      [2, MARD_291_PALETTE.entries[1]!.displayCode, MARD_291_PALETTE.entries[1]!.name, 1],
      [white.paletteIndex, white.displayCode, white.name, 1],
    ])
    expect(view.rows).toEqual(deriveUsedColorRowsFromStats(stats))
    expect(view.rows.some(({ paletteIndex }) => paletteIndex === 0)).toBe(false)
    expect(view.rows.find(({ paletteIndex }) => paletteIndex === white.paletteIndex)?.count).toBe(1)
  })

  it('keeps EMPTY-only, null, sorting, determinism and input stats safe without loss suggestions', () => {
    const allEmptyStats = deriveProjectStats(projectWithGrid([0, 0, 0]))
    const allEmptyView = deriveMaterialStatsView(allEmptyStats)!
    expect(allEmptyView).toEqual({ totalBeads: 0, usedColorCount: 0, rows: [] })
    expect(deriveMaterialStatsView(null)).toBeNull()

    const stats = deriveProjectStats(projectWithGrid([2, 1, 2, 0, 1]))
    const originalUsage = stats.usageByPaletteIndex.slice()
    const originalIndices = [...stats.usedPaletteIndices]
    const first = deriveMaterialStatsView(stats)!
    const second = deriveMaterialStatsView(stats)!

    expect(first).toEqual(second)
    expect(first.rows.map(({ paletteIndex, count }) => [paletteIndex, count])).toEqual([
      [1, 2],
      [2, 2],
    ])
    expect(stats.usageByPaletteIndex).toEqual(originalUsage)
    expect(stats.usedPaletteIndices).toEqual(originalIndices)
    expect(first.rows.every((row) => !('suggestedCount' in row))).toBe(true)
    expect(first.rows.every((row) => !('wastePercent' in row))).toBe(true)
  })
})
