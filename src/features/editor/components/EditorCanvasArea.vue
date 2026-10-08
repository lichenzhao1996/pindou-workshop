<template>
  <section
    ref="area"
    class="editor-canvas-area"
    aria-label="拼豆主画布"
    data-testid="editor-canvas-area"
    :data-zoom="editor.zoom"
    :data-pan-x="editor.panX"
    :data-pan-y="editor.panY"
    :data-dpr="backing.dpr"
    :data-rendered-beads="summary.beads"
    :data-normal-lines="summary.normalLines"
    :data-major-lines="summary.majorLines"
    :data-coordinates="summary.coordinates"
    @wheel.prevent="handleWheel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
  >
    <canvas
      ref="canvas"
      class="editor-canvas"
      data-testid="editor-canvas"
      aria-label="只读拼豆网格画布"
      tabindex="0"
    />
    <p v-if="!grid" class="canvas-empty" data-testid="canvas-empty">暂无 Grid</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { MARD_291_PALETTE } from '../../../domain/palette/mard291'
import type { Grid } from '../../../domain/project/grid'
import {
  renderBeadGrid,
  type BeadCanvasRenderSummary,
} from '../../../rendering/bead-canvas-renderer'
import {
  getCanvasBackingSize,
  MAX_ZOOM,
  MIN_ZOOM,
  type CanvasSize,
} from '../../../rendering/viewport'

const props = defineProps<{ grid: Grid | null; projectId: string | null }>()
const emit = defineEmits<{ resize: [size: CanvasSize] }>()

const editor = useEditorStore()
const area = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const canvasSize = reactive<CanvasSize>({ width: 0, height: 0 })
const backing = reactive({ width: 0, height: 0, dpr: 1 })
const summary = reactive<BeadCanvasRenderSummary>({
  beads: 0,
  normalLines: 0,
  majorLines: 0,
  coordinates: 0,
  invalidCells: 0,
})

interface ActiveDrag {
  pointerId: number
  lastX: number
  lastY: number
  kind: 'space-left' | 'middle'
}

let activeDrag: ActiveDrag | null = null
let spacePressed = false
let fittedProjectId: string | null = null
let resizeObserver: ResizeObserver | null = null
let drawFrame: number | null = null
let lastDevicePixelRatio = 1

function requestFrame(callback: (timestamp: number) => void): number {
  return window.requestAnimationFrame
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16)
}

function cancelFrame(frame: number) {
  if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame)
  else window.clearTimeout(frame)
}

function resizeBackingStore() {
  const element = canvas.value
  if (!element) return

  const target = getCanvasBackingSize(canvasSize, window.devicePixelRatio || 1)
  backing.width = target.width
  backing.height = target.height
  backing.dpr = target.dpr
  if (element.width !== target.width) element.width = target.width
  if (element.height !== target.height) element.height = target.height
}

function tryInitialFit() {
  const grid = props.grid
  const projectId = props.projectId
  if (
    !grid ||
    !projectId ||
    projectId === fittedProjectId ||
    canvasSize.width <= 0 ||
    canvasSize.height <= 0
  ) {
    return
  }

  editor.fitGrid(grid, canvasSize)
  fittedProjectId = projectId
}

function scheduleDraw() {
  if (drawFrame !== null) return

  drawFrame = requestFrame(() => {
    drawFrame = null
    const context = canvas.value?.getContext('2d')
    if (!context) return
    resizeBackingStore()
    const result = renderBeadGrid(context, props.grid, MARD_291_PALETTE, {
      viewport: editor.viewport,
      size: canvasSize,
      dpr: backing.dpr,
    })
    Object.assign(summary, result)
  })
}

function measureCanvas() {
  const bounds = area.value?.getBoundingClientRect()
  if (!bounds) return

  const width = Math.max(0, bounds.width)
  const height = Math.max(0, bounds.height)
  const nextDpr = window.devicePixelRatio || 1
  const sizeChanged = width !== canvasSize.width || height !== canvasSize.height
  const dprChanged = nextDpr !== lastDevicePixelRatio
  if (!sizeChanged && !dprChanged) return

  if (sizeChanged) {
    canvasSize.width = width
    canvasSize.height = height
    emit('resize', { width, height })
  }
  lastDevicePixelRatio = nextDpr
  resizeBackingStore()
  tryInitialFit()
  scheduleDraw()
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]'),
  )
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.code !== 'Space' || isEditableTarget(event.target)) return
  spacePressed = true
  event.preventDefault()
}

function releaseCapture(pointerId: number) {
  const element = area.value
  if (!element) return
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  } catch {
    // Some browsers can clear capture while dispatching pointercancel.
  }
}

function clearDrag() {
  const drag = activeDrag
  activeDrag = null
  if (drag) releaseCapture(drag.pointerId)
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.code !== 'Space') return
  spacePressed = false
  if (activeDrag?.kind === 'space-left') clearDrag()
}

function handlePointerDown(event: PointerEvent) {
  const kind =
    event.button === 1 ? 'middle' : event.button === 0 && spacePressed ? 'space-left' : null
  if (!kind) return

  event.preventDefault()
  activeDrag = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
    kind,
  }
  try {
    area.value?.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best-effort for environments that do not implement it.
  }
}

function handlePointerMove(event: PointerEvent) {
  const drag = activeDrag
  if (!drag || drag.pointerId !== event.pointerId) return

  const deltaX = event.clientX - drag.lastX
  const deltaY = event.clientY - drag.lastY
  drag.lastX = event.clientX
  drag.lastY = event.clientY
  editor.panBy(deltaX, deltaY)
}

function handlePointerEnd(event: PointerEvent) {
  if (activeDrag?.pointerId !== event.pointerId) return
  clearDrag()
}

function handleWheel(event: WheelEvent) {
  if (!props.grid || canvasSize.width <= 0 || canvasSize.height <= 0) return
  const bounds = area.value?.getBoundingClientRect()
  if (!bounds) return

  const factor = Math.exp(-event.deltaY * 0.0015)
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, editor.zoom * factor))
  editor.setZoom(nextZoom, {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
}

watch(
  () => props.projectId,
  (projectId) => {
    if (projectId !== fittedProjectId) fittedProjectId = null
    tryInitialFit()
    scheduleDraw()
  },
)
watch(() => [props.grid?.cells, props.grid?.width, props.grid?.height], scheduleDraw, {
  flush: 'post',
})
watch(() => [editor.zoom, editor.panX, editor.panY], scheduleDraw)

onMounted(() => {
  measureCanvas()
  if (typeof ResizeObserver !== 'undefined' && area.value) {
    resizeObserver = new ResizeObserver(measureCanvas)
    resizeObserver.observe(area.value)
  }
  window.addEventListener('resize', measureCanvas)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', clearDrag)
  lastDevicePixelRatio = window.devicePixelRatio || 1
  scheduleDraw()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureCanvas)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', clearDrag)
  clearDrag()
  spacePressed = false
  if (drawFrame !== null) cancelFrame(drawFrame)
  drawFrame = null
})
</script>

<style scoped>
.editor-canvas-area {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-canvas-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  touch-action: none;
  user-select: none;
}

.editor-canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  cursor: grab;
}

.editor-canvas:active {
  cursor: grabbing;
}

.canvas-empty {
  position: absolute;
  inset: 50% auto auto 50%;
  margin: 0;
  color: var(--color-text-secondary);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
