import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { useProjectStore } from '../../src/app/stores/projectStore'
import { createGrid, createProject } from '../../src/domain/project'
import type { Project, Source } from '../../src/domain/project'
import { CELL_SIZE, GRID_AXIS_MARGIN } from '../../src/rendering/viewport'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import EditorMiniMap from '../../src/features/editor/components/EditorMiniMap.vue'
import EditorToolbar from '../../src/features/editor/components/EditorToolbar.vue'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
  pointerEvent,
} from './canvas-test-helpers'

const source: Source = {
  originalImage: new Blob(['component-history'], { type: 'image/png' }),
  originalFileName: 'task062-064.png',
  mimeType: 'image/png',
  originalWidth: 120,
  originalHeight: 80,
}

function projectWithGrid(width = 8, height = 8): Project {
  const project = createProject({
    source: { ...source },
    crop: { x: 0, y: 0, width: 120, height: 80, rotation: 0, aspectRatio: 1.5 },
  })
  const grid = createGrid(width, height)
  grid.cells[0] = 1
  return { ...project, grid }
}

function installMiniMapLayout() {
  installCanvasLayout(320, 240, 1, 10, 20)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const element = this as HTMLElement
    const isMiniMap =
      element.matches('[data-testid="editor-minimap-surface"]') ||
      element.matches('[data-testid="editor-minimap-canvas"]')
    const width = isMiniMap ? 196 : 320
    const height = isMiniMap ? 136 : 240
    const left = 10
    const top = 20
    return {
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  })
}

describe('TASK-062/063 Undo and Redo controls', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('enables and invokes Undo/Redo only when the Project history allows it', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const projects = useProjectStore(pinia)
    const project = projectWithGrid()
    projects.setCurrentProject(project)
    const wrapper = mount(EditorToolbar, {
      props: { grid: project.grid, canvasSize: { width: 400, height: 300 } },
      global: { plugins: [pinia] },
    })
    const undo = wrapper.get('[data-testid="editor-undo"]')
    const redo = wrapper.get('[data-testid="editor-redo"]')
    expect((undo.element as HTMLButtonElement).disabled).toBe(true)
    expect((redo.element as HTMLButtonElement).disabled).toBe(true)

    projects.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 2 },
      project,
      project.grid!,
    )
    await flushPromises()
    expect((undo.element as HTMLButtonElement).disabled).toBe(false)
    await undo.trigger('click')
    await flushPromises()
    expect(projects.currentProject!.grid!.cells[0]).toBe(1)
    expect((redo.element as HTMLButtonElement).disabled).toBe(false)
    await redo.trigger('click')
    await flushPromises()
    expect(projects.currentProject!.grid!.cells[0]).toBe(2)
    expect((redo.element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })
})

