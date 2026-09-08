import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  applyGridOperation,
  cloneProjectSnapshot,
  createGrid,
  createProject,
  deriveProjectStats,
  restoreProjectSnapshot,
  serializeProjectSnapshot,
} from '../../src/domain/project'
import type { CropState, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'task010-012-flow.png',
  mimeType: 'image/png',
  originalWidth: 400,
  originalHeight: 300,
}

const crop: CropState = {
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  rotation: 0,
  aspectRatio: 4 / 3,
}

function createProjectWithGrid(): Project {
  return { ...createProject({ source, crop }), grid: createGrid(2, 2) }
}

describe('TASK-010 to TASK-012 project flow', () => {
  it('keeps Grid, revision, stats, and snapshots consistent across edits', () => {
    const project = createProjectWithGrid()
    const edited = applyGridOperation(
      project,
      {
        type: 'setCells',
        changes: [
          { row: 0, column: 0, value: 1 },
          { row: 0, column: 1, value: 17 },
          { row: 1, column: 0, value: EMPTY },
        ],
      },
      new Date('2026-09-08T00:00:00.000Z'),
    )

    expect(edited.changed).toBe(true)
    expect(edited.project.revision).toBe(1)
    expect(edited.project.schemaVersion).toBe(project.schemaVersion)
    expect(edited.project.projectVersion).toBe(project.projectVersion)

    const stats = deriveProjectStats(edited.project)
    expect(stats.totalBeads).toBe(2)
    expect(stats.usedColorCount).toBe(2)
    expect(stats.usageByPaletteIndex[EMPTY]).toBe(0)
    expect(stats.usageByPaletteIndex[1]).toBe(1)
    expect(stats.usageByPaletteIndex[17]).toBe(1)
    expect(stats.usedPaletteIndices).toEqual([1, 17])
    expect(edited.project.revision).toBe(1)

    const snapshot = serializeProjectSnapshot(edited.project)
    const historySnapshot = cloneProjectSnapshot(snapshot)
    const restored = restoreProjectSnapshot(snapshot)
    const restoredStats = deriveProjectStats(restored)

    expect(snapshot.revision).toBe(1)
    expect(historySnapshot.revision).toBe(1)
    expect(restored.revision).toBe(1)
    expect(restored.grid?.cells).toEqual(edited.project.grid?.cells)
    expect(restoredStats.totalBeads).toBe(stats.totalBeads)
    expect(restoredStats.usedColorCount).toBe(stats.usedColorCount)
    expect(restoredStats.usageByPaletteIndex).toEqual(stats.usageByPaletteIndex)
    expect(restoredStats.usedPaletteIndices).toEqual(stats.usedPaletteIndices)

    const restoredEdit = applyGridOperation(restored, {
      type: 'setCell',
      row: 0,
      column: 0,
      value: EMPTY,
    })
    const restoredEditStats = deriveProjectStats(restoredEdit.project)

    expect(restoredEdit.project.revision).toBe(2)
    expect(restoredEditStats.totalBeads).toBe(1)
    expect(restoredEditStats.usedColorCount).toBe(1)
    expect(restoredEditStats.usageByPaletteIndex[1]).toBe(0)
    expect(restoredEditStats.usageByPaletteIndex[17]).toBe(1)
    expect(restoredEditStats.usedPaletteIndices).toEqual([17])
    expect(snapshot.grid?.cells[0]).toBe(1)
    expect(historySnapshot.grid?.cells[0]).toBe(1)
    expect(edited.project.grid?.cells[0]).toBe(1)

    const noChange = applyGridOperation(restored, {
      type: 'setCell',
      row: 1,
      column: 0,
      value: EMPTY,
    })
    expect(noChange.changed).toBe(false)
    expect(noChange.project).toBe(restored)
    expect(noChange.project.revision).toBe(1)
  })
})
