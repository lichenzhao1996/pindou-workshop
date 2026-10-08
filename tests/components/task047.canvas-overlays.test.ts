import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGrid } from '../../src/domain/project/grid'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
} from './canvas-test-helpers'

describe('TASK-047 canvas overlays', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows fine grid, major lines and 0-based labels for a read-only empty Grid', async () => {
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 640)
    installResizeObserver()
    const frames = installAnimationFrames()
    const grid = createGrid(20, 20)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'project-overlay' },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    frames.flush()
    await flushPromises()

    const area = wrapper.get('[data-testid="editor-canvas-area"]')
    expect(area.attributes('data-rendered-beads')).toBe('0')
    expect(Number(area.attributes('data-normal-lines'))).toBeGreaterThan(0)
    expect(Number(area.attributes('data-major-lines'))).toBeGreaterThan(0)
    expect(Number(area.attributes('data-coordinates'))).toBeGreaterThan(0)
    expect(context.labels).toContain('0')
    expect(grid.cells.every((cell) => cell === 0)).toBe(true)

    wrapper.unmount()
  })
})
