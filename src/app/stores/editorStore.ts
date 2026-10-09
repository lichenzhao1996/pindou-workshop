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

export type EditorTool = 'select' | 'brush' | 'eraser' | 'eyedropper' | 'fill'
export type FillTargetMode = 'active-color' | 'empty'

/** Holds shared, in-memory editor runtime state; it is not Project data. */
export const useEditorStore = defineStore('editor', () => {
  const activeTool = ref<EditorTool>('select')
  const fillTargetMode = ref<FillTargetMode>('active-color')
  const activePaletteIndex = ref<number | null>(null)
  const recentPaletteIndexes = ref<number[]>([])
  const highlightedPaletteIndex = ref<number | null>(null)
  const showLabels = ref(false)
  const selectedCell = ref<SelectedCell | null>(null)
  const historyRestoreVersion = ref(0)
  const minimapCollapsed = ref(false)
  const isComparingSource = ref(false)
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const viewport = computed<Viewport>(() => ({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
  }))

  function setActiveTool(tool: EditorTool) {
    activeTool.value = tool
  }

  function setFillTargetMode(mode: FillTargetMode) {
    fillTargetMode.value = mode
  }

  function setActivePaletteIndex(index: number | null) {
    if (index !== null && !isValidPaletteIndex(index)) return
    activePaletteIndex.value = index
  }

  function selectPaletteIndex(index: number): boolean {
    if (!isValidPaletteIndex(index)) return false

    activePaletteIndex.value = index
    recordRecentPaletteIndex(index)
    return true
  }

  function recordRecentPaletteIndex(index: number): boolean {
    if (!isValidPaletteIndex(index)) return false
    recentPaletteIndexes.value = [
      index,
      ...recentPaletteIndexes.value.filter((recentIndex) => recentIndex !== index),
    ].slice(0, 8)
    return true
  }

  function setHighlightedPaletteIndex(index: number | null) {
    if (index !== null && !isValidPaletteIndex(index)) return
    highlightedPaletteIndex.value = index
  }

  function toggleHighlightedPaletteIndex(index: number): boolean {
    if (!isValidPaletteIndex(index)) return false
    highlightedPaletteIndex.value = highlightedPaletteIndex.value === index ? null : index
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

  function markHistoryRestore() {
    historyRestoreVersion.value += 1
  }

  function toggleMiniMap() {
    minimapCollapsed.value = !minimapCollapsed.value
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
    activeTool.value = 'select'
    fillTargetMode.value = 'active-color'
    activePaletteIndex.value = null
    recentPaletteIndexes.value = []
    highlightedPaletteIndex.value = null
    showLabels.value = false
    selectedCell.value = null
    isComparingSource.value = false
    zoom.value = 1
    panX.value = 0
    panY.value = 0
  }

  return {
    activeTool,
    fillTargetMode,
    activePaletteIndex,
    recentPaletteIndexes,
    highlightedPaletteIndex,
    showLabels,
    selectedCell,
    historyRestoreVersion,
    minimapCollapsed,
    isComparingSource,
    zoom,
    panX,
    panY,
    viewport,
    setActiveTool,
    setFillTargetMode,
    setActivePaletteIndex,
    selectPaletteIndex,
    recordRecentPaletteIndex,
    setHighlightedPaletteIndex,
    toggleHighlightedPaletteIndex,
    toggleLabels,
    setSelectedCell,
    markHistoryRestore,
    toggleMiniMap,
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
