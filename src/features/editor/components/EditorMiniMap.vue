<template>
  <section
    class="editor-minimap"
    aria-label="迷你导航图"
    data-testid="editor-minimap"
    :data-collapsed="editor.minimapCollapsed"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @pointercancel.stop
  >
    <div class="minimap-heading">
      <span>导航图</span>
      <button
        type="button"
        data-testid="editor-minimap-toggle"
        :aria-expanded="!editor.minimapCollapsed"
        @click="editor.toggleMiniMap()"
      >
        {{ editor.minimapCollapsed ? '展开' : '收起' }}
      </button>
    </div>
    <div
      v-if="!editor.minimapCollapsed && grid"
      class="minimap-surface"
      data-testid="editor-minimap-surface"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerEnd"
      @pointercancel="handlePointerEnd"
      @lostpointercapture="handleLostPointerCapture"
      @contextmenu.prevent
    >
      <canvas
        ref="canvas"
        data-testid="editor-minimap-canvas"
        aria-label="作品缩略图"
        :data-rendered-beads="renderedBeads"
        :data-highlighted-beads="highlightedBeads"
        :data-dimmed-beads="dimmedBeads"
        :data-highlighted-palette-index="editor.highlightedPaletteIndex ?? ''"
      />
      <div
        v-if="geometry?.frame"
        class="minimap-viewport"
        data-testid="editor-minimap-viewport"
        aria-label="当前画布视野，可拖动导航"
        :style="frameStyle"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { MARD_291_PALETTE } from '../../../domain/palette/mard291'
import { EMPTY } from '../../../domain/project/constants'
import type { Grid } from '../../../domain/project/grid'
import type { Point, Viewport } from '../../../rendering/viewport'
import { getCanvasBackingSize } from '../../../rendering/viewport'
import {
  centerViewportAtMiniMapPoint,
  deriveMiniMapGeometry,
  panViewportByMiniMapDelta,
  type MiniMapGeometry,
} from '../../../rendering/minimap'
import { CELL_SIZE } from '../../../rendering/cell-size'

const props = defineProps<{
  grid: Grid | null
  projectId: string | null
  canvasSize: { width: number; height: number }
}>()

interface MiniMapDrag {
  pointerId: number
  startPoint: Point
  startViewport: Viewport
  geometry: MiniMapGeometry
  moved: boolean
}

const EMPTY_BACKGROUND = '#e8edf2'
const editor = useEditorStore()
const canvas = ref<HTMLCanvasElement | null>(null)
const miniMapSize = reactive({ width: 0, height: 0 })
const geometry = computed(() =>
  deriveMiniMapGeometry(props.grid, miniMapSize, props.canvasSize, editor.viewport),
)
const renderedBeads = ref(0)
const highlightedBeads = ref(0)
const dimmedBeads = ref(0)
let resizeObserver: ResizeObserver | null = null
let drawFrame: number | null = null
let mounted = false
let drag: MiniMapDrag | null = null

const paletteColors = new Map(
  MARD_291_PALETTE.entries.map((entry) => [
    entry.paletteIndex,
    `rgb(${entry.rgb.r} ${entry.rgb.g} ${entry.rgb.b})`,
  ]),
)

