import { describe, expect, it } from 'vitest'
import { MARD_291_PALETTE_VERSION } from '../../src/domain/palette/version'
import { createGrid, createProject, deriveProjectStats } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { createExportSnapshot } from '../../src/features/export/snapshot'

const source: Source = {
  originalImage: new Blob(['task077-unit'], { type: 'image/png' }),
  originalFileName: 'my<beads>.png',
  mimeType: 'image/png',
  originalWidth: 40,
  originalHeight: 30,
}

function projectWithGrid(values: readonly number[]): Project {
  const project = createProject({
    source: { ...source },
    projectName: 'my<beads>',
    crop: { x: 0, y: 0, width: 40, height: 30, rotation: 0, aspectRatio: 4 / 3 },
  })
  const grid = createGrid(values.length, 1)
  grid.cells.set(values)
  return { ...project, grid, revision: 3 }
}

describe('TASK-077 ExportSnapshot', () => {
  it('captures Project metadata, copied Uint16Array Grid, exact Palette version, stats and filename', () => {
    const project = projectWithGrid([0, 1, 1, 2])
    const snapshot = createExportSnapshot(project, { colorMode: 'color', includeDimensions: true })

    expect(snapshot.project).toMatchObject({
      projectId: project.projectId,
      projectName: 'my<beads>',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      revision: 3,
      crop: project.crop,
      generation: project.generation,
    })
    expect(snapshot.grid.cells).toBeInstanceOf(Uint16Array)
    expect(snapshot.grid).not.toBe(project.grid)
    expect(snapshot.grid.cells).not.toBe(project.grid!.cells)
    expect(snapshot.grid.cells).toEqual(new Uint16Array([0, 1, 1, 2]))
    expect(snapshot.palette.paletteVersion).toBe(MARD_291_PALETTE_VERSION)
    expect(snapshot.stats).toEqual(deriveProjectStats({ ...project, grid: snapshot.grid }))
    expect(snapshot.stats.totalBeads).toBe(3)
    expect(snapshot.fileNameBase).toBe('mybeads_4x1')
    expect(snapshot.exportOptions).toEqual({ colorMode: 'color', includeDimensions: true })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.project)).toBe(true)
    expect(Object.isFrozen(snapshot.exportOptions)).toBe(true)
  })

  it('remains isolated from subsequent source Project edits and consumer mutations', () => {
    const project = projectWithGrid([1, 0, 2])
    const snapshot = createExportSnapshot(project)
    const options: { format: string } = { format: 'png' }

    project.grid!.cells.fill(9)
    project.projectName = 'changed later'
    expect(snapshot.project.projectName).toBe('my<beads>')
    expect(Array.from(snapshot.grid.cells)).toEqual([1, 0, 2])
    expect(snapshot.stats.totalBeads).toBe(2)

    const consumerGrid = snapshot.grid
    consumerGrid.cells.fill(8)
    const consumerStats = snapshot.stats
    consumerStats.usageByPaletteIndex.fill(0)
    consumerStats.usedPaletteIndices.length = 0
    expect(Array.from(snapshot.grid.cells)).toEqual([1, 0, 2])
    expect(snapshot.stats.usedPaletteIndices).toEqual([1, 2])

    const optionsSnapshot = createExportSnapshot(projectWithGrid([1]), options)
    options.format = 'pdf'
    expect(optionsSnapshot.exportOptions).toEqual({ format: 'png' })
  })

  it('rejects missing, malformed or invalid Grid snapshots and non-primitive options', () => {
    const withoutGrid = { ...projectWithGrid([1]), grid: null }
    expect(() => createExportSnapshot(withoutGrid)).toThrow(RangeError)

    const malformed = projectWithGrid([1])
    malformed.grid = { ...malformed.grid!, width: 2 }
    expect(() => createExportSnapshot(malformed)).toThrow(RangeError)

    const invalidCells = projectWithGrid([1])
    invalidCells.grid!.cells[0] = 292
    expect(() => createExportSnapshot(invalidCells)).toThrow(RangeError)

    expect(() =>
      createExportSnapshot(projectWithGrid([1]), { nested: { value: true } } as never),
    ).toThrow(TypeError)
  })
})
