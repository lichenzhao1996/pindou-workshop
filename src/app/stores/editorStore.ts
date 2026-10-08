import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Grid } from '../../domain/project/grid'
import {
  clampZoom,
  centerViewport,
  fitViewport,
  zoomViewportAt,
  ZOOM_FACTOR,
  type CanvasSize,
  type Point,
  type Viewport,
} from '../../rendering/viewport'

/**
 * Holds only editor state shared by multiple core components.
 *
 * The tool and palette index are intentionally primitive boundary values until
 * the later editor and Palette tasks define their domain types. Search text,
 * hover, pointer coordinates, dialogs and other transient UI state stay local
 * to their owning components.
 */
export const useEditorStore = defineStore('editor', () => {
  const activeTool = ref<string | null>(null)
  const activePaletteIndex = ref<number | null>(null)
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const viewport = computed<Viewport>(() => ({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
  }))

  function setActiveTool(tool: string | null) {
    activeTool.value = tool
  }

  function setActivePaletteIndex(index: number | null) {
    activePaletteIndex.value = index
  }

  function setViewport(next: Viewport) {
    zoom.value = clampZoom(next.zoom)
    panX.value = Number.isFinite(next.panX) ? next.panX : 0
    panY.value = Number.isFinite(next.panY) ? next.panY : 0
  }

  function setZoom(nextZoom: number, anchor?: Point) {
    const next = anchor
      ? zoomViewportAt(viewport.value, nextZoom, anchor)
      : { ...viewport.value, zoom: clampZoom(nextZoom) }
    setViewport(next)
  }

  function zoomIn(anchor?: Point) {
    setZoom(zoom.value * ZOOM_FACTOR, anchor)
  }

  function zoomOut(anchor?: Point) {
    setZoom(zoom.value / ZOOM_FACTOR, anchor)
  }

  function resetZoom(anchor?: Point) {
    setZoom(1, anchor)
  }

  function panBy(deltaX: number, deltaY: number) {
    panX.value += Number.isFinite(deltaX) ? deltaX : 0
    panY.value += Number.isFinite(deltaY) ? deltaY : 0
  }

  function centerGrid(grid: Grid, size: CanvasSize) {
    setViewport(centerViewport(grid, size, zoom.value))
  }

  function fitGrid(grid: Grid, size: CanvasSize) {
    setViewport(fitViewport(grid, size))
  }

  function resetEditorState() {
    activeTool.value = null
    activePaletteIndex.value = null
    zoom.value = 1
    panX.value = 0
    panY.value = 0
  }

  return {
    activeTool,
    activePaletteIndex,
    zoom,
    panX,
    panY,
    viewport,
    setActiveTool,
    setActivePaletteIndex,
    setViewport,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    panBy,
    centerGrid,
    fitGrid,
    resetEditorState,
  }
})
