import { describe, expect, it } from 'vitest'
import { createGrid, createProject } from '../../src/domain/project'
import { deriveUsedColorRows } from '../../src/features/editor/color-management'
import {
  deriveColorOptimizationSuggestions,
  LOW_USAGE_BEAD_THRESHOLD,
} from '../../src/features/editor/color-optimization'

function rowsFor(values: readonly number[]) {
  const source = {
    originalImage: new Blob(['task089'], { type: 'image/png' }),
    originalFileName: 'optimization.png',
    mimeType: 'image/png',
    originalWidth: values.length,
    originalHeight: 1,
  }
  const project = createProject({
    source,
    crop: {
      x: 0,
      y: 0,
      width: values.length,
      height: 1,
      rotation: 0,
      aspectRatio: values.length,
    },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  const withGrid = { ...project, grid }
  return { project: withGrid, rows: deriveUsedColorRows(withGrid) }
}

describe('TASK-089 color optimization suggestions', () => {
  it('ranks nearest pairs among used MARD colors and directs merges toward the more-used color', () => {
    const values = [...Array<number>(12).fill(1), ...Array<number>(3).fill(2), 3, 0]
    const { project, rows } = rowsFor(values)
    const before = Array.from(project.grid!.cells)
    const suggestions = deriveColorOptimizationSuggestions(rows)

    expect(suggestions.similarColors.length).toBeGreaterThan(0)
    expect(suggestions.similarColors.map(({ distance }) => distance)).toEqual(
      [...suggestions.similarColors.map(({ distance }) => distance)].sort((a, b) => a - b),
    )
    expect(
      suggestions.similarColors.every(
        ({ sourceCount, targetCount }) =>
          sourceCount < targetCount ||
          (sourceCount === targetCount && source.paletteIndex > target.paletteIndex),
      ),
    ).toBe(true)
    expect(
      suggestions.similarColors.every(
        ({ source, target }) => source.paletteIndex > 0 && target.paletteIndex > 0,
      ),
    ).toBe(true)
    expect(Array.from(project.grid!.cells)).toEqual(before)
  })

  it('uses the PRD low-use example boundary and suggests only toward another used color', () => {
    const values = [
      ...Array<number>(12).fill(1),
      ...Array<number>(3).fill(2),
      ...Array<number>(10).fill(3),
    ]
    const { rows } = rowsFor(values)
    const suggestions = deriveColorOptimizationSuggestions(rows)

    expect(LOW_USAGE_BEAD_THRESHOLD).toBe(10)
    expect(
      suggestions.lowUsageColors.map(({ source, sourceCount }) => [
        source.paletteIndex,
        sourceCount,
      ]),
    ).toEqual([[2, 3]])
    expect(suggestions.lowUsageColors[0]?.targetCount).toBeGreaterThanOrEqual(3)
    expect(suggestions.lowUsageColors[0]?.target.paletteIndex).not.toBe(2)
  })

  it('returns no suggestions for fewer than two used colors and ignores EMPTY', () => {
    const { rows: oneColor } = rowsFor([0, 0, 1, 0])
    expect(deriveColorOptimizationSuggestions(oneColor)).toEqual({
      similarColors: [],
      lowUsageColors: [],
    })
    const { rows: noColors } = rowsFor([0, 0])
    expect(deriveColorOptimizationSuggestions(noColors)).toEqual({
      similarColors: [],
      lowUsageColors: [],
    })
  })
})
