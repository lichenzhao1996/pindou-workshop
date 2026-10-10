<template>
  <section class="export-actions" aria-label="导出" data-testid="export-actions">
    <button
      type="button"
      data-testid="export-effect-preview-png"
      :disabled="!project?.grid || isExporting"
      @click="exportEffectPreview"
    >
      {{ isExporting ? '正在生成 PNG…' : '导出效果预览 PNG' }}
    </button>
    <button
      type="button"
      data-testid="export-reference-png"
      :disabled="!project?.grid || isExporting"
      @click="exportReferencePng"
    >
      {{ isExporting ? '正在生成 PNG…' : '导出制作参考 PNG' }}
    </button>
    <button
      type="button"
      data-testid="export-pdf-base"
      :disabled="!project?.grid || isExporting"
      @click="exportPdfOverview"
    >
      {{ isExporting ? '正在生成 PDF…' : '导出 PDF 总览页' }}
    </button>
    <button
      type="button"
      data-testid="export-pdf-pagination-preview"
      :disabled="!project?.grid || isExporting"
      @click="exportPdfPaginationPreview"
    >
      {{ isExporting ? '正在生成 PDF…' : '导出 PDF 分页预览' }}
    </button>
    <PdfLayoutSummary v-model:manual-cells="manualCells" :grid="project?.grid ?? null" />
    <p v-if="exportError" role="alert" data-testid="export-error">{{ exportError }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Project } from '../../../domain/project/types'
import { downloadEffectPreviewPng } from '../../export/png/effect-preview'
import { downloadReferencePng } from '../../export/png/reference-guide'
import { createExportSnapshot } from '../../export/snapshot'
import {
  PDF_MANUAL_COLUMNS_EXPORT_OPTION,
  PDF_MANUAL_ROWS_EXPORT_OPTION,
  type PdfManualCells,
} from '../../export/pdf/layout'
import PdfLayoutSummary from './PdfLayoutSummary.vue'

const props = defineProps<{ project: Project | null }>()
const isExporting = ref(false)
const exportError = ref('')
const manualCells = ref<PdfManualCells | null>(null)

watch(
  () => props.project?.projectId,
  () => {
    manualCells.value = null
  },
)

async function exportEffectPreview() {
  const project = props.project
  if (!project?.grid || isExporting.value) return

  isExporting.value = true
  exportError.value = ''
  try {
    const snapshot = createExportSnapshot(project)
    await downloadEffectPreviewPng(snapshot)
  } catch {
    exportError.value = '效果预览 PNG 导出失败，请稍后重试。'
  } finally {
    isExporting.value = false
  }
}

async function exportReferencePng() {
  const project = props.project
  if (!project?.grid || isExporting.value) return

  isExporting.value = true
  exportError.value = ''
  try {
    const snapshot = createExportSnapshot(project)
    await downloadReferencePng(snapshot)
  } catch {
    exportError.value = '制作参考 PNG 导出失败，请稍后重试。'
  } finally {
    isExporting.value = false
  }
}

async function exportPdfOverview() {
  const project = props.project
  if (!project?.grid || isExporting.value) return

  isExporting.value = true
  exportError.value = ''
  try {
    const snapshot = createExportSnapshot(project)
    const { downloadPdfOverview } = await import('../../export/pdf/overview')
    await downloadPdfOverview(snapshot)
  } catch (error) {
    exportError.value =
      error instanceof Error && error.name === 'PdfChineseFontError'
        ? error.message
        : 'PDF 基础样例生成失败，请稍后重试。'
  } finally {
    isExporting.value = false
  }
}

async function exportPdfPaginationPreview() {
  const project = props.project
  if (!project?.grid || isExporting.value) return

  isExporting.value = true
  exportError.value = ''
  try {
    const snapshot = createExportSnapshot(project, {
      [PDF_MANUAL_COLUMNS_EXPORT_OPTION]: manualCells.value?.columns ?? null,
      [PDF_MANUAL_ROWS_EXPORT_OPTION]: manualCells.value?.rows ?? null,
    })
    const { downloadPdfPaginationPreview } = await import('../../export/pdf/pagination-preview')
    await downloadPdfPaginationPreview(snapshot)
  } catch (error) {
    exportError.value =
      error instanceof Error && error.name === 'PdfChineseFontError'
        ? error.message
        : 'PDF 分页预览生成失败，请稍后重试。'
  } finally {
    isExporting.value = false
  }
}
</script>

<style scoped>
.export-actions {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

button {
  justify-self: start;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-action);
  border-radius: var(--radius-sm);
  background: var(--color-action);
  color: var(--color-on-action, #fff);
  cursor: pointer;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

p {
  margin: 0;
  color: var(--color-error, #a22);
  font-size: var(--font-size-sm);
}
</style>
