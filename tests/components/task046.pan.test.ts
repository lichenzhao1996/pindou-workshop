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
  pointerEvent,
} from './canvas-test-helpers'

describe('TASK-046 canvas pan gestures', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('pans by CSS screen-pixel deltas with Space+left and middle button only', async () => {
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(320, 240)
    installResizeObserver()
    const frames = installAnimationFrames()
    const pinia = createPinia()
    const grid = createGrid(20, 20)
    grid.cells.fill(1)
    const wrapper = mount(EditorCanvasArea, {
      props: { grid, projectId: 'project-pan' },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    frames.flush()

    const store = useEditorStore(pinia)
    const area = wrapper.get('[data-testid="editor-canvas-area"]').element
    const captured = new Set<number>()
    const startPan = { x: store.panX, y: store.panY }
    Object.defineProperties(area, {
      setPointerCapture: { value: vi.fn((id: number) => captured.add(id)) },
      hasPointerCapture: { value: vi.fn((id: number) => captured.has(id)) },
      releasePointerCapture: { value: vi.fn((id: number) => captured.delete(id)) },
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 }),
    )
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 1, button: -1, clientX: 32, clientY: 47 }),
    )
    expect(store.panX - startPan.x).toBe(22)
    expect(store.panY - startPan.y).toBe(27)
    expect(captured.has(1)).toBe(true)
    area.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 1, button: 0, clientX: 32, clientY: 47 }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(captured.has(1)).toBe(false)

    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 2, button: 1, clientX: 32, clientY: 47 }),
    )
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 2, button: -1, clientX: 42, clientY: 57 }),
    )
    expect(store.panX - startPan.x).toBe(32)
    expect(store.panY - startPan.y).toBe(37)
    area.dispatchEvent(
      pointerEvent('pointerup', { pointerId: 2, button: 1, clientX: 42, clientY: 57 }),
    )

    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 3, button: 2, clientX: 42, clientY: 57 }),
    )
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 3, button: -1, clientX: 80, clientY: 90 }),
    )
    expect(store.panX - startPan.x).toBe(32)
    expect(store.panY - startPan.y).toBe(37)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 4, button: 0, clientX: 50, clientY: 60 }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 4, button: -1, clientX: 90, clientY: 90 }),
    )
    expect(store.panX - startPan.x).toBe(32)
    expect(store.panY - startPan.y).toBe(37)
    expect(captured.has(4)).toBe(false)

    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 5, button: 1, clientX: 50, clientY: 60 }),
    )
    const beforeCancel = { x: store.panX, y: store.panY }
    area.dispatchEvent(
      pointerEvent('pointercancel', { pointerId: 5, button: 1, clientX: 50, clientY: 60 }),
    )
    area.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 5, button: -1, clientX: 100, clientY: 110 }),
    )
    expect(store.panX).toBe(beforeCancel.x)
    expect(store.panY).toBe(beforeCancel.y)
    expect(captured.has(5)).toBe(false)

    area.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 6, button: 1, clientX: 50, clientY: 60 }),
    )
    expect(captured.has(6)).toBe(true)
    wrapper.unmount()
    expect(captured.has(6)).toBe(false)
  })
})
