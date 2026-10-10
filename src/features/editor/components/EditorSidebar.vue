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
      <div class="project-name-editor" data-testid="project-name-editor">
        <form v-if="isRenaming" class="project-name-form" @submit.prevent="submitRename">
          <label for="project-name-input">作品名称</label>
          <input
            id="project-name-input"
            ref="projectNameInput"
            v-model="draftProjectName"
            data-testid="project-name-input"
            type="text"
            autocomplete="off"
            @keydown.esc.prevent.stop="cancelRename"
          />
          <div class="project-name-actions">
            <button type="submit" data-testid="project-name-confirm">确认</button>
            <button type="button" data-testid="project-name-cancel" @click="cancelRename">
              取消
            </button>
          </div>
        </form>
        <template v-else>
          <p data-testid="editor-project-name">{{ project.projectName }}</p>
          <button
            ref="renameButton"
            type="button"
            data-testid="project-name-rename"
            @click="beginRename"
          >
            重命名
          </button>
        </template>
      </div>
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
        :disabled="!canApplyCurrentColor || replacementPreviewActive"
        @click="applyCurrentColor"
      >
        应用当前颜色
      </button>
    </section>
    <EditorColorManagement
      :project="project"
      :material-view="materialView"
      @replacement-preview="handleReplacementPreview"
    />
    <RouterLink to="/crop">返回裁剪与生成设置</RouterLink>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { GENERATION_MODE_LABELS } from '../../../domain/generation/mode'
import { useEditorStore } from '../../../app/stores/editorStore'
import { useProjectStore } from '../../../app/stores/projectStore'
import { getPaletteEntryByIndex, MARD_291_PALETTE } from '../../../domain/palette'
import { MAX_PALETTE_INDEX, MIN_PALETTE_INDEX } from '../../../domain/project/constants'
import { deriveProjectStats } from '../../../domain/project/stats'
import type { Project } from '../../../domain/project/types'
import type { ReplacementPreview } from '../replacement-preview'
import { deriveMaterialStatsView } from '../materials/material-stats-view'
import EditorColorManagement from './EditorColorManagement.vue'

const props = defineProps<{ project: Project | null }>()
const emit = defineEmits<{ 'replacement-preview': [preview: ReplacementPreview | null] }>()
const stats = computed(() => (props.project?.grid ? deriveProjectStats(props.project) : null))
const materialView = computed(() => deriveMaterialStatsView(stats.value))
const editor = useEditorStore()
const projectStore = useProjectStore()
const replacementPreviewActive = ref(false)
const isRenaming = ref(false)
const draftProjectName = ref('')
const draftProjectId = ref<string | null>(null)
const projectNameInput = ref<HTMLInputElement | null>(null)
const renameButton = ref<HTMLButtonElement | null>(null)
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

function handleReplacementPreview(preview: ReplacementPreview | null) {
  const current = projectStore.currentProject
  const valid = Boolean(
    preview &&
    current?.projectId === preview.projectId &&
    current.grid?.cells === preview.grid.cells &&
    props.project?.projectId === preview.projectId,
  )
  replacementPreviewActive.value = valid
  emit('replacement-preview', valid ? preview : null)
}

function beginRename() {
  const project = props.project
  if (!project) return
  draftProjectName.value = project.projectName
  draftProjectId.value = project.projectId
  isRenaming.value = true
  void nextTick(() => {
    projectNameInput.value?.focus()
    projectNameInput.value?.select()
  })
}

function closeRename(restoreFocus = true) {
  isRenaming.value = false
  draftProjectName.value = props.project?.projectName ?? ''
  draftProjectId.value = null
  if (restoreFocus) void nextTick(() => renameButton.value?.focus())
}

function cancelRename() {
  closeRename()
}

function submitRename() {
  const expectedProjectId = draftProjectId.value
  const current = projectStore.currentProject
  if (
    !expectedProjectId ||
    props.project?.projectId !== expectedProjectId ||
    current?.projectId !== expectedProjectId
  ) {
    closeRename(false)
    return
  }
  projectStore.renameProject(draftProjectName.value, expectedProjectId)
  closeRename()
}

watch(
  () => props.project?.projectId,
  (projectId, previousProjectId) => {
    if (isRenaming.value && projectId !== previousProjectId) closeRename(false)
  },
  { flush: 'sync' },
)

function applyCurrentColor() {
  if (!canApplyCurrentColor.value || replacementPreviewActive.value) return
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

.project-name-editor {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.project-name-form {
  display: grid;
  gap: var(--space-2);
}

.project-name-form input {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-text-primary);
}

.project-name-actions {
  display: flex;
  gap: var(--space-2);
}

.project-name-actions button,
.project-name-editor > button {
  justify-self: start;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-action);
  cursor: pointer;
}
</style>
