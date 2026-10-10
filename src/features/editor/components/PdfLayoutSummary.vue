<template>
  <section
    class="pdf-layout-summary"
    data-testid="pdf-layout-summary"
    aria-label="PDF 布局与分页设置"
  >
    <h3>PDF 布局与分页</h3>
    <dl>
      <div>
        <dt>纸张</dt>
        <dd data-testid="pdf-default-paper">{{ input.paper }}</dd>
      </div>
      <div>
        <dt>方向</dt>
        <dd data-testid="pdf-default-orientation">自动</dd>
      </div>
      <div>
        <dt>页边距</dt>
        <dd data-testid="pdf-default-margin">{{ input.marginsMm }} mm</dd>
      </div>
      <div>
        <dt>目标单格</dt>
        <dd data-testid="pdf-default-cell-size">
          {{ input.targetCellMm }} mm（{{ input.readableCellMmRange.min }}～{{
            input.readableCellMmRange.max
          }}
          mm）
        </dd>
      </div>
    </dl>

    <div class="pdf-display-options" data-testid="pdf-display-options">
      <label class="pdf-option">
        <input
          data-testid="pdf-show-grid"
          type="checkbox"
          :checked="settings.showGrid"
          @change="updateBooleanSetting('showGrid', $event)"
        />
        网格
      </label>
      <label class="pdf-option">
        <input
          data-testid="pdf-show-coordinates"
          type="checkbox"
          :checked="settings.showCoordinates"
          @change="updateBooleanSetting('showCoordinates', $event)"
        />
        行列坐标
      </label>
      <label class="pdf-option">
        <input
          data-testid="pdf-show-ten-cell-guides"
          type="checkbox"
          :checked="settings.showTenCellGuides"
          @change="updateBooleanSetting('showTenCellGuides', $event)"
        />
        每 10 格粗线
      </label>
      <label class="pdf-option">
        <input
          data-testid="pdf-show-labels"
          type="checkbox"
          :checked="settings.showLabels"
          :disabled="settings.colorMode === 'monochrome'"
          @change="updateBooleanSetting('showLabels', $event)"
        />
        色号
      </label>
      <label class="pdf-option">
        <input
          data-testid="pdf-include-materials"
          type="checkbox"
          :checked="settings.includeMaterials"
          @change="updateBooleanSetting('includeMaterials', $event)"
        />
        材料清单
      </label>
      <label class="pdf-color-mode">
        颜色模式
        <select
          data-testid="pdf-color-mode"
          :value="settings.colorMode"
          @change="updateColorMode($event)"
        >
          <option value="color">彩色</option>
          <option value="monochrome">黑白</option>
        </select>
      </label>
      <p v-if="settings.colorMode === 'monochrome'" class="pdf-mode-note">
        黑白图纸必须保留色号以区分颜色。
      </p>
    </div>

    <div v-if="plan" class="pagination-settings" data-testid="pdf-pagination-settings">
      <label>
        每页横向格数
        <input
          data-testid="pdf-manual-columns"
          type="number"
          min="1"
          step="1"
          :value="manualCells?.columns ?? automaticPlan?.columnsPerPage"
          :aria-invalid="columnsInvalid ? 'true' : 'false'"
          @input="onColumnsInput"
        />
      </label>
      <label>
        每页纵向格数
        <input
          data-testid="pdf-manual-rows"
          type="number"
          min="1"
          step="1"
          :value="manualCells?.rows ?? automaticPlan?.rowsPerPage"
          :aria-invalid="rowsInvalid ? 'true' : 'false'"
          @input="onRowsInput"
        />
      </label>
      <p data-testid="pdf-pagination-estimate">
        预计 {{ plan.estimatedPageCount }} 页分页图 · 单格 {{ plan.cellSizeMm.toFixed(2) }} mm
      </p>
      <p v-if="inputError" role="alert" data-testid="pdf-pagination-input-error">
        {{ inputError }}
      </p>
      <p v-if="readabilityWarning" role="status" data-testid="pdf-readability-warning">
        {{ readabilityWarning }}仍可继续导出。
      </p>
      <button
        v-if="manualCells"
        type="button"
        data-testid="pdf-reset-pagination"
        @click="$emit('update:manualCells', null)"
      >
        恢复自动推荐
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Grid } from '../../../domain/project/grid'
import {
  createDefaultPdfExportSettings,
  createDefaultPdfLayoutInput,
  type PdfExportSettings,
  type PdfManualCells,
} from '../../export/pdf/layout'
import { recommendPdfPagination } from '../../export/pdf/pagination'

