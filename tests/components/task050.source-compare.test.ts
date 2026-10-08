import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../src/app/stores/editorStore'
import { createGrid } from '../../src/domain/project/grid'
import type { CropState, Source } from '../../src/domain/project/types'
import EditorCanvasArea from '../../src/features/editor/components/EditorCanvasArea.vue'
import EditorToolbar from '../../src/features/editor/components/EditorToolbar.vue'
import {
  createCanvasContextMock,
  installAnimationFrames,
  installCanvasContext,
  installCanvasLayout,
  installResizeObserver,
  pointerEvent,
} from './canvas-test-helpers'

function createProjectInput(projectId = 'source-project', blob = new Blob(['source'])) {
  const source: Source = {
    originalImage: blob,
    originalFileName: 'source.png',
    mimeType: 'image/png',
    originalWidth: 4,
    originalHeight: 3,
  }
  const crop: CropState = {
    x: 0,
    y: 0,
    width: 4,
    height: 3,
    rotation: 90,
    aspectRatio: 4 / 3,
  }
  return { projectId, source, crop }
}

function installBitmapDecoder(width = 4, height = 3) {
  const close = vi.fn()
  const decode = vi.fn(async () => ({ width, height, close }))
  vi.stubGlobal('createImageBitmap', decode)
  return { decode, close }
}

function mountCompareEditor(
  pinia: ReturnType<typeof createPinia>,
  context: ReturnType<typeof createCanvasContextMock>,
  input = createProjectInput(),
) {
  const grid = createGrid(2, 2)
  grid.cells.set([1, 35, 0, 2])
  const canvas = mount(EditorCanvasArea, {
    props: { grid, projectId: input.projectId, source: input.source, crop: input.crop },
    global: { plugins: [pinia] },
  })
  const toolbar = mount(EditorToolbar, {
    props: { grid, canvasSize: { width: 640, height: 480 } },
    global: { plugins: [pinia] },
  })
  return { canvas, toolbar, grid }
}

function pressCompare(wrapper: ReturnType<typeof mount>, pointerId = 7) {
  wrapper.get('[data-testid="editor-source-compare"]').element.dispatchEvent(
    pointerEvent('pointerdown', {
      pointerId,
      button: 0,
      clientX: 24,
      clientY: 24,
    }),
  )
}

function releaseCompare(wrapper: ReturnType<typeof mount>, pointerId = 7, type = 'pointerup') {
  wrapper.get('[data-testid="editor-source-compare"]').element.dispatchEvent(
    pointerEvent(type, {
      pointerId,
      button: 0,
      clientX: 24,
      clientY: 24,
    }),
  )
}

