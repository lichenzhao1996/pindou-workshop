import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE } from '../../src/domain/palette'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { deriveMaterialStatsView } from '../../src/features/editor/materials/material-stats-view'

const source: Source = {
  originalImage: new Blob(['task076-unit'], { type: 'image/png' }),
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

describe('TASK-076 complete materials list source', () => {
  it('derives every complete-list row from the same stats and suggestions as the color list', () => {
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const project = projectWithGrid([0, 1, 1, 2, white.paletteIndex])
    const stats = deriveProjectStats(project)
    const view = deriveMaterialStatsView(stats)!

    expect(view.rows).toHaveLength(view.usedColorCount)
    expect(
      view.rows.map(({ paletteIndex, count, suggestedCount, entry }) => [
        paletteIndex,
        entry.displayCode,
        entry.name,
        count,
        suggestedCount,
      ]),
    ).toEqual([
      [1, MARD_291_PALETTE.entries[0]!.displayCode, MARD_291_PALETTE.entries[0]!.name, 2, 3],
      [2, MARD_291_PALETTE.entries[1]!.displayCode, MARD_291_PALETTE.entries[1]!.name, 1, 2],
      [white.paletteIndex, white.displayCode, white.name, 1, 2],
    ])
    expect(view.totalBeads).toBe(4)
    expect(view.rows.some(({ paletteIndex }) => paletteIndex === 0)).toBe(false)
  })

  it('returns an empty complete list for an all-EMPTY Grid', () => {
    const view = deriveMaterialStatsView(deriveProjectStats(projectWithGrid([0, 0])))!
    expect(view).toEqual({ totalBeads: 0, usedColorCount: 0, rows: [] })
  })
})
