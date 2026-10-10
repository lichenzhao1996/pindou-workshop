<template>
  <section class="color-management" aria-label="已使用颜色管理" data-testid="used-color-management">
    <h3>已使用颜色</h3>
    <p data-testid="used-color-summary">
      {{ materialView?.usedColorCount ?? 0 }} / 291 种颜色 ·
      {{ materialView?.totalBeads ?? 0 }} 颗拼豆
    </p>
    <label for="used-color-search">搜索已使用颜色</label>
    <input
      id="used-color-search"
      v-model="searchQuery"
      data-testid="used-color-search"
      type="search"
      autocomplete="off"
      placeholder="色号、颜色名称或 colorId"
    />
    <label for="used-color-sort">排序</label>
    <select id="used-color-sort" v-model="sortOrder" data-testid="used-color-sort">
      <option value="count">按使用数量</option>
      <option value="displayCode">按色号</option>
    </select>

    <div v-if="visibleRows.length" class="used-color-list" data-testid="used-color-list">
      <div
        v-for="row in visibleRows"
        :key="row.paletteIndex"
        class="used-color-item"
        :data-testid="`used-color-row-${row.paletteIndex}`"
      >
        <button
          type="button"
          class="used-color-main"
          :data-testid="`used-color-highlight-${row.paletteIndex}`"
          :aria-pressed="editor.highlightedPaletteIndex === row.paletteIndex"
          :title="`高亮 ${row.entry.displayCode}`"
          @click="editor.toggleHighlightedPaletteIndex(row.paletteIndex)"
        >
          <span
            class="color-swatch"
            :style="{ backgroundColor: row.entry.hex }"
            aria-hidden="true"
          />
          <span class="used-color-copy">
            <span class="used-color-code">{{ row.entry.displayCode }}</span>
            <span class="used-color-name">{{ row.entry.name }}</span>
          </span>
          <span class="used-color-amount">
            <span>实际：{{ row.count }} 颗</span>
            <span>建议：{{ row.suggestedCount }} 颗</span>
            <span>{{ row.percentage.toFixed(1) }}%</span>
          </span>
        </button>
        <button
          type="button"
          class="replace-color-button"
          :data-testid="`used-color-replace-${row.paletteIndex}`"
          @click="beginReplacement(row.paletteIndex)"
        >
          全局替换
        </button>
      </div>
    </div>
    <p v-else-if="searchQuery.trim()" class="muted" data-testid="used-color-no-results">
      没有找到匹配的已使用颜色。
    </p>
    <p v-else class="muted" data-testid="used-color-empty">
      {{ project?.grid ? '当前作品没有已使用颜色。' : '暂无作品颜色。' }}
    </p>

    <button
      v-if="usedRows.length"
      type="button"
      class="material-list-toggle"
      data-testid="material-list-toggle"
      :aria-expanded="fullMaterialsOpen"
      @click="fullMaterialsOpen = !fullMaterialsOpen"
    >
      {{ fullMaterialsOpen ? '收起完整材料清单' : '查看完整材料清单' }}
    </button>
    <section
      v-if="fullMaterialsOpen && usedRows.length"
      class="full-material-list"
      aria-label="完整材料清单"
      data-testid="full-material-list"
    >
      <h3>完整材料清单</h3>
      <div class="material-list-table-scroll">
        <table data-testid="material-list-table">
          <thead>
            <tr>
              <th scope="col">色号</th>
              <th scope="col">名称</th>
              <th scope="col">实际数量</th>
              <th scope="col">建议准备数量</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in usedRows"
              :key="row.paletteIndex"
              :data-testid="`material-list-row-${row.paletteIndex}`"
            >
              <td>{{ row.entry.displayCode }}</td>
              <td>{{ row.entry.name }}</td>
              <td>{{ row.count }} 颗</td>
              <td>{{ row.suggestedCount }} 颗</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        type="button"
        class="material-list-close"
        data-testid="material-list-close"
        @click="fullMaterialsOpen = false"
      >
        关闭材料清单
      </button>
    </section>

    <section v-if="replacementOpen" class="replacement-panel" data-testid="replacement-panel">
      <h3>全局颜色替换</h3>
      <p v-if="sourceEntry" data-testid="replacement-source">
        源颜色：{{ sourceEntry.displayCode }} {{ sourceEntry.name }}
      </p>
      <UnifiedColorPicker
        :model-value="targetPaletteIndex"
        :project="project"
        :close-on-select="true"
        @update:model-value="selectTarget"
      />
      <div v-if="targetEntry" data-testid="replacement-preview">
        <p>{{ sourceEntry?.displayCode }} → {{ targetEntry.displayCode }}</p>
        <p v-if="sourceCount > 0">将影响 {{ sourceCount }} 颗拼豆。</p>
        <p v-else class="muted">源颜色已不存在，无法替换。</p>
        <p v-if="targetPaletteIndex === sourcePaletteIndex" class="muted">
          源色与目标色相同，无需替换。
        </p>
      </div>
      <p v-if="replacementMessage" class="muted" data-testid="replacement-message">
        {{ replacementMessage }}
      </p>
      <div class="replacement-actions">
        <button
          type="button"
          data-testid="replacement-confirm"
          :disabled="!canConfirm"
          @click="confirmReplacement"
        >
          确认替换
        </button>
        <button type="button" data-testid="replacement-cancel" @click="cancelReplacement">
          取消
        </button>
      </div>
    </section>
    <p
      v-if="replacementMessage && !replacementOpen"
      class="muted"
      data-testid="replacement-message"
    >
      {{ replacementMessage }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useEditorStore } from '../../../app/stores/editorStore'
