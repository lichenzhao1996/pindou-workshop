import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { createGrid } from '../../src/domain/project/grid'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import { CELL_SIZE, GRID_AXIS_MARGIN, worldToScreen } from '../../src/rendering/viewport'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
  pointerEvent,
} from './canvas-test-helpers'

describe('TASK-049 Canvas interaction', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('updates hover/preview, selects valid EMPTY cells, and clears only transient hover on leave', async () => {
    const pinia = createPinia()
    installCanvasContext(createCanvasContextMock())
    installCanvasLayout(480, 320, 1, 80, 35)
    installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(4, 3)
    const cells = grid.cells.slice()
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'interaction-project' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    const editor = useEditorStore(pinia)
    const viewport = { zoom: 1.5, panX: 29, panY: 12 }
    editor.setViewport(viewport)
    const screen = worldToScreen(
      {
        x: GRID_AXIS_MARGIN + 2.5 * CELL_SIZE,
        y: GRID_AXIS_MARGIN + 1.5 * CELL_SIZE,
      },
      viewport,
    )
    const point = { x: 80 + screen.x, y: 35 + screen.y }
    const area = wrapper.get('[data-testid="editor-canvas-area"]')
    area.element.dispatchEvent(
      pointerEvent('pointermove', {
        pointerId: 1,
        button: 0,
        clientX: point.x,
        clientY: point.y,
      }),
    )
    await flushPromises()
    frames.flush()
    expect(area.attributes('data-hovered-cell')).toBe('1,2')
    expect(area.attributes('data-preview-cell')).toBe('1,2')

    area.element.dispatchEvent(
      pointerEvent('pointerdown', {
        pointerId: 1,
        button: 0,
        clientX: point.x,
        clientY: point.y,
      }),
    )
    await flushPromises()
    expect(editor.selectedCell).toEqual({ row: 1, column: 2, index: 6 })
    expect(grid.cells).toEqual(cells)

    area.element.dispatchEvent(new Event('pointerleave', { bubbles: true }))
    await flushPromises()
    frames.flush()
    expect(area.attributes('data-hovered-cell')).toBe('')
    expect(area.attributes('data-preview-cell')).toBe('')
    expect(editor.selectedCell).toEqual({ row: 1, column: 2, index: 6 })
    wrapper.unmount()
  })

  it('clears selection on an outside click, but Space+primary and middle drags only pan', async () => {
    const pinia = createPinia()
    installCanvasContext(createCanvasContextMock())
    installCanvasLayout(480, 320)
    installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(4, 3)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'pan-priority' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    const editor = useEditorStore(pinia)
    editor.setViewport({ zoom: 1, panX: 0, panY: 0 })
    editor.setSelectedCell({ row: 0, column: 0, index: 0 })
    const area = wrapper.get('[data-testid="editor-canvas-area"]')
    const cellPoint = { x: 36, y: 36 }

    area.element.dispatchEvent(
      pointerEvent('pointerdown', {
        pointerId: 2,
        button: 1,
        clientX: cellPoint.x,
        clientY: cellPoint.y,
      }),
    )
    area.element.dispatchEvent(
      pointerEvent('pointermove', {
        pointerId: 2,
        button: 1,
        clientX: cellPoint.x + 20,
        clientY: cellPoint.y + 12,
      }),
    )
    area.element.dispatchEvent(
      pointerEvent('pointerup', {
        pointerId: 2,
        button: 1,
        clientX: cellPoint.x,
        clientY: cellPoint.y,
      }),
    )
    expect(editor.selectedCell).toEqual({ row: 0, column: 0, index: 0 })
    expect(editor.panX).toBe(20)
    expect(editor.panY).toBe(12)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
    )
    area.element.dispatchEvent(
      pointerEvent('pointerdown', {
        pointerId: 3,
        button: 0,
        clientX: cellPoint.x,
        clientY: cellPoint.y,
      }),
    )
    area.element.dispatchEvent(
      pointerEvent('pointermove', {
        pointerId: 3,
        button: 0,
        clientX: cellPoint.x + 10,
        clientY: cellPoint.y + 7,
      }),
    )
    area.element.dispatchEvent(
      pointerEvent('pointerup', {
        pointerId: 3,
        button: 0,
        clientX: cellPoint.x,
        clientY: cellPoint.y,
      }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(editor.selectedCell).toEqual({ row: 0, column: 0, index: 0 })
    expect(editor.panX).toBe(30)
    expect(editor.panY).toBe(19)

    editor.setViewport({ zoom: 1, panX: 0, panY: 0 })
    area.element.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 4, button: 0, clientX: 1, clientY: 1 }),
    )
    expect(editor.selectedCell).toBeNull()
    frames.flush()
    wrapper.unmount()
  })

  it('clears transient cells on Project switch or missing Grid and preserves valid selection for an immutable Grid replacement', async () => {
    const pinia = createPinia()
    installCanvasContext(createCanvasContextMock())
    installCanvasLayout(480, 320)
    installResizeObserver()
    installAnimationFrames()
    const grid = createGrid(3, 2)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'project-a' },
      global: { plugins: [pinia] },
    })
    const editor = useEditorStore(pinia)
    editor.setSelectedCell({ row: 1, column: 1, index: 4 })
    await wrapper.setProps({ grid: createGrid(3, 2) })
    expect(editor.selectedCell).toEqual({ row: 1, column: 1, index: 4 })

    await wrapper.setProps({ projectId: 'project-b' })
    expect(editor.selectedCell).toBeNull()
    editor.setSelectedCell({ row: 1, column: 2, index: 5 })
    await wrapper.setProps({ grid: createGrid(2, 2) })
    expect(editor.selectedCell).toBeNull()
    editor.setSelectedCell({ row: 1, column: 1, index: 3 })
    await wrapper.setProps({ grid: null })
    await flushPromises()
    expect(editor.selectedCell).toBeNull()
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-hovered-cell')).toBe(
      '',
    )
    wrapper.unmount()
  })
})
