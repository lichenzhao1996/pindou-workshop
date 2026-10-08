import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { MARD_291_PALETTE } from '../../src/domain/palette/mard291'
import { createGrid } from '../../src/domain/project/grid'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import EditorToolbar from '../../src/features/editor/components/EditorToolbar.vue'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
} from './canvas-test-helpers'

describe('TASK-048 label controls', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('defaults to hidden, toggles from the Toolbar, and redraws formal Palette codes', async () => {
    const pinia = createPinia()
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 480)
    installResizeObserver()
    const frames = installAnimationFrames()
    const white = MARD_291_PALETTE.entries.find(
      ({ rgb }) => rgb.r === 255 && rgb.g === 255 && rgb.b === 255,
    )!
    const grid = createGrid(3, 1)
    grid.cells.set([0, white.paletteIndex, 35])
    const originalCells = grid.cells.slice()
    const canvas = mount(EditorCanvasArea, {
      props: { grid, projectId: 'labels-project' },
      global: { plugins: [pinia] },
    })
    const toolbar = mount(EditorToolbar, {
      props: { grid, canvasSize: { width: 640, height: 480 } },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(useEditorStore(pinia).showLabels).toBe(false)
    expect(canvas.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('0')

    await toolbar.get('[data-testid="editor-label-toggle"]').trigger('click')
    await flushPromises()
    frames.flush()
    await flushPromises()

    expect(useEditorStore(pinia).showLabels).toBe(true)
    expect(toolbar.get('[data-testid="editor-label-toggle"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(canvas.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('2')
    expect(grid.cells).toEqual(originalCells)

    canvas.unmount()
    toolbar.unmount()
  })

  it('keeps the preference when zoom automatically hides and later restores labels', async () => {
    const pinia = createPinia()
    installCanvasContext(createCanvasContextMock())
    installCanvasLayout(320, 240)
    installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(1, 1)
    grid.cells[0] = 35
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'labels-zoom' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    useEditorStore(pinia).setViewport({ zoom: 0.7, panX: 0, panY: 0 })
    useEditorStore(pinia).showLabels = true
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('0')

    useEditorStore(pinia).setZoom(1)
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(useEditorStore(pinia).showLabels).toBe(true)
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('1')
    wrapper.unmount()
  })
})