import { useProjectStore } from '../../../app/stores/projectStore'
import { getPaletteEntryByIndex, MARD_291_PALETTE } from '../../../domain/palette'
import { createPaletteReplacementPlan } from '../../../domain/project/color-replacement'
import type { Grid } from '../../../domain/project/grid'
import type { Project } from '../../../domain/project/types'
import type { ReplacementPreview } from '../replacement-preview'
import type { MaterialStatsView } from '../materials/material-stats-view'
import { filterUsedColorRows, sortUsedColorRows, type UsedColorSort } from '../color-management'
import UnifiedColorPicker from './UnifiedColorPicker.vue'

const props = defineProps<{ project: Project | null; materialView: MaterialStatsView | null }>()
const emit = defineEmits<{ 'replacement-preview': [preview: ReplacementPreview | null] }>()
const editor = useEditorStore()
const projectStore = useProjectStore()
const searchQuery = ref('')
const sortOrder = ref<UsedColorSort>('count')
const fullMaterialsOpen = ref(false)
const usedRows = computed(() => props.materialView?.rows ?? [])
const visibleRows = computed(() =>
  sortUsedColorRows(filterUsedColorRows(usedRows.value, searchQuery.value), sortOrder.value),
)
const replacementOpen = ref(false)
const sourcePaletteIndex = ref<number | null>(null)
const targetPaletteIndex = ref<number | null>(null)
const snapshot = shallowRef<{ projectId: string; grid: Grid } | null>(null)
const replacementMessage = ref('')
const sourceEntry = computed(() =>
  sourcePaletteIndex.value === null
    ? undefined
    : getPaletteEntryByIndex(MARD_291_PALETTE, sourcePaletteIndex.value),
)
const targetEntry = computed(() =>
  targetPaletteIndex.value === null
    ? undefined
    : getPaletteEntryByIndex(MARD_291_PALETTE, targetPaletteIndex.value),
)

function isCurrentSnapshot(): boolean {
  const saved = snapshot.value
  const current = projectStore.currentProject
  return Boolean(
    saved &&
    current &&
    current.projectId === saved.projectId &&
    current.grid?.cells === saved.grid.cells,
  )
}

const sourceCount = computed(() => {
  const source = sourcePaletteIndex.value
  const current = projectStore.currentProject
  if (source === null || !current?.grid || !isCurrentSnapshot()) return 0
  return props.materialView?.rows.find((row) => row.paletteIndex === source)?.count ?? 0
})
const canConfirm = computed(() => {
  const source = sourcePaletteIndex.value
  const target = targetPaletteIndex.value
  return Boolean(
    replacementOpen.value &&
    isCurrentSnapshot() &&
    source !== null &&
    target !== null &&
    source !== target &&
    sourceCount.value > 0 &&
    getPaletteEntryByIndex(MARD_291_PALETTE, source) &&
    getPaletteEntryByIndex(MARD_291_PALETTE, target),
  )
})

function clearReplacement() {
  emit('replacement-preview', null)
  replacementOpen.value = false
  sourcePaletteIndex.value = null
  targetPaletteIndex.value = null
  snapshot.value = null
}

function cancelReplacement() {
  clearReplacement()
  replacementMessage.value = ''
}

