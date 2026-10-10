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
import { createDefaultPdfLayoutInput, type PdfManualCells } from '../../export/pdf/layout'
import { recommendPdfPagination } from '../../export/pdf/pagination'

const props = withDefaults(
  defineProps<{
    grid?: Pick<Grid, 'width' | 'height'> | null
    manualCells?: PdfManualCells | null
  }>(),
  { grid: null, manualCells: null },
)
const emit = defineEmits<{ 'update:manualCells': [value: PdfManualCells | null] }>()

const input = createDefaultPdfLayoutInput()
const columnsInvalid = ref(false)
const rowsInvalid = ref(false)
const inputError = ref('')
const automaticPlan = computed(() =>
  props.grid ? recommendPdfPagination(props.grid, input) : null,
)
const plan = computed(() => {
  if (!props.grid) return null
  return recommendPdfPagination(props.grid, {
    ...input,
    manualCells: props.manualCells ?? null,
  })
})
const readabilityWarning = computed(() => {
  if (!plan.value) return ''
  const belowMinimum = plan.value.cellSizeMm < input.readableCellMmRange.min
  const labelTooSmall = plan.value.labelFontSizePt <= 4
  if (!belowMinimum && !labelTooSmall) return ''
  return `可读性警告：当前单格 ${plan.value.cellSizeMm.toFixed(2)} mm，色号可能较难辨认；`
})

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
