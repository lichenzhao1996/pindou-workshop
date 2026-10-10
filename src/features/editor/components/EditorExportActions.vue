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
      @click="exportPdfBase"
    >
      {{ isExporting ? '正在生成 PDF…' : '导出 PDF 基础样例' }}
    </button>
    <p v-if="exportError" role="alert" data-testid="export-error">{{ exportError }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '../../../domain/project/types'
import { downloadEffectPreviewPng } from '../../export/png/effect-preview'
import { downloadReferencePng } from '../../export/png/reference-guide'
import { createExportSnapshot } from '../../export/snapshot'

const props = defineProps<{ project: Project | null }>()
const isExporting = ref(false)
const exportError = ref('')

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

async function exportPdfBase() {
  const project = props.project
  if (!project?.grid || isExporting.value) return

  isExporting.value = true
  exportError.value = ''
  try {
    const snapshot = createExportSnapshot(project)
    const { downloadPdfFontSample } = await import('../../export/pdf/font-sample')
    await downloadPdfFontSample(snapshot)
  } catch (error) {
    exportError.value =
      error instanceof Error && error.name === 'PdfChineseFontError'
        ? error.message
        : 'PDF 基础样例生成失败，请稍后重试。'
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
