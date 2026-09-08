import { describe, expect, it } from 'vitest'
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  applyGridOperation,
  cloneProjectSnapshot,
  createGrid,
  createProject,
  restoreProjectSnapshot,
  serializeProjectSnapshot,
  setCells,
} from '../../src/domain/project'
import type { CropState, Project, Source } from '../../src/domain/project'

const source: Source = {
  originalImage: new Blob(['image'], { type: 'image/png' }),
  originalFileName: 'snapshot-fixture.png',
  mimeType: 'image/png',
  originalWidth: 300,
  originalHeight: 200,
}

const crop: CropState = {
  x: 10,
  y: 20,
  width: 280,
  height: 180,
  rotation: 90,
  aspectRatio: 14 / 9,
}

function createProjectWithGrid(): Project {
  const grid = setCells(createGrid(2, 2), [
    { row: 0, column: 0, value: 1 },
    { row: 1, column: 1, value: 17 },
  ]).grid

  return {
    ...createProject({
      source,
      crop,
      projectName: '快照作品',
      widthBeads: 64,
      mode: 'high-fidelity',
      paletteVersion: 'MARD-291-v1',
      algorithmVersion: 'v1-baseline',
      now: new Date('2026-09-08T00:00:00.000Z'),
    }),
    grid,
    revision: 3,
  }
}

describe('Project snapshots', () => {
  it('round-trips Project fields and Grid cells', () => {
    const project = createProjectWithGrid()
    const snapshot = serializeProjectSnapshot(project)
    const restored = restoreProjectSnapshot(snapshot)

    expect(restored).toMatchObject({
      schemaVersion: project.schemaVersion,
      projectVersion: project.projectVersion,
      projectId: project.projectId,
      projectName: project.projectName,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      crop: project.crop,
      generation: project.generation,
      revision: project.revision,
    })
    expect(restored.source).toEqual(project.source)
    expect(restored.grid?.width).toBe(project.grid?.width)
    expect(restored.grid?.height).toBe(project.grid?.height)
    expect(restored.grid?.cells).toEqual(project.grid?.cells)
    expect(restored.grid?.cells).toBeInstanceOf(Uint16Array)
  })

  it('detaches Grid cell storage when serializing and restoring', () => {
    const project = createProjectWithGrid()
    const snapshot = serializeProjectSnapshot(project)
    const restored = restoreProjectSnapshot(snapshot)

    expect(snapshot.grid?.cells).not.toBe(project.grid?.cells)
    expect(restored.grid?.cells).not.toBe(snapshot.grid?.cells)

    const changed = applyGridOperation(restored, {
      type: 'setCell',
      row: 0,
      column: 0,
      value: 29,
    })

    expect(changed.project.grid?.cells[0]).toBe(29)
    expect(snapshot.grid?.cells[0]).toBe(1)
    expect(project.grid?.cells[0]).toBe(1)
  })

  it('clones history snapshots without sharing TypedArray storage', () => {
    const snapshot = serializeProjectSnapshot(createProjectWithGrid())
    const clone = cloneProjectSnapshot(snapshot)

    expect(clone).not.toBe(snapshot)
    expect(clone.grid?.cells).not.toBe(snapshot.grid?.cells)
    clone.grid!.cells[0] = 42
    expect(snapshot.grid?.cells[0]).toBe(1)
  })

  it('restores a Project with no Grid', () => {
    const project = createProject({ source, crop })
    const restored = restoreProjectSnapshot(serializeProjectSnapshot(project))

    expect(restored.grid).toBeNull()
    expect(restored.revision).toBe(project.revision)
  })

  it('rejects an incompatible schema version', () => {
    const snapshot = serializeProjectSnapshot(createProjectWithGrid())
    const invalid = { ...snapshot, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1 }

    expect(() => restoreProjectSnapshot(invalid)).toThrow(/schemaVersion/)
  })

  it('rejects an invalid Grid shape or cell encoding', () => {
    const snapshot = serializeProjectSnapshot(createProjectWithGrid())

    expect(() =>
      restoreProjectSnapshot({
        ...snapshot,
        grid: { ...snapshot.grid!, cells: new Uint16Array([1]) },
      }),
    ).toThrow(/cells length/)

    expect(() =>
      restoreProjectSnapshot({
        ...snapshot,
        grid: { ...snapshot.grid!, cells: new Uint16Array([292, 0, 0, 0]) },
      }),
    ).toThrow(RangeError)
  })

  it('rejects malformed required Project fields', () => {
    const snapshot = serializeProjectSnapshot(createProjectWithGrid())

    expect(() => restoreProjectSnapshot({ ...snapshot, projectName: 123 } as never)).toThrow(
      /projectName/,
    )
    expect(() =>
      restoreProjectSnapshot({
        ...snapshot,
        generation: { ...snapshot.generation, beadSizeMm: 5 },
      }),
    ).toThrow(/beadSizeMm/)
  })
})