describe('TASK-064 MiniMap component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the same Grid and Palette, jumps by click, and drags the viewport without editing', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const frames = installAnimationFrames()
    installMiniMapLayout()
    installResizeObserver()
    installCanvasContext(createCanvasContextMock())
    const projects = useProjectStore(pinia)
    const project = projectWithGrid(20, 12)
    projects.setCurrentProject(project)
    const editor = useEditorStore(pinia)
    editor.setViewport({ zoom: 1, panX: 0, panY: 0 })
    const wrapper = mount(EditorMiniMap, {
      props: {
        grid: project.grid,
        projectId: project.projectId,
        canvasSize: { width: 100, height: 80 },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(
      wrapper.get('[data-testid="editor-minimap-canvas"]').attributes('data-rendered-beads'),
    ).toBe('1')

    const initialProject = projects.currentProject
    const initialRevision = initialProject!.revision
    await wrapper.get('[data-testid="editor-minimap-surface"]').element.dispatchEvent(
      pointerEvent('pointerdown', {
        pointerId: 4,
        button: 0,
        clientX: 10 + 160,
        clientY: 20 + 80,
      }),
    )
    await flushPromises()
    expect(editor.zoom).toBe(1)
    expect(editor.panX).not.toBe(0)
    expect(editor.panY).not.toBe(0)
    expect(projects.currentProject!.revision).toBe(initialRevision)
    expect(projects.currentProject!.grid!.cells).toEqual(initialProject!.grid!.cells)

    const frame = wrapper.get('[data-testid="editor-minimap-viewport"]')
    const startPan = { x: editor.panX, y: editor.panY }
    frame.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 9, button: 0, clientX: 100, clientY: 80 }),
    )
    wrapper
      .get('[data-testid="editor-minimap-surface"]')
      .element.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 9, button: 0, clientX: 106, clientY: 84 }),
      )
    expect(editor.panX).not.toBe(startPan.x)
    expect(editor.panY).not.toBe(startPan.y)
    wrapper
      .get('[data-testid="editor-minimap-surface"]')
      .element.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 9, button: 0, clientX: 106, clientY: 84 }),
      )
    expect(editor.zoom).toBe(1)
    expect(projects.currentProject!.revision).toBe(initialRevision)
    expect(projects.currentProject!.grid!.cells).toEqual(initialProject!.grid!.cells)
    wrapper.unmount()
  })

  it('collapses and expands, preserving the user preference across Project switches', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const frames = installAnimationFrames()
    installMiniMapLayout()
    installResizeObserver()
    installCanvasContext(createCanvasContextMock())
    const first = projectWithGrid()
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(first)
    const editor = useEditorStore(pinia)
    const wrapper = mount(EditorMiniMap, {
      props: {
        grid: first.grid,
        projectId: first.projectId,
        canvasSize: { width: 100, height: 80 },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await wrapper.get('[data-testid="editor-minimap-toggle"]').trigger('click')
    expect(editor.minimapCollapsed).toBe(true)
    expect(wrapper.find('[data-testid="editor-minimap-surface"]').exists()).toBe(false)

    const second = projectWithGrid()
    projects.setCurrentProject(second)
    await wrapper.setProps({ grid: second.grid, projectId: second.projectId })
    expect(editor.minimapCollapsed).toBe(true)
    await wrapper.get('[data-testid="editor-minimap-toggle"]').trigger('click')
    await flushPromises()
    expect(editor.minimapCollapsed).toBe(false)
    expect(wrapper.find('[data-testid="editor-minimap-surface"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('TASK-062 history restore selection behavior', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('undoes fill, brush and eraser as one history entry per committed action', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const frames = installAnimationFrames()
    installCanvasLayout(320, 240, 1, 10, 20)
    installResizeObserver()
    installCanvasContext(createCanvasContextMock())
    const project = projectWithGrid()
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(project)
    const editor = useEditorStore(pinia)
    editor.setActivePaletteIndex(2)
    const wrapper = mount(EditorCanvasArea, {
      props: { project, projectId: project.projectId, grid: project.grid },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    editor.setViewport({ zoom: 1, panX: 0, panY: 0 })
    frames.flush()
    const area = wrapper.get('[data-testid="editor-canvas-area"]').element
    const dispatchCell = async (type: string, row: number, column: number, pointerId: number) => {
      area.dispatchEvent(
        pointerEvent(type, {
          pointerId,
          button: 0,
          clientX: 10 + GRID_AXIS_MARGIN + (column + 0.5) * CELL_SIZE,
          clientY: 20 + GRID_AXIS_MARGIN + (row + 0.5) * CELL_SIZE,
        }),
      )
      await flushPromises()
    }
    const syncProps = async () => {
      const current = projects.currentProject!
      await wrapper.setProps({ project: current, grid: current.grid })
      await flushPromises()
    }

    editor.setActiveTool('fill')
    await dispatchCell('pointerdown', 0, 0, 1)
    expect(projects.currentProject!.grid!.cells[0]).toBe(2)
    expect(projects.past).toHaveLength(1)
    expect(projects.undo()).toBe(true)
    await syncProps()
    expect(projects.currentProject!.grid!.cells[0]).toBe(1)

    editor.setActiveTool('brush')
    await dispatchCell('pointerdown', 0, 1, 2)
    await dispatchCell('pointerup', 0, 1, 2)
    expect(projects.currentProject!.grid!.cells[1]).toBe(2)
    expect(projects.past).toHaveLength(1)
    expect(projects.undo()).toBe(true)
    await syncProps()
    expect(projects.currentProject!.grid!.cells[1]).toBe(0)

    editor.setActiveTool('eraser')
    await dispatchCell('pointerdown', 0, 0, 3)
    await dispatchCell('pointerup', 0, 0, 3)
    expect(projects.currentProject!.grid!.cells[0]).toBe(0)
    expect(projects.past).toHaveLength(1)
    expect(projects.undo()).toBe(true)
    await syncProps()
    expect(projects.currentProject!.grid!.cells[0]).toBe(1)
    expect(projects.currentProject!.revision).toBe(project.revision)
    wrapper.unmount()
  })

  it('keeps a legal selected cell across Undo and clears transient overlays or illegal selection on restore', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    installAnimationFrames()
    installCanvasLayout(320, 240)
    installResizeObserver()
    installCanvasContext(createCanvasContextMock())
    const project = projectWithGrid()
    const projects = useProjectStore(pinia)
    projects.setCurrentProject(project)
    const editor = useEditorStore(pinia)
    const wrapper = mount(EditorCanvasArea, {
      props: { project, projectId: project.projectId, grid: project.grid },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    editor.setSelectedCell({ row: 2, column: 3, index: 19 })

    projects.applyGridOperation(
      { type: 'setCell', row: 0, column: 0, value: 4 },
      project,
      project.grid!,
    )
    await wrapper.setProps({
      project: projects.currentProject,
      grid: projects.currentProject!.grid,
    })
    expect(projects.undo()).toBe(true)
    await wrapper.setProps({
      project: projects.currentProject,
      grid: projects.currentProject!.grid,
    })
    await flushPromises()
    expect(editor.selectedCell).toEqual({ row: 2, column: 3, index: 19 })
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-preview-cell')).toBe(
      '',
    )

    editor.setSelectedCell({ row: 99, column: 99, index: 9999 })
    expect(projects.redo()).toBe(true)
    await wrapper.setProps({
      project: projects.currentProject,
      grid: projects.currentProject!.grid,
    })
    await flushPromises()
    expect(editor.selectedCell).toBeNull()
    wrapper.unmount()
  })
})