const props = withDefaults(
  defineProps<{
    grid?: Pick<Grid, 'width' | 'height'> | null
    manualCells?: PdfManualCells | null
    settings?: PdfExportSettings
  }>(),
  { grid: null, manualCells: null, settings: undefined },
)
const emit = defineEmits<{
  'update:manualCells': [value: PdfManualCells | null]
  'update:settings': [value: PdfExportSettings]
}>()

const settings = computed(() => props.settings ?? createDefaultPdfExportSettings())
const input = computed(() => ({ ...createDefaultPdfLayoutInput(), ...settings.value }))
const columnsInvalid = ref(false)
const rowsInvalid = ref(false)
const inputError = ref('')
const automaticPlan = computed(() =>
  props.grid ? recommendPdfPagination(props.grid, input.value) : null,
)
const plan = computed(() => {
  if (!props.grid) return null
  return recommendPdfPagination(props.grid, {
    ...input.value,
    manualCells: props.manualCells ?? null,
  })
})
const readabilityWarning = computed(() => {
  if (!plan.value) return ''
  const belowMinimum = plan.value.cellSizeMm < input.value.readableCellMmRange.min
  const labelTooSmall = plan.value.labelFontSizePt <= 4
  if (!belowMinimum && !labelTooSmall) return ''
  return `可读性警告：当前单格 ${plan.value.cellSizeMm.toFixed(2)} mm，色号可能较难辨认；`
})

function updateBooleanSetting(key: Exclude<keyof PdfExportSettings, 'colorMode'>, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  emit('update:settings', { ...settings.value, [key]: checked })
}

function updateColorMode(event: Event) {
  const colorMode = (event.target as HTMLSelectElement).value
  if (colorMode !== 'color' && colorMode !== 'monochrome') return
  emit('update:settings', {
    ...settings.value,
    colorMode,
    showLabels: colorMode === 'monochrome' ? true : settings.value.showLabels,
  })
}

function parsePositiveInteger(event: Event): number | null {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function onColumnsInput(event: Event) {
  const columns = parsePositiveInteger(event)
  if (!columns) {
    columnsInvalid.value = true
    inputError.value = '每页横向和纵向格数都必须是正整数。'
    return
  }
  columnsInvalid.value = false
  inputError.value = ''
  const rows = props.manualCells?.rows ?? automaticPlan.value?.rowsPerPage
  if (rows) emitUpdate({ columns, rows })
}

function onRowsInput(event: Event) {
  const rows = parsePositiveInteger(event)
  if (!rows) {
    rowsInvalid.value = true
    inputError.value = '每页横向和纵向格数都必须是正整数。'
    return
  }
  rowsInvalid.value = false
  inputError.value = ''
  const columns = props.manualCells?.columns ?? automaticPlan.value?.columnsPerPage
  if (columns) emitUpdate({ columns, rows })
}

function emitUpdate(value: PdfManualCells) {
  // The parent captures this confirmed draft into ExportSnapshot when export is requested.
  emit('update:manualCells', value)
}
</script>

<style scoped>
.pdf-layout-summary {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

dl,
.pagination-settings {
  display: grid;
  gap: var(--space-2);
  margin: 0;
}

.pdf-display-options {
  display: grid;
  gap: var(--space-1);
  padding-top: var(--space-2);
  border-top: var(--border-width) solid var(--color-border);
}

.pdf-option {
  justify-content: start;
}

.pdf-option input {
  width: auto;
  margin: 0;
}

.pdf-color-mode select {
  min-width: 7rem;
}

.pdf-mode-note {
  color: var(--color-text-secondary);
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

dt,
dd {
  margin: 0;
}

dd {
  color: var(--color-text);
  text-align: right;
}

label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

input {
  width: 5rem;
}

p {
  margin: 0;
}

[data-testid='pdf-readability-warning'] {
  color: var(--color-warning, #805600);
}

button {
  justify-self: start;
}
</style>
