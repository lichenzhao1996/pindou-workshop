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
    :data-labels="summary.labels"
    :data-normal-lines="summary.normalLines"
    :data-major-lines="summary.majorLines"
    :data-coordinates="summary.coordinates"
    :data-selected-cell="cellKey(editor.selectedCell)"
    :data-hovered-cell="cellKey(hoveredCell)"
    :data-preview-cell="cellKey(previewCell)"
    :data-comparing-source="editor.isComparingSource"
    @wheel.prevent="handleWheel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @pointerleave="handlePointerLeave"
  >
    <canvas
      ref="canvas"
      class="editor-canvas"
      data-testid="editor-canvas"
      aria-label="拼豆网格画布"
      tabindex="0"
    />
    <p v-if="!grid" class="canvas-empty" data-testid="canvas-empty">暂无 Grid</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { MARD_291_PALETTE } from '../../../domain/palette/mard291'
import type { Grid } from '../../../domain/project/grid'
import type { CropState, Source } from '../../../domain/project/types'
import {
  renderBeadGrid,
  type BeadCanvasRenderSummary,
} from '../../../rendering/bead-canvas-renderer'
import { hitTestGridCell, type GridCellHit } from '../../../rendering/hit-test'
import { SourcePreviewCache } from '../../../rendering/source-preview'
import {
  getCanvasBackingSize,
  MAX_ZOOM,
  MIN_ZOOM,
  type CanvasSize,
} from '../../../rendering/viewport'

const props = withDefaults(
  defineProps<{
    grid: Grid | null
    projectId: string | null
    source?: Source | null
    crop?: CropState | null
  }>(),
  { source: null, crop: null },
)
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
  labels: 0,
  previews: 0,
  selections: 0,
  hovers: 0,
  invalidCells: 0,
})
const hoveredCell = shallowRef<GridCellHit | null>(null)
const previewCell = shallowRef<GridCellHit | null>(null)
const sourcePreview = shallowRef<HTMLCanvasElement | null>(null)
const sourcePreviewCache = new SourcePreviewCache()

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
let compareRequestSequence = 0
let mounted = false

function cellKey(cell: GridCellHit | null) {
  return cell ? `${cell.row},${cell.column}` : ''
}

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
    const colors = getComputedStyle(area.value ?? document.documentElement)
    const result = renderBeadGrid(context, props.grid, MARD_291_PALETTE, {
      viewport: editor.viewport,
      size: canvasSize,
      dpr: backing.dpr,
      showLabels: editor.showLabels,
      sourcePreview: editor.isComparingSource ? sourcePreview.value : null,
      interactions: editor.isComparingSource
        ? undefined
        : {
            previewCell: previewCell.value,
            selectedCell: editor.selectedCell,
            hoveredCell: hoveredCell.value,
          },
      interactionColors: {
        preview: colors.getPropertyValue('--color-action').trim() || '#2563eb',
        selected: colors.getPropertyValue('--color-action').trim() || '#2563eb',
        hovered: colors.getPropertyValue('--color-text-primary').trim() || '#1f2933',
      },
    })
    Object.assign(summary, result)
  })
}

function measureCanvas() {
  const bounds = canvas.value?.getBoundingClientRect()
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
  if (activeDrag) return
  const kind =
    event.button === 1 ? 'middle' : event.button === 0 && spacePressed ? 'space-left' : null
  if (kind) {
    event.preventDefault()
    clearPointerFeedback()
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
    return
  }

  if (event.button !== 0 || event.isPrimary === false || editor.isComparingSource) return
  const hit = hitTest(event.clientX, event.clientY)
  hoveredCell.value = hit
  previewCell.value = hit
  editor.setSelectedCell(hit)
  scheduleDraw()
}

function handlePointerMove(event: PointerEvent) {
  const drag = activeDrag
  if (drag?.pointerId === event.pointerId) {
    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    editor.panBy(deltaX, deltaY)
    return
  }

  if (activeDrag || editor.isComparingSource) return
  const hit = hitTest(event.clientX, event.clientY)
  hoveredCell.value = hit
  previewCell.value = hit
  scheduleDraw()
}

function handlePointerEnd(event: PointerEvent) {
  if (activeDrag?.pointerId !== event.pointerId) return
  clearDrag()
}

function handlePointerLeave() {
  clearPointerFeedback()
}

function clearPointerFeedback() {
  hoveredCell.value = null
  previewCell.value = null
  scheduleDraw()
}

function hitTest(clientX: number, clientY: number) {
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds) return null
  return hitTestGridCell({ x: clientX, y: clientY }, bounds, editor.viewport, props.grid)
}

function handleWheel(event: WheelEvent) {
  if (!props.grid || canvasSize.width <= 0 || canvasSize.height <= 0) return
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds) return

  const factor = Math.exp(-event.deltaY * 0.0015)
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, editor.zoom * factor))
  editor.setZoom(nextZoom, {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })
}

