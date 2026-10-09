import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject } from '../../src/domain/project'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import EditorSidebar from '../../src/features/editor/components/EditorSidebar.vue'
import EditorToolbar from '../../src/features/editor/components/EditorToolbar.vue'
import { hitTestGridCell } from '../../src/rendering/hit-test'
import { CELL_SIZE, GRID_AXIS_MARGIN, worldToScreen } from '../../src/rendering/viewport'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
  pointerEvent,
} from './canvas-test-helpers'

function makeProject(values: number[] = Array(12).fill(0)) {
  const project = createProject({
    source: {
      originalImage: new Blob(['tools'], { type: 'image/png' }),
      originalFileName: 'task056-061.png',
      mimeType: 'image/png',
      originalWidth: 120,
      originalHeight: 80,
    },
    crop: { x: 0, y: 0, width: 120, height: 80, rotation: 0, aspectRatio: 1.5 },
  })
  const grid = createGrid(4, 3)
  grid.cells.set(values)
  return { ...project, grid }
}

async function mountCanvas(project: ReturnType<typeof makeProject>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  installCanvasContext(createCanvasContextMock())
  installCanvasLayout(480, 320)
  installResizeObserver()
  installAnimationFrames()
  const projectStore = useProjectStore(pinia)
  projectStore.setCurrentProject(project)
  const wrapper = mount(EditorCanvasArea, {
    props: { project, projectId: project.projectId, grid: project.grid },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  const editor = useEditorStore(pinia)
  editor.setViewport({ zoom: 1, panX: 0, panY: 0 })
  return { wrapper, pinia, editor, projectStore }
}

function pointAt(row: number, column: number) {
  const screen = worldToScreen(
    {
      x: GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
      y: GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
    },
    { zoom: 1, panX: 0, panY: 0 },
  )
  return screen
}

function dispatch(
  wrapper: VueWrapper,
  type: string,
  row: number,
  column: number,
  pointerId = 1,
  button = 0,
) {
  const point = pointAt(row, column)
  wrapper
    .get('[data-testid="editor-canvas-area"]')
    .element.dispatchEvent(
      pointerEvent(type, { pointerId, button, clientX: point.x, clientY: point.y }),
    )
}

async function syncProjectProps(
  wrapper: VueWrapper,
  projectStore: ReturnType<typeof useProjectStore>,
) {
  const project = projectStore.currentProject
  await wrapper.setProps({
    project,
    grid: project?.grid ?? null,
    projectId: project?.projectId ?? null,
  })
  await flushPromises()
}

describe('TASK-056–061 editor interactions', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('offers all formal tools and a runtime fill-target selector', async () => {
    const pinia = createPinia()
    const wrapper = mount(EditorToolbar, {
      props: { grid: createGrid(2, 2), canvasSize: { width: 400, height: 300 } },
      global: { plugins: [pinia] },
    })
    const editor = useEditorStore(pinia)
    for (const tool of ['select', 'brush', 'eraser', 'eyedropper', 'fill'] as const) {
      await wrapper.get(`[data-testid="editor-tool-${tool}"]`).trigger('click')
      expect(editor.activeTool).toBe(tool)
    }
    await wrapper.get('[data-testid="editor-fill-target-mode"]').setValue('empty')
    expect(editor.fillTargetMode).toBe('empty')
    wrapper.unmount()
  })

  it('applies the current color to one selected cell through one Project operation', async () => {
    const pinia = createPinia()
    const project = makeProject()
    const projectStore = useProjectStore(pinia)
    const editor = useEditorStore(pinia)
    projectStore.setCurrentProject(project)
    editor.setSelectedCell({ row: 1, column: 2, index: 6 })
    editor.setActivePaletteIndex(8)
    expect(projectStore.currentProject).toBe(project)
    const wrapper = mount(EditorSidebar, {
      props: { project },
      global: { plugins: [pinia], stubs: { RouterLink: true } },
    })
    expect(
      wrapper.get('[data-testid="apply-current-color"]').element.hasAttribute('disabled'),
    ).toBe(false)

    await wrapper.get('[data-testid="apply-current-color"]').trigger('click')
    const updated = projectStore.currentProject!
    expect(updated.grid!.cells[6]).toBe(8)
    expect(updated.grid!.cells[5]).toBe(0)
    expect(updated.revision).toBe(project.revision + 1)
    expect(editor.selectedCell).toEqual({ row: 1, column: 2, index: 6 })
    expect(editor.activePaletteIndex).toBe(8)
    expect(editor.recentPaletteIndexes).toEqual([])
    wrapper.unmount()
  })

  it('treats a same-color sidebar application as a true no-op', async () => {
    const pinia = createPinia()
    const project = makeProject([0, 0, 5, ...Array(9).fill(0)])
    const projectStore = useProjectStore(pinia)
    const editor = useEditorStore(pinia)
    projectStore.setCurrentProject(project)
    editor.setSelectedCell({ row: 0, column: 2, index: 2 })
    editor.setActivePaletteIndex(5)
    const wrapper = mount(EditorSidebar, {
      props: { project },
      global: { plugins: [pinia], stubs: { RouterLink: true } },
    })

    await wrapper.get('[data-testid="apply-current-color"]').trigger('click')
    expect(projectStore.currentProject).toBe(project)
    expect(projectStore.currentProject?.grid).toBe(project.grid)
    expect(projectStore.currentProject?.revision).toBe(project.revision)
    wrapper.unmount()
  })

  it('disables single-cell application without a valid selection/color or during source compare', async () => {
    const pinia = createPinia()
    const project = makeProject()
    const projectStore = useProjectStore(pinia)
    const editor = useEditorStore(pinia)
    projectStore.setCurrentProject(project)
    const wrapper = mount(EditorSidebar, {
      props: { project },
      global: { plugins: [pinia], stubs: { RouterLink: true } },
    })
    const button = wrapper.get('[data-testid="apply-current-color"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    editor.setSelectedCell({ row: 0, column: 0, index: 0 })
    editor.setActivePaletteIndex(8)
    await flushPromises()
    expect((button.element as HTMLButtonElement).disabled).toBe(false)

    editor.setSelectedCell({ row: 9, column: 0, index: 36 })
    await flushPromises()
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    editor.setSelectedCell({ row: 0, column: 0, index: 0 })
    editor.setActivePaletteIndex(null)
    await flushPromises()
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    editor.setActivePaletteIndex(8)
    editor.setSourceCompareActive(true)
    await flushPromises()
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(projectStore.currentProject).toBe(project)
    wrapper.unmount()
  })

  it('paints a Bresenham-completed stroke once with its pointerdown color frozen', async () => {
    const project = makeProject()
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('brush')
    editor.selectPaletteIndex(9)
    const canvasRect = wrapper.get('[data-testid="editor-canvas"]').element.getBoundingClientRect()
    expect(hitTestGridCell(pointAt(0, 0), canvasRect, editor.viewport, project.grid)).toEqual({
      row: 0,
      column: 0,
      index: 0,
    })
    dispatch(wrapper, 'pointermove', 0, 0)
    await flushPromises()
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-hovered-cell')).toBe(
      '0,0',
    )
    dispatch(wrapper, 'pointerdown', 0, 0)
    editor.setActivePaletteIndex(10)
    dispatch(wrapper, 'pointermove', 0, 3)
    expect(projectStore.currentProject).toBe(project)
    dispatch(wrapper, 'pointerup', 0, 3)

    const updated = projectStore.currentProject!
    expect(Array.from(updated.grid!.cells.slice(0, 4))).toEqual([9, 9, 9, 9])
    expect(updated.revision).toBe(project.revision + 1)
    expect(editor.selectedCell).toBeNull()
    expect(editor.activePaletteIndex).toBe(10)
    expect(editor.recentPaletteIndexes).toEqual([9])
    await syncProjectProps(wrapper, projectStore)
    editor.setActivePaletteIndex(9)
    const beforeSameColor = projectStore.currentProject!
    dispatch(wrapper, 'pointerdown', 0, 0, 2)
    dispatch(wrapper, 'pointerup', 0, 3, 2)
    expect(projectStore.currentProject).toBe(beforeSameColor)
    expect(projectStore.currentProject?.revision).toBe(1)
    wrapper.unmount()
  })

  it('breaks a brush segment outside the Grid and discards pointercancel strokes', async () => {
    const project = makeProject()
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('brush')
    editor.setActivePaletteIndex(4)
    dispatch(wrapper, 'pointerdown', 0, 0)
    const area = wrapper.get('[data-testid="editor-canvas-area"]').element
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, button: 0, clientX: 500, clientY: 25 }),
    )
    dispatch(wrapper, 'pointermove', 0, 3)
    dispatch(wrapper, 'pointerup', 0, 3)
    expect(Array.from(projectStore.currentProject!.grid!.cells.slice(0, 4))).toEqual([4, 0, 0, 4])
    expect(projectStore.currentProject?.revision).toBe(1)
    await syncProjectProps(wrapper, projectStore)

    const beforeCancel = projectStore.currentProject!
    dispatch(wrapper, 'pointerdown', 1, 0, 2)
    dispatch(wrapper, 'pointermove', 1, 2, 2)
    dispatch(wrapper, 'pointercancel', 1, 2, 2)
    expect(projectStore.currentProject).toBe(beforeCancel)
    expect(projectStore.currentProject?.revision).toBe(1)
    wrapper.unmount()
  })

  it('safely ignores a missing or invalid active color for brush gestures', async () => {
    const project = makeProject()
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('brush')
    dispatch(wrapper, 'pointerdown', 0, 0)
    dispatch(wrapper, 'pointerup', 0, 0)
    expect(projectStore.currentProject).toBe(project)

    editor.activePaletteIndex = 1.5
    dispatch(wrapper, 'pointerdown', 0, 1, 2)
    dispatch(wrapper, 'pointerup', 0, 1, 2)
    expect(projectStore.currentProject).toBe(project)
    expect(project.revision).toBe(0)
    wrapper.unmount()
  })

  it('erases to EMPTY without an active color and treats already-empty cells as no-op', async () => {
    const project = makeProject([1, 291, 2, ...Array(9).fill(0)])
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('eraser')
    dispatch(wrapper, 'pointerdown', 0, 0)
    dispatch(wrapper, 'pointermove', 0, 1)
    dispatch(wrapper, 'pointerup', 0, 1)
    expect(Array.from(projectStore.currentProject!.grid!.cells.slice(0, 3))).toEqual([0, 0, 2])
    expect(projectStore.currentProject?.revision).toBe(1)
    await syncProjectProps(wrapper, projectStore)

    const beforeNoOp = projectStore.currentProject!
    dispatch(wrapper, 'pointerdown', 2, 3, 2)
    dispatch(wrapper, 'pointerup', 2, 3, 2)
    expect(projectStore.currentProject).toBe(beforeNoOp)
    expect(projectStore.currentProject?.revision).toBe(1)
    wrapper.unmount()
  })

  it('eyedrops encoded Grid values, records deliberate colors, and ignores EMPTY', async () => {
    const project = makeProject([17, 0, ...Array(10).fill(0)])
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('eyedropper')
    editor.setSelectedCell({ row: 2, column: 3, index: 11 })
    editor.selectPaletteIndex(17)
    editor.selectPaletteIndex(1)
    editor.setActivePaletteIndex(17)
    const before = projectStore.currentProject!

    dispatch(wrapper, 'pointerdown', 0, 0)
    expect(editor.activePaletteIndex).toBe(17)
    expect(editor.recentPaletteIndexes).toEqual([17, 1])
    dispatch(wrapper, 'pointerdown', 0, 1, 2)
    expect(editor.activePaletteIndex).toBe(17)
    expect(editor.recentPaletteIndexes).toEqual([17, 1])
    expect(editor.selectedCell).toEqual({ row: 2, column: 3, index: 11 })
    expect(projectStore.currentProject).toBe(before)
    expect(projectStore.currentProject?.revision).toBe(0)
    wrapper.unmount()
  })

  it('fills the four-connected active-color region and can clear that region to EMPTY', async () => {
    const project = makeProject([1, 1, 2, 2, 1, 2, 2, 0, ...Array(4).fill(0)])
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('fill')
    editor.setActivePaletteIndex(3)
    dispatch(wrapper, 'pointerdown', 0, 0)
    expect(Array.from(projectStore.currentProject!.grid!.cells.slice(0, 6))).toEqual([
      3, 3, 2, 2, 3, 2,
    ])
    expect(projectStore.currentProject?.revision).toBe(1)
    expect(editor.selectedCell).toBeNull()
    await syncProjectProps(wrapper, projectStore)

    editor.setFillTargetMode('empty')
    dispatch(wrapper, 'pointerdown', 0, 0, 2)
    expect(Array.from(projectStore.currentProject!.grid!.cells.slice(0, 6))).toEqual([
      0, 0, 2, 2, 0, 2,
    ])
    expect(projectStore.currentProject?.revision).toBe(2)
    wrapper.unmount()
  })

  it('keeps Pan ahead of tools and blocks edits during compare or stale gestures', async () => {
    const project = makeProject()
    const { wrapper, editor, projectStore } = await mountCanvas(project)
    editor.setActiveTool('brush')
    editor.setActivePaletteIndex(4)
    dispatch(wrapper, 'pointerdown', 0, 0, 1, 1)
    const area = wrapper.get('[data-testid="editor-canvas-area"]').element
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, button: 1, clientX: 20, clientY: 20 }),
    )
    area.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, button: 1, clientX: 20, clientY: 20 }),
    )
    expect(projectStore.currentProject).toBe(project)
    expect(editor.panX).toBe(-16)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    dispatch(wrapper, 'pointerdown', 0, 0, 7)
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 7, button: 0, clientX: 58, clientY: 36 }),
    )
    area.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 7, button: 0, clientX: 58, clientY: 36 }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(projectStore.currentProject).toBe(project)
    expect(editor.panX).toBe(6)

    editor.setSourceCompareActive(true)
    dispatch(wrapper, 'pointerdown', 0, 0, 2)
    expect(projectStore.currentProject).toBe(project)
    editor.setSourceCompareActive(false)

    dispatch(wrapper, 'pointerdown', 0, 0, 3)
    editor.setSourceCompareActive(true)
    await flushPromises()
    dispatch(wrapper, 'pointerup', 0, 2, 3)
    expect(projectStore.currentProject).toBe(project)
    editor.setSourceCompareActive(false)

    dispatch(wrapper, 'pointerdown', 1, 0, 4)
    editor.setActiveTool('eraser')
    await flushPromises()
    dispatch(wrapper, 'pointerup', 1, 2, 4)
    expect(projectStore.currentProject).toBe(project)

    editor.setActiveTool('brush')
    dispatch(wrapper, 'pointerdown', 2, 0, 5)
    const replacement = {
      ...project,
      grid: { ...project.grid!, cells: project.grid!.cells.slice() },
    }
    projectStore.setCurrentProject(replacement)
    await flushPromises()
    dispatch(wrapper, 'pointerup', 2, 3, 5)
    expect(projectStore.currentProject).toBe(replacement)
    expect(Array.from(replacement.grid!.cells)).toEqual(Array(12).fill(0))
    expect(replacement.revision).toBe(0)

    await syncProjectProps(wrapper, projectStore)
    editor.setActiveTool('brush')
    dispatch(wrapper, 'pointerdown', 0, 0, 6)
    const projectB = makeProject()
    projectStore.setCurrentProject(projectB)
    await flushPromises()
    dispatch(wrapper, 'pointerup', 0, 3, 6)
    expect(projectStore.currentProject).toBe(projectB)
    expect(Array.from(projectB.grid!.cells)).toEqual(Array(12).fill(0))
    wrapper.unmount()
  })
})