describe('TASK-050 hold-to-compare', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the official cropped and rotated source, aligned to the same Grid world rectangle and viewport', async () => {
    const pinia = createPinia()
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 480, 2)
    installResizeObserver()
    const frames = installAnimationFrames()
    const { decode, close } = installBitmapDecoder()
    const input = createProjectInput()
    const { canvas, toolbar, grid } = mountCompareEditor(pinia, context, input)
    const editor = useEditorStore(pinia)
    editor.setViewport({ zoom: 1, panX: 15, panY: -8 })
    editor.showLabels = true
    editor.setSelectedCell({ row: 1, column: 1, index: 3 })
    const originalCells = grid.cells.slice()
    pressCompare(toolbar)
    await flushPromises()
    frames.flush()
    await flushPromises()

    expect(editor.isComparingSource).toBe(true)
    expect(decode).toHaveBeenCalledWith(input.source.originalImage)
    expect(close).toHaveBeenCalledOnce()
    expect(context.context.drawImage).toHaveBeenCalledOnce()
    const [preview, x, y, width, height] = context.context.drawImage.mock.calls[0]!
    expect(preview).toMatchObject({ width: 3, height: 4 })
    expect([x, y, width, height]).toEqual([24, 24, 48, 48])
    expect(context.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 30, -16)
    expect(canvas.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('0')

    releaseCompare(toolbar)
    await flushPromises()
    frames.flush()
    await flushPromises()
    expect(editor.isComparingSource).toBe(false)
    expect(editor.selectedCell).toEqual({ row: 1, column: 1, index: 3 })
    expect(canvas.get('[data-testid="editor-canvas-area"]').attributes('data-labels')).toBe('3')
    expect(context.context.stroke).toHaveBeenCalled()
    expect(grid.cells).toEqual(originalCells)

    pressCompare(toolbar, 8)
    await flushPromises()
    frames.flush()
    expect(decode).toHaveBeenCalledTimes(1)
    releaseCompare(toolbar, 8)
    await flushPromises()
    canvas.unmount()
    toolbar.unmount()
  })

  it('exits for pointercancel, blur, keyboard release, and unmount', async () => {
    const pinia = createPinia()
    const grid = createGrid(1, 1)
    const toolbar = mount(EditorToolbar, {
      props: { grid, canvasSize: { width: 200, height: 160 } },
      global: { plugins: [pinia] },
    })
    const editor = useEditorStore(pinia)

    pressCompare(toolbar)
    expect(editor.isComparingSource).toBe(true)
    releaseCompare(toolbar, 7, 'pointercancel')
    expect(editor.isComparingSource).toBe(false)

    pressCompare(toolbar)
    releaseCompare(toolbar, 7, 'pointerleave')
    expect(editor.isComparingSource).toBe(false)

    toolbar
      .get('[data-testid="editor-source-compare"]')
      .element.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      )
    expect(editor.isComparingSource).toBe(true)
    toolbar
      .get('[data-testid="editor-source-compare"]')
      .element.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(editor.isComparingSource).toBe(false)

    toolbar
      .get('[data-testid="editor-source-compare"]')
      .element.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }),
      )
    expect(editor.isComparingSource).toBe(true)
    toolbar
      .get('[data-testid="editor-source-compare"]')
      .element.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', bubbles: true }))
    expect(editor.isComparingSource).toBe(false)

    pressCompare(toolbar)
    window.dispatchEvent(new Event('blur'))
    expect(editor.isComparingSource).toBe(false)
    pressCompare(toolbar)
    toolbar.unmount()
    expect(editor.isComparingSource).toBe(false)
  })

  it('does not reopen after release or draw an old image after Project/source/crop changes', async () => {
    const pinia = createPinia()
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(640, 480)
    installResizeObserver()
    const frames = installAnimationFrames()
    let resolveBitmap!: (bitmap: { width: number; height: number; close: () => void }) => void
    const decode = vi.fn(
      () =>
        new Promise<{ width: number; height: number; close: () => void }>((resolve) => {
          resolveBitmap = resolve
        }),
    )
    vi.stubGlobal('createImageBitmap', decode)
    const input = createProjectInput()
    const { canvas, toolbar } = mountCompareEditor(pinia, context, input)
    const editor = useEditorStore(pinia)

    pressCompare(toolbar)
    await flushPromises()
    expect(editor.isComparingSource).toBe(true)
    releaseCompare(toolbar)
    expect(editor.isComparingSource).toBe(false)
    resolveBitmap({ width: 4, height: 3, close: vi.fn() })
    await flushPromises()
    frames.flush()
    expect(context.context.drawImage).not.toHaveBeenCalled()

    pressCompare(toolbar, 8)
    await flushPromises()
    expect(editor.isComparingSource).toBe(true)
    await canvas.setProps({
      projectId: 'project-b',
      source: createProjectInput('project-b').source,
    })
    await flushPromises()
    expect(editor.isComparingSource).toBe(false)
    canvas.unmount()
    toolbar.unmount()
  })

  it('safely exits when formal source/crop is missing and when decoding fails', async () => {
    const pinia = createPinia()
    const context = createCanvasContextMock()
    installCanvasContext(context)
    installCanvasLayout(320, 240)
    installResizeObserver()
    installAnimationFrames()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => Promise.reject(new Error('decode failed'))),
    )
    const input = createProjectInput()
    const grid = createGrid(1, 1)
    const canvas = mount(EditorCanvasArea, {
      props: { grid, projectId: input.projectId, source: null, crop: null },
      global: { plugins: [pinia] },
    })
    const toolbar = mount(EditorToolbar, {
      props: { grid, canvasSize: { width: 320, height: 240 } },
      global: { plugins: [pinia] },
    })
    const editor = useEditorStore(pinia)

    pressCompare(toolbar)
    await flushPromises()
    expect(editor.isComparingSource).toBe(false)
    expect(context.context.drawImage).not.toHaveBeenCalled()
    canvas.unmount()
    toolbar.unmount()
  })
})
