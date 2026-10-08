import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
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

describe('TASK-045 viewport controls', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('zooms, resets to exactly 100%, centers, and fits from the toolbar', async () => {
    const pinia = createPinia()
    const grid = createGrid(4, 3)
    const wrapper = mount(EditorToolbar, {
      props: { grid, canvasSize: { width: 400, height: 300 } },
      global: { plugins: [pinia] },
    })
    const store = useEditorStore(pinia)

    await wrapper.get('[data-testid="viewport-zoom-in"]').trigger('click')
    expect(store.zoom).toBe(1.25)
    await wrapper.get('[data-testid="viewport-reset"]').trigger('click')
    expect(store.zoom).toBe(1)
    expect(wrapper.get('[data-testid="editor-zoom"]').text()).toBe('100%')
    await wrapper.get('[data-testid="viewport-center"]').trigger('click')
    expect(store.panX).toBe(140)
    expect(store.panY).toBe(102)
    await wrapper.get('[data-testid="viewport-fit"]').trigger('click')
    expect(store.zoom).toBeGreaterThan(1)
    expect(store.zoom).toBeLessThanOrEqual(8)
    wrapper.unmount()
  })

  it('zooms around the mouse position and keeps the anchor world point stable', async () => {
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(320, 240)
    installResizeObserver()
    const frames = installAnimationFrames()
    const pinia = createPinia()
    const grid = createGrid(20, 20)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'project-wheel' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()

    const store = useEditorStore(pinia)
    store.setViewport({ zoom: 1, panX: 0, panY: 0 })
    const anchor = { x: 100, y: 80 }
    const worldBefore = { x: anchor.x, y: anchor.y }
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    })
    Object.defineProperties(wheel, {
      clientX: { value: anchor.x },
      clientY: { value: anchor.y },
    })
    wrapper.get('[data-testid="editor-canvas-area"]').element.dispatchEvent(wheel)
    await flushPromises()

    expect(store.zoom).toBeGreaterThan(1)
    expect(store.panX + worldBefore.x * store.zoom).toBeCloseTo(anchor.x)
    expect(store.panY + worldBefore.y * store.zoom).toBeCloseTo(anchor.y)
    frames.flush()
    wrapper.unmount()
  })
})
