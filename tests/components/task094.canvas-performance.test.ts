import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { createGrid } from '../../src/domain/project/grid'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
} from './canvas-test-helpers'

describe('TASK-094 large Canvas interaction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setActivePinia(createPinia())
  })

  it('redraws visible beads, labels, and highlight without traversing the full large Grid', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 480, 1)
    installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(256, 192)
    grid.cells.fill(26)
    const editor = useEditorStore(pinia)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'task094-large-grid' },
      global: { plugins: [pinia] },
    })
    const area = wrapper.get('[data-testid="editor-canvas-area"]')

    await flushPromises()
    editor.setViewport({ zoom: 1, panX: -1200, panY: -900 })
    editor.toggleLabels()
    editor.setHighlightedPaletteIndex(26)
    await flushPromises()
    frames.flush()
    await flushPromises()

    const rendered = Number(area.attributes('data-rendered-beads'))
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(grid.width * grid.height)
    expect(Number(area.attributes('data-labels'))).toBe(rendered)
    expect(Number(area.attributes('data-highlighted-beads'))).toBe(rendered)
    expect(Number(area.attributes('data-dimmed-beads'))).toBe(0)
    expect(context.context.setTransform).toHaveBeenCalled()
    wrapper.unmount()
  })
})
