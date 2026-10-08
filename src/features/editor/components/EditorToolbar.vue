<template>
  <div class="viewport-toolbar" role="toolbar" aria-label="画布视口" data-testid="editor-toolbar">
    <div class="viewport-actions">
      <button
        ref="compareButton"
        type="button"
        data-testid="viewport-zoom-out"
        :disabled="!canOperate || editor.zoom <= MIN_ZOOM"
        @click="editor.zoomOut(anchor)"
      >
        缩小
      </button>
      <button
        type="button"
        data-testid="viewport-zoom-in"
        :disabled="!canOperate || editor.zoom >= MAX_ZOOM"
        @click="editor.zoomIn(anchor)"
      >
        放大
      </button>
      <output data-testid="editor-zoom" aria-label="当前缩放"
        >{{ Math.round(editor.zoom * 100) }}%</output
      >
      <button
        type="button"
        data-testid="viewport-reset"
        :disabled="!canOperate"
        @click="editor.resetZoom(anchor)"
      >
        100%
      </button>
      <button type="button" data-testid="viewport-center" :disabled="!canOperate" @click="center">
        回到中心
      </button>
      <button type="button" data-testid="viewport-fit" :disabled="!canOperate" @click="fit">
        自适应
      </button>
      <button
        type="button"
        data-testid="editor-label-toggle"
        :aria-pressed="editor.showLabels"
        :disabled="!canOperate"
        @click="editor.toggleLabels()"
      >
        {{ editor.showLabels ? '隐藏色号' : '显示色号' }}
      </button>
      <button
        type="button"
        data-testid="editor-source-compare"
        aria-label="按住查看原图"
        :aria-pressed="editor.isComparingSource"
        :disabled="!canOperate"
        @pointerdown="beginPointerCompare"
        @pointerup="endPointerCompare"
        @pointercancel="endPointerCompare"
        @pointerleave="endPointerCompare"
        @lostpointercapture="endPointerCompare"
        @keydown="beginKeyboardCompare"
        @keyup="endKeyboardCompare"
        @blur="endCompare"
        @contextmenu.prevent
      >
        按住查看原图
      </button>
    </div>
    <p>滚轮缩放 · 空格 + 左键 / 中键平移</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import type { Grid } from '../../../domain/project/grid'
import { MAX_ZOOM, MIN_ZOOM, type CanvasSize } from '../../../rendering/viewport'

const props = defineProps<{ grid: Grid | null; canvasSize: CanvasSize }>()
const editor = useEditorStore()
const compareButton = ref<HTMLButtonElement | null>(null)
let activePointerId: number | null = null
let activeKeyboardKey: 'Space' | 'Enter' | null = null
const canOperate = computed(
  () => props.grid !== null && props.canvasSize.width > 0 && props.canvasSize.height > 0,
)
const anchor = computed(() => ({ x: props.canvasSize.width / 2, y: props.canvasSize.height / 2 }))

function center() {
  if (props.grid && canOperate.value) editor.centerGrid(props.grid, props.canvasSize)
}

function fit() {
  if (props.grid && canOperate.value) editor.fitGrid(props.grid, props.canvasSize)
}

function beginPointerCompare(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || activePointerId !== null) return
  event.preventDefault()
  activePointerId = event.pointerId
  editor.setSourceCompareActive(true)
  try {
    ;(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture may be unavailable in test or embedded browser contexts.
  }
}

function endPointerCompare(event: PointerEvent) {
  if (activePointerId === null || event.pointerId !== activePointerId) return
  endCompare()
}

function handleWindowPointerEnd(event: PointerEvent) {
  if (activePointerId !== null && event.pointerId === activePointerId) endCompare()
}

function beginKeyboardCompare(event: KeyboardEvent) {
  if ((event.code !== 'Space' && event.code !== 'Enter') || event.repeat) return
  event.preventDefault()
  activeKeyboardKey = event.code
  editor.setSourceCompareActive(true)
}

function endKeyboardCompare(event: KeyboardEvent) {
  if (activeKeyboardKey !== event.code) return
  endCompare()
}

function handleWindowKeyUp(event: KeyboardEvent) {
  if (activeKeyboardKey === event.code) endCompare()
}

function endCompare() {
  const pointerId = activePointerId
  activePointerId = null
  activeKeyboardKey = null
  editor.setSourceCompareActive(false)
  if (pointerId === null) return
  try {
    if (compareButton.value?.hasPointerCapture(pointerId)) {
      compareButton.value.releasePointerCapture(pointerId)
    }
  } catch {
    // Capture can already be released after pointercancel or lostpointercapture.
  }
}

watch(
  () => editor.isComparingSource,
  (active) => {
    if (active) return
    const pointerId = activePointerId
    activePointerId = null
    activeKeyboardKey = null
    if (pointerId === null) return
    try {
      if (compareButton.value?.hasPointerCapture(pointerId)) {
        compareButton.value.releasePointerCapture(pointerId)
      }
    } catch {
      // The control may already have released capture during a Project switch.
    }
  },
)

onMounted(() => {
  window.addEventListener('pointerup', handleWindowPointerEnd)
  window.addEventListener('pointercancel', handleWindowPointerEnd)
  window.addEventListener('keyup', handleWindowKeyUp)
  window.addEventListener('blur', endCompare)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', handleWindowPointerEnd)
  window.removeEventListener('pointercancel', handleWindowPointerEnd)
  window.removeEventListener('keyup', handleWindowKeyUp)
  window.removeEventListener('blur', endCompare)
  endCompare()
})
</script>

<style scoped>
.viewport-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
}

.viewport-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

button {
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--color-action);
  color: var(--color-action);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

output {
  min-width: 4em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
