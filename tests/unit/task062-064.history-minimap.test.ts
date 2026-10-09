import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import {
  createGrid,
  createProject,
  deriveProjectStats,
  updateProjectGenerationMode,
} from '../../src/domain/project'
import { createGrid as makeGrid } from '../../src/domain/project/grid'
import type { Project, Source } from '../../src/domain/project'
import {
  centerViewportAtMiniMapPoint,
  deriveMiniMapGeometry,
  miniMapPointToWorld,
  panViewportByMiniMapDelta,
} from '../../src/rendering/minimap'
import { CELL_SIZE } from '../../src/rendering/cell-size'
import { GRID_AXIS_MARGIN, type Viewport } from '../../src/rendering/viewport'

const source: Source = {
  originalImage: new Blob(['task062-064'], { type: 'image/png' }),
  originalFileName: 'task062-064.png',
  mimeType: 'image/png',
  originalWidth: 120,
  originalHeight: 80,
}

function projectWithGrid(width = 4, height = 3): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 120, height: 80, rotation: 0, aspectRatio: 1.5 },
  })
  return { ...project, grid: createGrid(width, height) }
}

describe('TASK-062/063 Project Grid history', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('records only changed edits and restores detached Grid snapshots, revision and current metadata', () => {
    const editor = useEditorStore()
    const store = useProjectStore()
    const initial = projectWithGrid()
    store.setCurrentProject(initial)
    const beforeCells = initial.grid!.cells.slice()
    const changedAt = new Date('2026-10-01T10:00:00.000Z')

    expect(
      store.applyGridOperation(
        { type: 'setCells', changes: [{ row: 0, column: 0, value: 7 }] },
        initial,
        initial.grid!,
        changedAt,
      ),
    ).toBe(true)
    expect(store.past).toHaveLength(1)
    expect(store.past[0]!.beforeProject.grid.cells).not.toBe(initial.grid!.cells)
    expect(store.past[0]!.afterProject.grid.cells).not.toBe(store.currentProject!.grid!.cells)
    expect(store.canUndo).toBe(true)

    const edited = store.currentProject!
    store.setCurrentProject({ ...edited, projectName: '撤销期间保留的新名称' })
    const undoAt = new Date('2026-10-02T10:00:00.000Z')
    expect(store.undo(undoAt)).toBe(true)
    expect(store.currentProject).toMatchObject({
      projectId: initial.projectId,
      projectName: '撤销期间保留的新名称',
      revision: initial.revision,
      updatedAt: undoAt.toISOString(),
    })
    expect(store.currentProject!.grid!.cells).toEqual(beforeCells)
    expect(store.currentProject!.grid!.cells).not.toBe(initial.grid!.cells)
    expect(editor.historyRestoreVersion).toBe(1)
    expect(deriveProjectStats(store.currentProject!).totalBeads).toBe(0)
    expect(store.canRedo).toBe(true)

    const redoAt = new Date('2026-10-03T10:00:00.000Z')
    expect(store.redo(redoAt)).toBe(true)
    expect(store.currentProject!.grid!.cells[0]).toBe(7)
    expect(store.currentProject!.revision).toBe(initial.revision + 1)
    expect(store.currentProject!.updatedAt).toBe(redoAt.toISOString())
    expect(store.currentProject!.projectName).toBe('撤销期间保留的新名称')
    expect(editor.historyRestoreVersion).toBe(2)
    expect(store.canUndo).toBe(true)
    expect(store.canRedo).toBe(false)
  })

  it('keeps no-op operations out of history and clears Redo only after a changed branch edit', () => {
    const store = useProjectStore()
    const project = projectWithGrid()
    store.setCurrentProject(project)
    store.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 3 },
      project,
      project.grid!,
    )
    const edited = store.currentProject!
    expect(store.undo()).toBe(true)
    const undone = store.currentProject!

    expect(
      store.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: 0 },
        undone!,
        undone!.grid!,
      ),
    ).toBe(false)
    expect(store.canRedo).toBe(true)
    expect(store.future).toHaveLength(1)

    store.applyGridOperation(
      { type: 'setCell', row: 0, column: 1, value: 4 },
      undone!,
      undone!.grid!,
    )
    expect(store.canRedo).toBe(false)
    expect(store.future).toHaveLength(0)
    expect(store.currentProject!.grid!.cells[1]).toBe(4)
    expect(store.currentProject!.revision).toBe(project.revision + 1)
    expect(edited.grid!.cells[0]).toBe(3)
  })

  it('supports multiple undo/redo steps, caps history, and does not cross Project or generation baselines', () => {
    const store = useProjectStore()
    const project = projectWithGrid(2, 2)
    store.setCurrentProject(project)
    let current = project
    for (let index = 1; index <= 52; index += 1) {
      const expected = current
      store.applyGridOperation(
        { type: 'setCell', row: 0, column: 0, value: index % 2 === 0 ? 2 : 1 },
        expected,
        expected.grid!,
      )
      current = store.currentProject!
    }
    expect(store.past).toHaveLength(50)
    expect(store.undo()).toBe(true)
    expect(store.redo()).toBe(true)

    const secondProject = projectWithGrid()
    store.setCurrentProject(secondProject)
    expect(store.canUndo).toBe(false)
    expect(store.undo()).toBe(false)

    store.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 8 },
      secondProject,
      secondProject.grid!,
    )
    const generatingProject = updateProjectGenerationMode(store.currentProject!, 'high-fidelity')
    store.setCurrentProject(generatingProject)
    expect(store.canUndo).toBe(false)
    expect(store.currentProject!.grid).toBeNull()
  })

  it('preserves history after failed/cancelled generation and clears it after a success', () => {
    const store = useProjectStore()
    const project = projectWithGrid(2, 2)
    store.setCurrentProject(project)
    store.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 1 },
      project,
      project.grid!,
    )
    const afterEdit = store.currentProject!

    const failedRequest = store.beginGeneration()
    expect(store.failGeneration(failedRequest, new Error('fixture failure'))).toBe(true)
    expect(store.canUndo).toBe(true)

    const cancelledRequest = store.beginGeneration()
    expect(store.cancelGeneration(cancelledRequest)).toBe(true)
    expect(store.canUndo).toBe(true)

    const requestId = store.beginGeneration()
    const request = store.pendingGenerationRequest!
    expect(
      store.commitGenerationResult(requestId, {
        grid: makeGrid(request.widthBeads, request.heightBeads),
        heightBeads: request.heightBeads,
        paletteVersion: request.paletteVersion,
        algorithmVersion: request.algorithmVersion,
        diagnostics: {
          sourceSize: { width: 120, height: 80 },
          cropSize: { width: 120, height: 80 },
          elapsedMs: 0,
        },
      }),
    ).toBe(true)
    expect(store.canUndo).toBe(false)
    expect(store.past).toHaveLength(0)
    expect(store.currentProject!.revision).toBe(0)
    expect(store.currentProject!.grid).not.toBe(afterEdit.grid)
  })
})