const frameStyle = computed(() => {
  const frame = geometry.value?.frame
  return frame
    ? {
        left: `${frame.left}px`,
        top: `${frame.top}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      }
    : undefined
})

function requestFrame(callback: () => void): number {
  return window.requestAnimationFrame
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16)
}

function cancelFrame(frame: number) {
  if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame)
  else window.clearTimeout(frame)
}

function measureSurface() {
  const surface = canvas.value?.parentElement
  if (!surface) return
  const bounds = surface.getBoundingClientRect()
  miniMapSize.width = Math.max(0, bounds.width)
  miniMapSize.height = Math.max(0, bounds.height)
  scheduleDraw()
}

function observeSurface() {
  resizeObserver?.disconnect()
  resizeObserver = null
  const surface = canvas.value?.parentElement
  if (typeof ResizeObserver !== 'undefined' && surface) {
    resizeObserver = new ResizeObserver(measureSurface)
    resizeObserver.observe(surface)
  }
}

function draw() {
  const element = canvas.value
  const grid = props.grid
  if (!element || !grid || !geometry.value || miniMapSize.width <= 0 || miniMapSize.height <= 0) {
    renderedBeads.value = 0
    highlightedBeads.value = 0
    dimmedBeads.value = 0
    return
  }
  const context = element.getContext('2d')
  if (!context) return

  const backing = getCanvasBackingSize(miniMapSize, window.devicePixelRatio || 1)
  if (element.width !== backing.width) element.width = backing.width
  if (element.height !== backing.height) element.height = backing.height
  context.setTransform(backing.dpr, 0, 0, backing.dpr, 0, 0)
  context.clearRect(0, 0, miniMapSize.width, miniMapSize.height)
  context.fillStyle = EMPTY_BACKGROUND
  context.fillRect(0, 0, miniMapSize.width, miniMapSize.height)

  const { artwork, scale } = geometry.value
  let count = 0
  let highlightedCount = 0
  let dimmedCount = 0
  context.save()
  try {
    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const paletteIndex = grid.cells[row * grid.width + column]
        if (paletteIndex === EMPTY) continue
        const color = paletteColors.get(paletteIndex)
        if (!color) continue
        if (editor.highlightedPaletteIndex !== null) {
          if (paletteIndex === editor.highlightedPaletteIndex) highlightedCount += 1
          else dimmedCount += 1
          context.globalAlpha = paletteIndex === editor.highlightedPaletteIndex ? 1 : 0.24
        } else {
          context.globalAlpha = 1
        }
        context.fillStyle = color
        context.fillRect(
          artwork.left + column * CELL_SIZE * scale,
          artwork.top + row * CELL_SIZE * scale,
          CELL_SIZE * scale,
          CELL_SIZE * scale,
        )
        count += 1
      }
    }
  } finally {
    context.restore()
  }
  renderedBeads.value = count
  highlightedBeads.value = highlightedCount
  dimmedBeads.value = dimmedCount
}

function scheduleDraw() {
  if (!mounted || editor.minimapCollapsed || drawFrame !== null) return
  drawFrame = requestFrame(() => {
    drawFrame = null
    draw()
  })
}

function pointInSurface(event: PointerEvent): Point | null {
  const bounds = canvas.value?.getBoundingClientRect()
  if (!bounds) return null
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function finishDrag(release = true) {
  const active = drag
  drag = null
  if (!active || !release) return
  const surface = canvas.value?.parentElement
  try {
    if (surface?.hasPointerCapture(active.pointerId))
      surface.releasePointerCapture(active.pointerId)
  } catch {
    // Pointer capture may already be released by pointercancel or unmount.
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!props.grid || !geometry.value) return
  if (event.button !== 0 || event.isPrimary === false) return
  const point = pointInSurface(event)
  if (!point) return
  const target = event.target
  const isFrame = target instanceof Element && target.closest('.minimap-viewport') !== null
  if (isFrame) {
    event.preventDefault()
    drag = {
      pointerId: event.pointerId,
      startPoint: point,
      startViewport: { ...editor.viewport },
      geometry: geometry.value,
      moved: false,
    }
    try {
      canvas.value?.parentElement?.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort for embedded browser contexts.
    }
    return
  }

  const next = centerViewportAtMiniMapPoint(
    point,
    geometry.value,
    props.canvasSize,
    editor.viewport,
  )
  if (next) editor.setViewport(next)
}

function handlePointerMove(event: PointerEvent) {
  const active = drag
  if (!active || active.pointerId !== event.pointerId) return
  const point = pointInSurface(event)
  if (!point) return
  const delta = { x: point.x - active.startPoint.x, y: point.y - active.startPoint.y }
  if (!active.moved && Math.hypot(delta.x, delta.y) < 2) return
  active.moved = true
  editor.setViewport(panViewportByMiniMapDelta(active.startViewport, active.geometry, delta))
}

function handlePointerEnd(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return
  const active = drag
  if (event.type === 'pointerup' && !active.moved) {
    const point = pointInSurface(event)
    const next = point
      ? centerViewportAtMiniMapPoint(point, active.geometry, props.canvasSize, active.startViewport)
      : null
    if (next) editor.setViewport(next)
  }
  finishDrag()
}

function handleLostPointerCapture(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) finishDrag(false)
}

function handleWindowBlur() {
  finishDrag()
}

watch(
  () => [props.projectId, props.grid?.cells, props.grid?.width, props.grid?.height],
  () => {
    finishDrag()
    scheduleDraw()
  },
)
watch(() => [props.canvasSize.width, props.canvasSize.height], scheduleDraw)
watch(() => [editor.zoom, editor.panX, editor.panY], scheduleDraw)
watch(() => editor.highlightedPaletteIndex, scheduleDraw)
watch(
  () => editor.minimapCollapsed,
  (collapsed) => {
    finishDrag()
    if (collapsed) {
      resizeObserver?.disconnect()
      resizeObserver = null
    } else {
      void nextTick(() => {
        measureSurface()
        observeSurface()
      })
    }
  },
)

onMounted(() => {
  mounted = true
  measureSurface()
  observeSurface()
  window.addEventListener('resize', measureSurface)
  window.addEventListener('blur', handleWindowBlur)
  scheduleDraw()
})

onBeforeUnmount(() => {
  mounted = false
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measureSurface)
  window.removeEventListener('blur', handleWindowBlur)
  finishDrag()
  if (drawFrame !== null) cancelFrame(drawFrame)
  drawFrame = null
})
</script>

<style scoped>
.editor-minimap {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: 2;
  width: 208px;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-panel-background) 94%, transparent);
  box-shadow: 0 2px 8px rgb(16 24 40 / 18%);
}

.minimap-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.minimap-heading button {
  padding: 2px var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
  cursor: pointer;
}

.minimap-surface {
  position: relative;
  width: 196px;
  height: 136px;
  overflow: hidden;
  background: var(--color-canvas-background);
  touch-action: none;
  cursor: crosshair;
}

.minimap-surface canvas,
.minimap-input {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.minimap-viewport {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  border: 1px solid var(--color-action);
  background: color-mix(in srgb, var(--color-action) 16%, transparent);
  cursor: move;
  pointer-events: auto;
}

.minimap-viewport::after {
  position: absolute;
  inset: -4px;
  content: '';
}
</style>