function previewInput() {
  return {
    projectId: props.projectId,
    source: props.source,
    crop: props.crop,
  }
}

async function startSourcePreview() {
  const request = ++compareRequestSequence
  const input = previewInput()
  if (!editor.isComparingSource || !input.projectId || !input.source || !input.crop) {
    editor.setSourceCompareActive(false)
    return
  }

  try {
    const image = await sourcePreviewCache.get(input)
    if (
      !mounted ||
      request !== compareRequestSequence ||
      !editor.isComparingSource ||
      input.projectId !== props.projectId ||
      input.source.originalImage !== props.source?.originalImage ||
      input.crop.x !== props.crop?.x ||
      input.crop.y !== props.crop?.y ||
      input.crop.width !== props.crop?.width ||
      input.crop.height !== props.crop?.height ||
      input.crop.rotation !== props.crop?.rotation ||
      input.crop.aspectRatio !== props.crop?.aspectRatio ||
      !image
    ) {
      return
    }
    sourcePreview.value = image
    scheduleDraw()
  } catch {
    if (request === compareRequestSequence && editor.isComparingSource) {
      editor.setSourceCompareActive(false)
    }
  }
}

function invalidateSourcePreview() {
  compareRequestSequence += 1
  sourcePreviewCache.invalidate()
  sourcePreview.value = null
  if (editor.isComparingSource) editor.setSourceCompareActive(false)
  scheduleDraw()
}

function clearInvalidInteractionCells() {
  const grid = props.grid
  if (
    !grid ||
    !Number.isSafeInteger(grid.width) ||
    !Number.isSafeInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.cells.length !== grid.width * grid.height
  ) {
    editor.setSelectedCell(null)
    clearPointerFeedback()
    if (editor.isComparingSource) editor.setSourceCompareActive(false)
    return
  }

  const selected = editor.selectedCell
  if (selected) {
    if (
      selected.row < 0 ||
      selected.row >= grid.height ||
      selected.column < 0 ||
      selected.column >= grid.width
    ) {
      editor.setSelectedCell(null)
    } else {
      const index = selected.row * grid.width + selected.column
      if (selected.index !== index) editor.setSelectedCell({ ...selected, index })
    }
  }

  if (
    hoveredCell.value &&
    (hoveredCell.value.row < 0 ||
      hoveredCell.value.row >= grid.height ||
      hoveredCell.value.column < 0 ||
      hoveredCell.value.column >= grid.width)
  ) {
    hoveredCell.value = null
  }
  if (
    previewCell.value &&
    (previewCell.value.row < 0 ||
      previewCell.value.row >= grid.height ||
      previewCell.value.column < 0 ||
      previewCell.value.column >= grid.width)
  ) {
    previewCell.value = null
  }
}

function handleWindowBlur() {
  clearDrag()
  spacePressed = false
}

watch(
  () => props.projectId,
  (projectId, previousProjectId) => {
    if (projectId !== previousProjectId) {
      fittedProjectId = null
      editor.setSelectedCell(null)
      clearPointerFeedback()
      invalidateSourcePreview()
    }
    tryInitialFit()
    scheduleDraw()
  },
  { immediate: true },
)
watch(
  () => [props.grid?.cells, props.grid?.width, props.grid?.height],
  () => {
    clearInvalidInteractionCells()
    scheduleDraw()
  },
  { flush: 'post' },
)
watch(
  () => [
    props.source?.originalImage,
    props.source?.originalWidth,
    props.source?.originalHeight,
    props.source?.mimeType,
    props.crop?.x,
    props.crop?.y,
    props.crop?.width,
    props.crop?.height,
    props.crop?.rotation,
    props.crop?.aspectRatio,
  ],
  invalidateSourcePreview,
)
watch(() => editor.showLabels, scheduleDraw)
watch(() => editor.selectedCell, scheduleDraw, { deep: true })
watch(() => [hoveredCell.value, previewCell.value], scheduleDraw, { deep: true })
watch(
  () => editor.isComparingSource,
  (active) => {
    compareRequestSequence += 1
    if (active) void startSourcePreview()
    else scheduleDraw()
  },
)
watch(() => [editor.zoom, editor.panX, editor.panY], scheduleDraw)

onMounted(() => {
  mounted = true
  measureCanvas()
  if (typeof ResizeObserver !== 'undefined' && area.value) {
    resizeObserver = new ResizeObserver(measureCanvas)
    resizeObserver.observe(area.value)
  }
  window.addEventListener('resize', measureCanvas)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
  lastDevicePixelRatio = window.devicePixelRatio || 1
  scheduleDraw()
})

onBeforeUnmount(() => {
  mounted = false
  compareRequestSequence += 1
  sourcePreviewCache.invalidate()
  sourcePreview.value = null
  if (editor.isComparingSource) editor.setSourceCompareActive(false)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureCanvas)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
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
