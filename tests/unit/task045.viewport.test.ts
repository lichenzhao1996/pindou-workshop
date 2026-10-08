import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createProject } from '../../src/domain/project'
import { createGrid } from '../../src/domain/project/grid'
import {
  CELL_SIZE,
  centerViewport,
  clampZoom,
  fitViewport,
  getCanvasBackingSize,
  getVisibleGridRange,
  screenToWorld,
  worldToScreen,
  zoomViewportAt,
  type Viewport,
} from '../../src/rendering/viewport'

describe('TASK-045 viewport math', () => {
  it('round-trips CSS screen and world coordinates with the documented transform', () => {
    const viewport: Viewport = { zoom: 2, panX: -31, panY: 17 }
    const world = { x: 42, y: 96 }
    const screen = worldToScreen(world, viewport)

    expect(screen).toEqual({ x: 53, y: 209 })
    expect(screenToWorld(screen, viewport)).toEqual(world)
  })

  it('keeps the anchor fixed while zooming and clamps to 10% through 800%', () => {
    const viewport: Viewport = { zoom: 1, panX: -60, panY: -24 }
    const anchor = { x: 220, y: 180 }
    const before = screenToWorld(anchor, viewport)
    const zoomed = zoomViewportAt(viewport, 2, anchor)

    expect(worldToScreen(before, zoomed)).toEqual(anchor)
    expect(clampZoom(0.01)).toBe(0.1)
    expect(clampZoom(99)).toBe(8)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it('centers and fits the full Grid including the coordinate axis margin', () => {
    const grid = { width: 20, height: 10 }
    const size = { width: 800, height: 600 }
    const centered = centerViewport(grid, size, 1)
    const fitted = fitViewport(grid, size)

    expect(centered).toEqual({ zoom: 1, panX: 148, panY: 168 })
    expect(fitted.zoom).toBeGreaterThan(0.1)
    expect(fitted.zoom).toBeLessThanOrEqual(8)
    expect(fitted.panX + ((grid.width * CELL_SIZE + CELL_SIZE) * fitted.zoom) / 2).toBe(400)
    expect(fitted.panY + ((grid.height * CELL_SIZE + CELL_SIZE) * fitted.zoom) / 2).toBe(300)
    expect(fitViewport({ width: 1, height: 1 }, { width: 0, height: 0 }).zoom).toBe(0.1)
  })

  it('limits drawing to the visible Grid range', () => {
    expect(
      getVisibleGridRange(
        { width: 100, height: 80 },
        { width: 120, height: 72 },
        { zoom: 1, panX: -24, panY: -24 },
      ),
    ).toEqual({ startRow: 0, endRow: 3, startColumn: 0, endColumn: 5 })
  })

  it('creates a DPR-aware backing store and caps oversized canvases', () => {
    expect(getCanvasBackingSize({ width: 320, height: 180 }, 2)).toEqual({
      width: 640,
      height: 360,
      dpr: 2,
    })
    const capped = getCanvasBackingSize({ width: 12_000, height: 9000 }, 3)
    expect(capped.width).toBeLessThanOrEqual(8192)
    expect(capped.height).toBeLessThanOrEqual(8192)
    expect(capped.width * capped.height).toBeLessThanOrEqual(16_000_000)
  })
})

describe('TASK-045 editorStore viewport state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts at 100%, clamps zoom, pans in CSS pixels, and leaves Project/Grid untouched', () => {
    const store = useEditorStore()
    const projectStore = useProjectStore()
    const project = createProject({
      source: {
        originalImage: new Blob(['image'], { type: 'image/png' }),
        originalFileName: 'viewport.png',
        mimeType: 'image/png',
        originalWidth: 100,
        originalHeight: 100,
      },
      crop: { x: 0, y: 0, width: 100, height: 100, rotation: 0, aspectRatio: 1 },
    })
    const grid = createGrid(4, 3)
    grid.cells.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    project.grid = grid
    project.revision = 7
    projectStore.setCurrentProject(project)

    expect(store.zoom).toBe(1)
    expect(store.panX).toBe(0)
    expect(store.panY).toBe(0)
    store.setZoom(30)
    expect(store.zoom).toBe(8)
    store.panBy(13, -9)
    expect(store.panX).toBe(13)
    expect(store.panY).toBe(-9)
    store.resetZoom({ x: 50, y: 60 })
    expect(store.zoom).toBe(1)
    store.centerGrid(grid, { width: 400, height: 300 })
    const centered = { ...store.viewport }
    store.fitGrid(grid, { width: 400, height: 300 })
    expect(store.zoom).toBeGreaterThan(1)
    expect(store.zoom).toBeLessThanOrEqual(8)
    store.setViewport(centered)
    expect(store.viewport).toEqual(centered)
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.grid).toBe(grid)
    expect(projectStore.currentProject?.revision).toBe(7)
  })
})
