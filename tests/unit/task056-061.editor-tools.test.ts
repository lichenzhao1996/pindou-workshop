import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { getFourConnectedRegion, createGrid, createProject } from '../../src/domain/project'
import { getGridStrokeSegment } from '../../src/rendering/grid-stroke'

function projectWithGrid(width = 3, height = 3) {
  const project = createProject({
    source: {
      originalImage: new Blob(['image'], { type: 'image/png' }),
      originalFileName: 'task056-tools.png',
      mimeType: 'image/png',
      originalWidth: 30,
      originalHeight: 30,
    },
    crop: { x: 0, y: 0, width: 30, height: 30, rotation: 0, aspectRatio: 1 },
  })
  return { ...project, grid: createGrid(width, height) }
}

describe('TASK-056–061 editor tools and pure geometry', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to select and active-color fill, and keeps runtime tool state across Project changes', () => {
    const editor = useEditorStore()
    const projects = useProjectStore()
    expect(editor.activeTool).toBe('select')
    expect(editor.fillTargetMode).toBe('active-color')

    editor.setActiveTool('brush')
    editor.setFillTargetMode('empty')
    editor.selectPaletteIndex(12)
    projects.setCurrentProject(projectWithGrid())
    projects.setCurrentProject(projectWithGrid())

    expect(editor.activeTool).toBe('brush')
    expect(editor.fillTargetMode).toBe('empty')
    expect(editor.activePaletteIndex).toBe(12)
    expect(editor.recentPaletteIndexes).toEqual([12])
  })

  it('rasterizes inclusive Bresenham segments deterministically in all directions', () => {
    expect(getGridStrokeSegment({ row: 0, column: 0 }, { row: 2, column: 4 })).toEqual([
      { row: 0, column: 0 },
      { row: 1, column: 1 },
      { row: 1, column: 2 },
      { row: 2, column: 3 },
      { row: 2, column: 4 },
    ])
    expect(getGridStrokeSegment({ row: 2, column: 4 }, { row: 0, column: 0 })).toEqual([
      { row: 2, column: 4 },
      { row: 1, column: 3 },
      { row: 1, column: 2 },
      { row: 0, column: 1 },
      { row: 0, column: 0 },
    ])
    expect(getGridStrokeSegment({ row: 1, column: 1 }, { row: 1, column: 1 })).toEqual([
      { row: 1, column: 1 },
    ])
  })

  it('returns a sorted four-connected region without joining diagonal cells', () => {
    const grid = createGrid(3, 3)
    grid.cells.set([1, 1, 2, 1, 2, 2, 2, 2, 1])

    expect(getFourConnectedRegion(grid, 0, 0)).toEqual([0, 1, 3])
    expect(getFourConnectedRegion(grid, 1, 1)).toEqual([2, 4, 5, 6, 7])
    expect(getFourConnectedRegion(grid, -1, 0)).toEqual([])
  })

  it('fills large regions iteratively and does not mutate the source Grid', () => {
    const grid = createGrid(250, 250)
    const before = grid.cells.slice()
    const region = getFourConnectedRegion(grid, 0, 0)
    expect(region).toHaveLength(62_500)
    expect(region[0]).toBe(0)
    expect(region.at(-1)).toBe(62_499)
    expect(grid.cells).toEqual(before)
  })

  it('commits one operation once, preserves no-ops, and rejects stale Project or Grid identity', () => {
    const store = useProjectStore()
    const project = projectWithGrid()
    const grid = project.grid!
    store.setCurrentProject(project)
    const committedAt = new Date('2026-10-09T00:00:00.000Z')

    expect(
      store.applyGridOperation(
        {
          type: 'setCells',
          changes: [
            { row: 0, column: 0, value: 1 },
            { row: 0, column: 1, value: 2 },
          ],
        },
        project,
        grid,
        committedAt,
      ),
    ).toBe(true)
    expect(store.currentProject?.revision).toBe(project.revision + 1)
    expect(store.currentProject?.updatedAt).toBe(committedAt.toISOString())
    expect(Array.from(store.currentProject!.grid!.cells.slice(0, 2))).toEqual([1, 2])

    const changedProject = store.currentProject!
    const changedGrid = changedProject.grid!
    expect(
      store.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: 1 },
        changedProject,
        changedGrid,
      ),
    ).toBe(false)
    expect(store.currentProject).toBe(changedProject)

    const replacement = { ...changedProject, grid: createGrid(3, 3) }
    store.setCurrentProject(replacement)
    expect(
      store.applyGridOperation(
        { type: 'setCell', row: 1, column: 1, value: 3 },
        changedProject,
        changedGrid,
      ),
    ).toBe(false)
    expect(store.currentProject).toBe(replacement)
  })
})