describe('TASK-064 MiniMap geometry', () => {
  it('fits non-square artwork into CSS bounds and maps valid points to Grid world coordinates', () => {
    const grid = makeGrid(20, 10)
    const geometry = deriveMiniMapGeometry(
      grid,
      { width: 200, height: 140 },
      { width: 100, height: 80 },
      { zoom: 1, panX: 0, panY: 0 },
    )!
    expect(geometry.scale).toBeCloseTo(200 / (20 * CELL_SIZE))
    expect(geometry.artwork.height).toBeCloseTo(100)
    expect(geometry.artwork.top).toBeCloseTo(20)
    expect(
      miniMapPointToWorld({ x: geometry.artwork.left, y: geometry.artwork.top }, geometry),
    ).toEqual({
      x: GRID_AXIS_MARGIN,
      y: GRID_AXIS_MARGIN,
    })
    expect(
      miniMapPointToWorld(
        { x: geometry.artwork.left + geometry.artwork.width, y: geometry.artwork.top + 1 },
        geometry,
      ),
    ).toBeNull()
  })

  it('synchronizes viewport frames, click centering and CSS-pixel frame dragging', () => {
    const grid = makeGrid(100, 50)
    const canvasSize = { width: 240, height: 160 }
    const viewport: Viewport = { zoom: 2, panX: -700, panY: -320 }
    const geometry = deriveMiniMapGeometry(grid, { width: 196, height: 136 }, canvasSize, viewport)!
    expect(geometry.frame).not.toBeNull()
    const clickPoint = {
      x: geometry.artwork.left + geometry.artwork.width * 0.7,
      y: geometry.artwork.top + geometry.artwork.height * 0.6,
    }
    const jumped = centerViewportAtMiniMapPoint(clickPoint, geometry, canvasSize, viewport)!
    const mappedWorld = miniMapPointToWorld(clickPoint, geometry)!
    expect(jumped.zoom).toBe(viewport.zoom)
    expect(jumped.panX + mappedWorld.x * viewport.zoom).toBeCloseTo(canvasSize.width / 2)
    expect(jumped.panY + mappedWorld.y * viewport.zoom).toBeCloseTo(canvasSize.height / 2)

    const moved = panViewportByMiniMapDelta(viewport, geometry, { x: 5, y: -4 })
    expect(moved.zoom).toBe(viewport.zoom)
    expect(moved.panX).toBeCloseTo(viewport.panX - (5 / geometry.scale) * viewport.zoom)
    expect(moved.panY).toBeCloseTo(viewport.panY - (-4 / geometry.scale) * viewport.zoom)
  })

  it('handles extreme zoom, full-frame/off-art views, and invalid sizes safely', () => {
    const grid = makeGrid(1, 500)
    const fit = deriveMiniMapGeometry(
      grid,
      { width: 196, height: 136 },
      { width: 800, height: 600 },
      { zoom: 8, panX: -10_000, panY: -10_000 },
    )!
    expect(fit.scale).toBeGreaterThan(0)
    expect(fit.artwork.width).toBeLessThanOrEqual(196)
    expect(fit.artwork.height).toBeLessThanOrEqual(136)
    expect(fit.frame).toBeNull()
    expect(
      deriveMiniMapGeometry(
        grid,
        { width: 0, height: 0 },
        { width: 10, height: 10 },
        {
          zoom: 1,
          panX: 0,
          panY: 0,
        },
      ),
    ).toBeNull()
  })
})
