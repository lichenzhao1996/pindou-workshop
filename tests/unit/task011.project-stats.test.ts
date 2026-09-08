import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  MAX_PALETTE_INDEX,
  applyGridOperation,
  createGrid,
  createProject,
  deriveProjectStats,
  setCells,
} from '../../src/domain/project'
import type { CropState, GridCellChange, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'stats-fixture.png',
  mimeType: 'image/png',
  originalWidth: 200,
  originalHeight: 100,
}

const crop: CropState = {
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  rotation: 0,
  aspectRatio: 2,
}

function createProjectWithGrid(
  width: number,
  height: number,
  changes: readonly GridCellChange[] = [],
): Project {
  const grid = setCells(createGrid(width, height), changes).grid
  return { ...createProject({ source, crop }), grid }
}

describe('ProjectStats', () => {
  it('returns zero usage for an all-EMPTY Grid', () => {
    const project = createProjectWithGrid(2, 2)
    const stats = deriveProjectStats(project)

    expect(stats.usageByPaletteIndex).toBeInstanceOf(Uint32Array)
    expect(stats.usageByPaletteIndex).toHaveLength(MAX_PALETTE_INDEX + 1)
    expect([...stats.usageByPaletteIndex].every((count) => count === 0)).toBe(true)
    expect(stats.totalBeads).toBe(0)
    expect(stats.usedColorCount).toBe(0)
    expect(stats.usedPaletteIndices).toEqual([])
  })

  it('counts every non-EMPTY cell, including a single legal color', () => {
    const project = createProjectWithGrid(2, 2, [
      { row: 0, column: 0, value: 1 },
      { row: 0, column: 1, value: 1 },
      { row: 1, column: 0, value: 1 },
      { row: 1, column: 1, value: 1 },
    ])
    const stats = deriveProjectStats(project)

    expect(stats.usageByPaletteIndex[EMPTY]).toBe(0)
    expect(stats.usageByPaletteIndex[1]).toBe(4)
    expect(stats.totalBeads).toBe(4)
    expect(stats.usedColorCount).toBe(1)
    expect(stats.usedPaletteIndices).toEqual([1])
  })

  it('counts mixed Palette indices and skips EMPTY', () => {
    const project = createProjectWithGrid(2, 2, [
      { row: 0, column: 0, value: 1 },
      { row: 0, column: 1, value: 17 },
      { row: 1, column: 0, value: 17 },
    ])
    const stats = deriveProjectStats(project)

    expect(stats.usageByPaletteIndex[EMPTY]).toBe(0)
    expect(stats.usageByPaletteIndex[1]).toBe(1)
    expect(stats.usageByPaletteIndex[17]).toBe(2)
    expect(stats.totalBeads).toBe(3)
    expect(stats.usedColorCount).toBe(2)
    expect(stats.usedPaletteIndices).toEqual([1, 17])
  })

  it('supports the highest legal Palette index', () => {
    const project = createProjectWithGrid(1, 1, [{ row: 0, column: 0, value: MAX_PALETTE_INDEX }])
    const stats = deriveProjectStats(project)

    expect(stats.usageByPaletteIndex[MAX_PALETTE_INDEX]).toBe(1)
    expect(stats.usedPaletteIndices).toEqual([MAX_PALETTE_INDEX])
  })

  it('calculates the finished size from Grid dimensions and the 2.6mm specification', () => {
    const project = createProjectWithGrid(4, 3)
    const stats = deriveProjectStats(project)

    expect(stats.productWidthMm).toBeCloseTo(10.4)
    expect(stats.productHeightMm).toBeCloseTo(7.8)
  })

  it('derives updated counts after an immutable Grid operation', () => {
    const project = createProjectWithGrid(2, 2)
    const before = deriveProjectStats(project)
    const operation = applyGridOperation(project, {
      type: 'setCell',
      row: 1,
      column: 1,
      value: 17,
    })
    const after = deriveProjectStats(operation.project)

    expect(before.totalBeads).toBe(0)
    expect(after.totalBeads).toBe(1)
    expect(after.usageByPaletteIndex[17]).toBe(1)
    expect(after.usedColorCount).toBe(1)
  })

  it('does not mutate Project, Grid, cells, revision, or timestamps', () => {
    const project = createProjectWithGrid(2, 2, [{ row: 0, column: 0, value: 1 }])
    const cellsBefore = project.grid!.cells.slice()
    const revisionBefore = project.revision
    const updatedAtBefore = project.updatedAt

    deriveProjectStats(project)

    expect(project.grid!.cells).toEqual(cellsBefore)
    expect(project.revision).toBe(revisionBefore)
    expect(project.updatedAt).toBe(updatedAtBefore)
  })

  it('rejects Projects without a Grid', () => {
    const project = createProject({ source, crop })

    expect(() => deriveProjectStats(project)).toThrow(RangeError)
    expect(project.revision).toBe(0)
  })

  it('rejects an invalid cell encoding instead of producing inconsistent statistics', () => {
    const project = createProjectWithGrid(1, 1)
    const invalidProject: Project = {
      ...project,
      grid: {
        ...project.grid!,
        cells: new Uint16Array([MAX_PALETTE_INDEX + 1]),
      },
    }

    expect(() => deriveProjectStats(invalidProject)).toThrow(RangeError)
    expect(invalidProject.revision).toBe(0)
  })
})
