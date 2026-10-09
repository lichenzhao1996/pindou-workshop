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
    <EditorMiniMap :grid="grid" :project-id="projectId" :canvas-size="canvasSize" />
    <p v-if="!grid" class="canvas-empty" data-testid="canvas-empty">暂无 Grid</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { useProjectStore } from '../../../app/stores/projectStore'
import { MARD_291_PALETTE } from '../../../domain/palette/mard291'
import { EMPTY, MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../../domain/project/constants'
import { getFourConnectedRegion } from '../../../domain/project/fill'
import type { Grid, GridPosition } from '../../../domain/project/grid'
import type { GridCellChange } from '../../../domain/project/operations'
import type { CropState, Project, Source } from '../../../domain/project/types'
import {
  renderBeadGrid,
  type BeadCanvasRenderSummary,
} from '../../../rendering/bead-canvas-renderer'
import { hitTestGridCell, type GridCellHit } from '../../../rendering/hit-test'
import { getGridStrokeSegment } from '../../../rendering/grid-stroke'
import { SourcePreviewCache } from '../../../rendering/source-preview'
import EditorMiniMap from './EditorMiniMap.vue'
import {
  getCanvasBackingSize,
  MAX_ZOOM,
  MIN_ZOOM,
  type CanvasSize,
} from '../../../rendering/viewport'

const props = withDefaults(
  defineProps<{
    project?: Project | null
    grid: Grid | null
    projectId: string | null
    source?: Source | null
    crop?: CropState | null
  }>(),
  { project: null, source: null, crop: null },
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

interface PanDrag {
  pointerId: number
  lastX: number
  lastY: number
  kind: 'space-left' | 'middle'
}

interface StrokeGesture {
  kind: 'stroke'
  pointerId: number
  project: Project
  grid: Grid
  projectId: string
  tool: 'brush' | 'eraser'
  value: number
  changes: Map<number, GridCellChange>
  lastCell: GridPosition | null
}

type ActiveGesture = PanDrag | StrokeGesture

const projectStore = useProjectStore()
let activeGesture: ActiveGesture | null = null
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

function clearGesture() {
  const gesture = activeGesture
  activeGesture = null
  if (gesture) releaseCapture(gesture.pointerId)
}

function isStrokeValid(stroke: StrokeGesture): boolean {
  const current = projectStore.currentProject
  return Boolean(
    current &&
    current === stroke.project &&
    current.projectId === stroke.projectId &&
    current.grid === stroke.grid &&
    props.projectId === stroke.projectId &&
    props.grid?.cells === stroke.grid.cells &&
    props.grid.width === stroke.grid.width &&
    props.grid.height === stroke.grid.height &&
    (!props.project ||
      (props.project.projectId === stroke.projectId &&
        props.project.grid?.cells === stroke.grid.cells)) &&
    editor.activeTool === stroke.tool &&
    !editor.isComparingSource,
  )
}

function cancelStrokeIfStale() {
  const gesture = activeGesture
  if (gesture?.kind === 'stroke' && !isStrokeValid(gesture)) clearGesture()
}

function currentEditableProject(): Project | null {
  const project = projectStore.currentProject
  if (
    !project ||
    !project.grid ||
    project.projectId !== props.projectId ||
    !props.grid ||
    project.grid.cells !== props.grid.cells ||
    project.grid.width !== props.grid.width ||
    project.grid.height !== props.grid.height ||
    (props.project &&
      (props.project.projectId !== project.projectId ||
        props.project.grid?.cells !== project.grid.cells))
  ) {
    return null
  }
  return project
}

function addStrokeSegment(stroke: StrokeGesture, hit: GridCellHit) {
  const next = { row: hit.row, column: hit.column }
  const segment = stroke.lastCell ? getGridStrokeSegment(stroke.lastCell, next) : [next]
  for (const cell of segment) {
    if (
      cell.row < 0 ||
      cell.row >= stroke.grid.height ||
      cell.column < 0 ||
      cell.column >= stroke.grid.width
    ) {
      continue
    }
    const index = cell.row * stroke.grid.width + cell.column
    stroke.changes.set(index, { row: cell.row, column: cell.column, value: stroke.value })
  }
  stroke.lastCell = next
}

function beginStroke(event: PointerEvent, hit: GridCellHit, tool: 'brush' | 'eraser') {
  const project = currentEditableProject()
  const grid = project?.grid
  if (!project || !grid) return
  const paletteIndex = editor.activePaletteIndex
  if (
    tool === 'brush' &&
    (paletteIndex === null ||
      !Number.isInteger(paletteIndex) ||
      paletteIndex < MIN_PALETTE_INDEX ||
      paletteIndex > MAX_PALETTE_INDEX)
  ) {
    return
  }

  const stroke: StrokeGesture = {
    kind: 'stroke',
    pointerId: event.pointerId,
    project,
    grid,
    projectId: project.projectId,
    tool,
    value: tool === 'eraser' ? EMPTY : paletteIndex!,
    changes: new Map(),
    lastCell: null,
  }
  addStrokeSegment(stroke, hit)
  activeGesture = stroke
  clearPointerFeedback()
  try {
    area.value?.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best-effort in test and embedded browser contexts.
  }
}

function finishStroke(stroke: StrokeGesture, commit: boolean) {
  if (commit && isStrokeValid(stroke) && stroke.changes.size > 0) {
    projectStore.applyGridOperation(
      { type: 'setCells', changes: [...stroke.changes.values()] },
      stroke.project,
      stroke.grid,
    )
  }
  if (activeGesture === stroke) clearGesture()
}

function applyFill(hit: GridCellHit) {
  const project = currentEditableProject()
  const grid = project?.grid
  if (!project || !grid) return

  let target: number
  if (editor.fillTargetMode === 'empty') {
    target = EMPTY
  } else {
    const paletteIndex = editor.activePaletteIndex
    if (
      paletteIndex === null ||
      !Number.isInteger(paletteIndex) ||
      paletteIndex < MIN_PALETTE_INDEX ||
      paletteIndex > MAX_PALETTE_INDEX
    ) {
      return
    }
    target = paletteIndex
  }

  const sourceValue = grid.cells[hit.index]
  if (sourceValue === target) return
  const changes = getFourConnectedRegion(grid, hit.row, hit.column).map((index) => ({
    row: Math.floor(index / grid.width),
    column: index % grid.width,
    value: target,
  }))
  if (changes.length === 0 || projectStore.currentProject !== project || project.grid !== grid)
    return
  projectStore.applyGridOperation({ type: 'setCells', changes }, project, grid)
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.code !== 'Space') return
  spacePressed = false
  if (activeGesture?.kind === 'space-left') clearGesture()
}

function handlePointerDown(event: PointerEvent) {
  if (activeGesture) return
  const kind =
    event.button === 1 ? 'middle' : event.button === 0 && spacePressed ? 'space-left' : null
  if (kind) {
    event.preventDefault()
    clearPointerFeedback()
    activeGesture = {
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
  if (editor.activeTool === 'select') {
    hoveredCell.value = hit
    previewCell.value = hit
    editor.setSelectedCell(hit)
    scheduleDraw()
    return
  }
  if (!hit) return

  if (editor.activeTool === 'brush' || editor.activeTool === 'eraser') {
    beginStroke(event, hit, editor.activeTool)
    return
  }
  if (editor.activeTool === 'eyedropper') {
    const project = currentEditableProject()
    if (!project?.grid) return
    const value = project.grid.cells[hit.index]
    if (value >= MIN_PALETTE_INDEX && value <= MAX_PALETTE_INDEX) {
      editor.selectPaletteIndex(value)
    }
    return
  }
  if (editor.activeTool === 'fill') applyFill(hit)
}

function handlePointerMove(event: PointerEvent) {
  const gesture = activeGesture
  if (gesture?.pointerId === event.pointerId) {
    if (gesture.kind === 'stroke') {
      if (!isStrokeValid(gesture)) {
        clearGesture()
        return
      }
      const hit = hitTest(event.clientX, event.clientY)
      if (!hit) {
        gesture.lastCell = null
        return
      }
      addStrokeSegment(gesture, hit)
      return
    }

    const deltaX = event.clientX - gesture.lastX
    const deltaY = event.clientY - gesture.lastY
    gesture.lastX = event.clientX
    gesture.lastY = event.clientY
    editor.panBy(deltaX, deltaY)
    return
  }

  if (activeGesture || editor.isComparingSource) return
  const hit = hitTest(event.clientX, event.clientY)
  hoveredCell.value = hit
  previewCell.value = hit
  scheduleDraw()
}

function handlePointerEnd(event: PointerEvent) {
  const gesture = activeGesture
  if (gesture?.pointerId !== event.pointerId) return
  if (gesture.kind === 'stroke') {
    if (event.type === 'pointerup' && isStrokeValid(gesture)) {
      const hit = hitTest(event.clientX, event.clientY)
      if (hit) addStrokeSegment(gesture, hit)
      else gesture.lastCell = null
    }
    finishStroke(gesture, event.type === 'pointerup')
    return
  }
  clearGesture()
}

function handlePointerLeave() {
  if (activeGesture?.kind === 'stroke') activeGesture.lastCell = null
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
  clearGesture()
  spacePressed = false
}

watch(
  () => props.projectId,
  (projectId, previousProjectId) => {
    if (projectId !== previousProjectId) {
      fittedProjectId = null
      clearGesture()
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
  () => editor.historyRestoreVersion,
  () => {
    hoveredCell.value = null
    previewCell.value = null
    clearInvalidInteractionCells()
    scheduleDraw()
  },
)
watch(
  () => [props.project, props.projectId, props.grid, projectStore.currentProject],
  () => {
    cancelStrokeIfStale()
  },
  { flush: 'sync' },
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
    if (active) {
      if (activeGesture?.kind === 'stroke') clearGesture()
      void startSourcePreview()
    } else scheduleDraw()
  },
)
watch(
  () => editor.activeTool,
  (tool) => {
    const gesture = activeGesture
    if (gesture?.kind === 'stroke' && gesture.tool !== tool) clearGesture()
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
  clearGesture()
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
