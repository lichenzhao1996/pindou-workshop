import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../domain/project/constants'
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

export interface SelectedCell {
  readonly row: number
  readonly column: number
  readonly index: number
}

/** Holds shared, in-memory editor runtime state; it is not Project data. */
export const useEditorStore = defineStore('editor', () => {
  const activeTool = ref<string | null>(null)
  const activePaletteIndex = ref<number | null>(null)
  const recentPaletteIndexes = ref<number[]>([])
  const showLabels = ref(false)
  const selectedCell = ref<SelectedCell | null>(null)
  const isComparingSource = ref(false)
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
    if (index !== null && !isValidPaletteIndex(index)) return
    activePaletteIndex.value = index
  }

  function selectPaletteIndex(index: number): boolean {
    if (!isValidPaletteIndex(index)) return false

    activePaletteIndex.value = index
    recentPaletteIndexes.value = [
      index,
      ...recentPaletteIndexes.value.filter((recentIndex) => recentIndex !== index),
    ].slice(0, 8)
    return true
  }

  function isValidPaletteIndex(index: number): boolean {
    return Number.isInteger(index) && index >= MIN_PALETTE_INDEX && index <= MAX_PALETTE_INDEX
  }

  function toggleLabels() {
    showLabels.value = !showLabels.value
  }

  function setSelectedCell(cell: SelectedCell | null) {
    selectedCell.value = cell ? { row: cell.row, column: cell.column, index: cell.index } : null
  }

  function setSourceCompareActive(active: boolean) {
    isComparingSource.value = active
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
    recentPaletteIndexes.value = []
    showLabels.value = false
    selectedCell.value = null
    isComparingSource.value = false
    zoom.value = 1
    panX.value = 0
    panY.value = 0
  }

  return {
    activeTool,
    activePaletteIndex,
    recentPaletteIndexes,
    showLabels,
    selectedCell,
    isComparingSource,
    zoom,
    panX,
    panY,
    viewport,
    setActiveTool,
    setActivePaletteIndex,
    selectPaletteIndex,
    toggleLabels,
    setSelectedCell,
    setSourceCompareActive,
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
