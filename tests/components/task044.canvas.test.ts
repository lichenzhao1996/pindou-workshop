import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('TASK-044 Canvas component', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sets DPR backing dimensions and redraws when the immutable Grid reference changes', async () => {
    const pinia = createPinia()
    const context = createCanvasContextMock()
    installCanvasContext(context)
    const layout = installCanvasLayout(320, 240, 2)
    const observers = installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(3, 2)
    grid.cells.set([1, 0, 2, 3, 0, 4])
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'project-1' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()
    await flushPromises()
    frames.flush()

    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(640)
    expect((wrapper.get('canvas').element as HTMLCanvasElement).height).toBe(480)
    expect(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-dpr')).toBe('2')
    expect(
      wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-rendered-beads'),
    ).toBe('4')
    expect(useEditorStore(pinia).zoom).toBeGreaterThan(1)
    const fillsBeforeUpdate = context.context.fillRect.mock.calls.length

    layout.setSize(400, 300)
    observers
      .find((observer) => observer.target?.getAttribute('data-testid') === 'editor-canvas-area')!
      .trigger()
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(800)
    expect((wrapper.get('canvas').element as HTMLCanvasElement).height).toBe(600)
    expect(context.context.fillRect.mock.calls.length).toBeGreaterThan(fillsBeforeUpdate)

    const nextGrid = createGrid(3, 2)
    nextGrid.cells.fill(5)
    await wrapper.setProps({ grid: nextGrid })
    await flushPromises()
    frames.flush()
    await flushPromises()

    expect(context.context.fillRect.mock.calls.length).toBeGreaterThan(fillsBeforeUpdate)
    expect(
      wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-rendered-beads'),
    ).toBe('6')
    wrapper.unmount()
  })

  it('clears safely for a null Grid and redraws overlays on viewport changes', async () => {
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 480)
    installResizeObserver()
    const frames = installAnimationFrames()
    const wrapper = mount(EditorCanvasArea, {
      props: { grid: null, projectId: null },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(wrapper.get('[data-testid="canvas-empty"]').text()).toBe('暂无 Grid')
    expect(
      wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-rendered-beads'),
    ).toBe('0')

    const grid = createGrid(20, 20)
    grid.cells.fill(0)
    await wrapper.setProps({ grid, projectId: 'project-2' })
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(
      Number(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-major-lines')),
    ).toBeGreaterThan(0)
    expect(
      Number(wrapper.get('[data-testid="editor-canvas-area"]').attributes('data-coordinates')),
    ).toBeGreaterThan(0)
    expect(context.context.setTransform).toHaveBeenCalled()
    wrapper.unmount()
  })
})
