<template>
  <div class="viewport-toolbar" role="toolbar" aria-label="画布视口" data-testid="editor-toolbar">
    <div class="viewport-actions">
      <button
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
    </div>
    <p>滚轮缩放 · 空格 + 左键 / 中键平移</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import type { Grid } from '../../../domain/project/grid'
import { MAX_ZOOM, MIN_ZOOM, type CanvasSize } from '../../../rendering/viewport'

const props = defineProps<{ grid: Grid | null; canvasSize: CanvasSize }>()
const editor = useEditorStore()
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