function beginReplacement(sourceIndex: number) {
  const current = projectStore.currentProject
  const grid = current?.grid
  if (
    !current ||
    !grid ||
    !usedRows.value.some((row) => row.paletteIndex === sourceIndex && row.count > 0) ||
    !getPaletteEntryByIndex(MARD_291_PALETTE, sourceIndex)
  ) {
    replacementMessage.value = '源颜色已不在当前作品中，请重新选择。'
    return
  }
  replacementOpen.value = true
  sourcePaletteIndex.value = sourceIndex
  targetPaletteIndex.value = null
  snapshot.value = { projectId: current.projectId, grid }
  replacementMessage.value = ''
  emit('replacement-preview', null)
}

function publishPreview() {
  const source = sourcePaletteIndex.value
  const target = targetPaletteIndex.value
  const current = projectStore.currentProject
  const grid = current?.grid
  if (
    !replacementOpen.value ||
    source === null ||
    target === null ||
    !grid ||
    !isCurrentSnapshot() ||
    sourceCount.value === 0 ||
    !getPaletteEntryByIndex(MARD_291_PALETTE, source) ||
    !getPaletteEntryByIndex(MARD_291_PALETTE, target)
  ) {
    emit('replacement-preview', null)
    return
  }
  emit('replacement-preview', {
    projectId: current.projectId,
    grid,
    sourcePaletteIndex: source,
    targetPaletteIndex: target,
  })
}

function selectTarget(index: number) {
  if (!getPaletteEntryByIndex(MARD_291_PALETTE, index)) return
  targetPaletteIndex.value = index
  editor.recordRecentPaletteIndex(index)
  publishPreview()
}

function confirmReplacement() {
  if (!canConfirm.value) return
  const saved = snapshot.value
  const current = projectStore.currentProject
  const grid = current?.grid
  const source = sourcePaletteIndex.value
  const target = targetPaletteIndex.value
  if (!saved || !current || !grid || source === null || target === null) return

  const plan = createPaletteReplacementPlan(grid, source, target)
  if (
    current.projectId !== saved.projectId ||
    grid.cells !== saved.grid.cells ||
    !plan ||
    plan.count === 0 ||
    !plan.operation
  ) {
    replacementMessage.value = '作品已变化或源颜色已不存在，本次替换未提交。'
    clearReplacement()
    return
  }

  clearReplacement()
  if (!projectStore.applyGridOperation(plan.operation, current, grid)) {
    replacementMessage.value = '作品已变化，本次替换未提交。'
  }
}

function invalidateStalePreview() {
  if (!replacementOpen.value || !snapshot.value || isCurrentSnapshot()) return
  replacementMessage.value = '作品已变化，替换预览已取消；请重新发起替换。'
  clearReplacement()
}

watch(
  () => props.project?.projectId,
  () => {
    fullMaterialsOpen.value = false
  },
  { flush: 'sync' },
)

watch(
  () => [
    props.project?.projectId,
    props.project?.grid,
    projectStore.currentProject?.projectId,
    projectStore.currentProject?.grid,
  ],
  invalidateStalePreview,
  { flush: 'sync' },
)

onBeforeUnmount(() => emit('replacement-preview', null))
</script>

<style scoped>
.color-management {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

h3 {
  margin: var(--space-3) 0 var(--space-1);
  font-size: var(--font-size-body);
}

p {
  margin: 0 0 var(--space-2);
  overflow-wrap: anywhere;
}

label,
.muted {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

input,
select {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: var(--space-2);
  color: var(--color-text-primary);
  background: var(--color-panel-background);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.used-color-list {
  display: grid;
  gap: var(--space-2);
}

.material-list-toggle,
.material-list-close {
  justify-self: start;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-action);
  cursor: pointer;
}

.full-material-list {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.material-list-table-scroll {
  overflow-x: auto;
}

.full-material-list table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.full-material-list th,
.full-material-list td {
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-width) solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.used-color-item {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.used-color-main {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}

.used-color-main[aria-pressed='true'] .used-color-code {
  color: var(--color-action);
  font-weight: 700;
}

.color-swatch {
  display: block;
  width: 22px;
  height: 22px;
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.used-color-copy,
.used-color-amount {
  display: grid;
  min-width: 0;
}

.used-color-code,
.used-color-name,
.used-color-amount {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.used-color-name,
.used-color-amount {
  color: var(--color-text-secondary);
}

.used-color-amount {
  text-align: right;
}

.replace-color-button,
.replacement-actions button {
  justify-self: end;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-panel-background);
  color: var(--color-action);
  cursor: pointer;
}

.replacement-panel {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
}

.replacement-actions {
  display: flex;
  gap: var(--space-2);
}

.replacement-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
