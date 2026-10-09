<template>
  <aside class="editor-sidebar" aria-label="作品信息与输出" data-testid="editor-sidebar">
    <h2>作品信息</h2>
    <section
      v-if="project?.grid && stats"
      data-testid="editor-grid"
      :data-project-id="project.projectId"
      :data-width="project.grid.width"
      :data-height="project.grid.height"
      :data-cell-count="project.grid.cells.length"
      :data-grid-encoding="project.grid.cells.constructor.name"
      :data-palette-indices="stats.usedPaletteIndices.join(',')"
      :data-revision="project.revision"
    >
      <p>{{ project.projectName }}</p>
      <p data-testid="editor-dimensions">{{ project.grid.width }} × {{ project.grid.height }} 颗</p>
      <p data-testid="editor-mode">{{ GENERATION_MODE_LABELS[project.generation.mode] }}</p>
      <p data-testid="editor-beads">
        {{ stats.totalBeads }} 颗拼豆，{{ stats.usedColorCount }} 种颜色
      </p>
      <p v-if="project.generation.mode === 'optimized'" class="editor-note">
        已完成轮廓保护、保守碎色合并与基础背景简化。
      </p>
    </section>
    <p v-else data-testid="editor-info-empty">暂无生成作品信息。</p>
    <h2>颜色与输出</h2>
    <section class="single-cell-edit" aria-label="单格颜色操作">
      <p v-if="selectedCell" data-testid="editor-selected-cell">
        已选中第 {{ selectedCell.row + 1 }} 行、第 {{ selectedCell.column + 1 }} 列
      </p>
      <p v-else class="editor-note">先在画布中选择一个格子。</p>
      <p v-if="activeColor" data-testid="editor-active-color">
        当前颜色：{{ activeColor.displayCode }} {{ activeColor.name }}
      </p>
      <button
        type="button"
        data-testid="apply-current-color"
        :disabled="!canApplyCurrentColor"
        @click="applyCurrentColor"
      >
        应用当前颜色
      </button>
    </section>
    <RouterLink to="/crop">返回裁剪与生成设置</RouterLink>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { GENERATION_MODE_LABELS } from '../../../domain/generation/mode'
import { useEditorStore } from '../../../app/stores/editorStore'
import { useProjectStore } from '../../../app/stores/projectStore'
import { getPaletteEntryByIndex, MARD_291_PALETTE } from '../../../domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../../domain/project/constants'
import { deriveProjectStats } from '../../../domain/project/stats'
import type { Project } from '../../../domain/project/types'

const props = defineProps<{ project: Project | null }>()
const stats = computed(() => (props.project?.grid ? deriveProjectStats(props.project) : null))
const editor = useEditorStore()
const projectStore = useProjectStore()
const selectedCell = computed(() => editor.selectedCell)
const activeColor = computed(() =>
  editor.activePaletteIndex === null
    ? undefined
    : getPaletteEntryByIndex(MARD_291_PALETTE, editor.activePaletteIndex),
)

const canApplyCurrentColor = computed(() => {
  const project = props.project
  const currentProject = projectStore.currentProject
  const grid = currentProject?.grid
  const cell = editor.selectedCell
  const paletteIndex = editor.activePaletteIndex
  return Boolean(
    project &&
    currentProject &&
    currentProject.projectId === project.projectId &&
    project.grid?.cells === grid?.cells &&
    grid &&
    cell &&
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.column) &&
    cell.row >= 0 &&
    cell.row < grid.height &&
    cell.column >= 0 &&
    cell.column < grid.width &&
    cell.index === cell.row * grid.width + cell.column &&
    paletteIndex !== null &&
    Number.isInteger(paletteIndex) &&
    paletteIndex >= MIN_PALETTE_INDEX &&
    paletteIndex <= MAX_PALETTE_INDEX &&
    !editor.isComparingSource,
  )
})

function applyCurrentColor() {
  if (!canApplyCurrentColor.value) return
  const project = projectStore.currentProject
  const grid = project?.grid
  const cell = editor.selectedCell
  const value = editor.activePaletteIndex
  if (!project || !grid || !cell || value === null) return

  projectStore.applyGridOperation(
    { type: 'setCell', row: cell.row, column: cell.column, value },
    project,
    grid,
  )
}
</script>

<style scoped>
.editor-sidebar {
  min-width: 0;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
}

h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-body);
}

section + h2,
p + h2 {
  margin-top: var(--space-6);
}

p {
  margin: 0 0 var(--space-3);
  overflow-wrap: anywhere;
}

.editor-note {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-body);
}

a {
  display: inline-block;
  margin-top: var(--space-4);
  color: var(--color-action);
}

.single-cell-edit {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.single-cell-edit button {
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-action);
  color: var(--color-on-action, #fff);
  cursor: pointer;
}

.single-cell-edit button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
